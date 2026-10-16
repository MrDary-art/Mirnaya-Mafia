// Run against an isolated local backend; creates one dedicated QA account.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.SERIAL_QA_URL || 'http://127.0.0.1:5180';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'QA only runs locally');
const output = resolve('../.cache/arena-serial/qa/distilled');
await mkdir(output, { recursive: true });
const registration = await fetch(`${base}/api/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: `serial-qa-${Date.now()}`, password: 'serial-qa-local-only', avatar_code: 'avatar_analyst' }),
});
const auth = await registration.json();
assert.equal(registration.status, 200, JSON.stringify(auth));
await writeFile(resolve(output, 'auth.json'), JSON.stringify(auth));

const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript((token) => {
  localStorage.setItem('arena_token', token);
  localStorage.setItem('arena_serial_reading', JSON.stringify({ coach: true }));
}, auth.access_token);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const headers = { Authorization: `Bearer ${auth.access_token}` };

async function api(path) {
  const response = await fetch(`${base}${path}`, { headers });
  assert(response.ok, `GET ${path}: ${response.status}`);
  return response.json();
}
async function settled() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const wrap = document.querySelector('.nova-page-wrap');
    if (!wrap) return false;
    const expected = innerWidth <= 767 ? 0 : document.querySelector('.nova-shell--rail-compact') ? 76 : 224;
    return Math.abs(Number.parseFloat(getComputedStyle(wrap).marginLeft) - expected) < 0.1;
  });
}
async function resizePage(width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(({ expectedWidth, expectedHeight }) => (
    innerWidth === expectedWidth && innerHeight === expectedHeight
  ), { expectedWidth: width, expectedHeight: height });
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
  }));
}
async function capture(name, fullPage = false) {
  await settled();
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
}
async function openMenu() {
  await page.getByRole('button', { name: 'Меню эпизода', exact: true }).click();
  await page.getByRole('dialog', { name: 'Меню' }).waitFor();
}
async function startBriefIfVisible() {
  const brief = page.locator('.serials-briefing');
  if (await brief.count()) {
    await page.getByRole('button', { name: 'Начать', exact: true }).click();
    await page.locator('.serials-dialogue').waitFor();
  }
}
async function waitForRevision(runId, revision) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const current = await api(`/api/serials/runs/${runId}`);
    if (current.run.revision > revision) return current;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  assert.fail('Action advanced revision');
}

try {
  await page.goto(`${base}/serials`);
  await page.locator('.serials-featured').waitFor();
  let catalog;
  for (let attempt = 0; attempt < 30; attempt++) {
    catalog = await api('/api/serials');
    if (catalog.welcome_claimed) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  assert(catalog.welcome_claimed, 'Welcome stars are granted without an extra library action');
  assert.equal(catalog.stories.length, Number(process.env.SERIAL_QA_EXPECT_STORIES || 5));
  assert(catalog.stories.every((story) => story.learning?.version === 1 && story.episodes.every((episode) => episode.learning?.objective)), 'Every episode has an authored learning goal');
  assert.equal(await page.locator('.serials-story-card').count(), catalog.stories.length);
  assert.equal(await page.getByText(/^\d{1,2}\+$/).count(), 0, 'Library does not expose age ratings');
  assert.equal(await page.locator('.serial-learning-intro, .serials-welcome, .serials-tabs, .serials-search, .serials-filters, .serials-library-note').count(), 0, 'Library has no tutorial, reward prompt, tabs, search, filters or footer note');
  const portraitOwners = new Map();
  for (const story of catalog.stories) for (const character of story.characters) {
    assert(!portraitOwners.has(character.portrait), `${story.id} does not reuse ${portraitOwners.get(character.portrait)} portrait ${character.portrait}`);
    portraitOwners.set(character.portrait, story.id);
  }
  const portraitRendering = await page.locator('.serials-art-character').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundImage, mask: style.maskImage || style.webkitMaskImage, filter: style.filter, transform: style.transform };
  });
  assert.match(portraitRendering.background, /characters-atlas-v5\.png/, 'Characters use the clarity-refined atlas');
  assert.match(portraitRendering.mask, /characters-atlas-v4\.webp/, 'Characters retain the cleaned transparent cutout mask');
  assert.equal(portraitRendering.filter, 'none', 'Characters are not softened by a CSS filter');
  assert.equal(portraitRendering.transform, 'none', 'Characters are not resampled through a transform');
  await capture('01-library-desktop', true);
  for (const width of [390, 320]) {
    await resizePage(width, 844);
    assert.equal(await page.locator('.nova-mobile-nav:visible, .nova-account-actions:visible').count(), 0, 'Serial library keeps shared mobile chrome out of the content');
    await capture(`02-library-${width}`, true);
  }

  await page.goto(`${base}/serials/after_school`);
  await page.locator('.serials-story-hero').waitFor();
  const qaStory = catalog.stories.find((story) => story.id === 'after_school');
  assert(qaStory, 'QA story exists in the catalog');
  assert.equal(await page.locator('.product-page-back:visible, .serials-story-page .serials-back:visible').count(), 1, 'Story page exposes one visible back action');
  assert.equal(await page.locator('.serials-story-page .serials-back').count(), 0, 'Story page does not duplicate shell navigation');
  assert.equal(await page.locator('.serials-season-content').count(), 1, 'Story page contains one compact season list');
  assert.equal(await page.getByText(/^\d{1,2}\+$/).count(), 0, 'Story page does not expose age ratings');
  assert.equal(await page.locator('.serial-learning-brief, .serial-learning-season, .serials-story-aside, .serials-character-list, .serials-story-endings').count(), 0, 'Story page has no syllabus, instructions, character catalog or ending catalog');
  assert.equal(await page.locator('.serials-episode-row').count(), qaStory.episodes.length, 'Every episode has one compact row');
  assert.equal(await page.locator('.serials-episode-row.is-locked').count(), qaStory.episodes.length - 1, 'Only the first episode is revealed before play');
  assert.equal(await page.getByRole('button', { name: /^Открыть серию 1:/ }).count(), 1, 'The whole first episode row starts a new story');
  assert.equal(await page.locator('.serials-episode-copy h3').first().textContent(), qaStory.episodes[0].title.replace(/^\s*\d+\.\s*/, ''), 'The first title is revealed without duplicate numbering');
  assert((await page.locator('.serials-episode-copy h3').allTextContents()).slice(1).every((title) => title === 'Название откроется позже'), 'Future episode titles stay hidden');
  assert.equal(await page.locator('.serials-perspective').count(), 1, 'The alternate perspective is separate from the main season');
  assert.equal(await page.locator('.nova-mobile-nav:visible, .nova-account-actions:visible').count(), 0, 'Serial season keeps shared mobile chrome out of the content');
  await capture('03-story-320', true);
  await resizePage(1440, 1000);
  await capture('04-story-desktop', true);
  await page.getByRole('button', { name: 'Начать историю' }).click();
  await page.locator('.serials-briefing').waitFor();
  assert.equal(await page.locator('.product-page-back:visible, .serials-player-header .serials-back:visible').count(), 1, 'Player exposes one visible back action');
  const runId = new URL(page.url()).pathname.split('/').at(-1);

  const brief = page.locator('.serials-episode-brief');
  assert.equal(await page.locator('.serials-dialogue, .serials-choices').count(), 0, 'Dialogue stays hidden until the briefing is accepted');
  assert.equal(await brief.locator('.serials-brief-core > div').count(), 2, 'Briefing contains role and goal');
  assert.equal(await brief.locator('ul, details').count(), 0, 'Briefing contains no nested instructions');
  assert.equal(await page.locator('textarea, .serial-learning-worksheet, .serial-learning-portfolio').count(), 0, 'Manual notes are absent from the player');
  await capture('05-brief-desktop');
  for (const width of [390, 320]) {
    await resizePage(width, 844);
    await capture(`06-brief-${width}`, true);
  }

  await resizePage(1440, 1000);
  await openMenu();
  const episodeMenu = page.getByRole('dialog', { name: 'Меню' });
  assert.equal(await episodeMenu.getByRole('button').count(), 5, 'One close action and four concise episode actions');
  for (const label of ['Серии', 'Включить музыку', 'Настройки чтения', 'Начать заново']) {
    assert.equal(await episodeMenu.getByRole('button', { name: new RegExp(label) }).count(), 1, `${label} is available from the episode menu`);
  }
  await capture('06-menu-desktop');
  await episodeMenu.getByRole('button', { name: /Настройки чтения/ }).click();
  const settings = page.getByRole('dialog', { name: 'Чтение' });
  assert.equal(await settings.getByRole('checkbox').count(), 2);
  await settings.getByRole('checkbox', { name: /Крупный текст/ }).check();
  await page.keyboard.press('Escape');
  await openMenu();
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: /Включить музыку/ }).click();
  await page.getByRole('button', { name: /Выключить музыку/ }).waitFor();
  await page.getByRole('button', { name: /Выключить музыку/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.locator('.serials-dialogue').waitFor();
  assert.equal(await page.getByText(/\d{1,2}\s*(?:лет|год(?:а)?)/i).count(), 0, 'Player does not expose numeric ages');
  assert.equal(await page.locator('.serials-cinema-speaker').count(), 1, 'Scene identifies who is speaking or listening');
  assert.equal(await page.locator('.serials-dialogue-state').count(), 1, 'Dialogue card exposes one explicit turn label');
  assert.equal(await page.locator('.serials-reader-toolbar, .serial-learning-method-link, .serial-learning-brief').count(), 0, 'The reading surface has no extra instruction toolbar');
  await capture('07-player-desktop');
  await resizePage(390, 844);
  await capture('08-player-390');
  await resizePage(320, 844);
  await capture('09-player-320');
  await resizePage(1440, 1000);

  let purchased = false;
  let finishedEpisodes = 0;
  let steps = 0;
  let choiceCapture = false;
  let metricsChecked = false;
  let resultsChecked = 0;
  let measuredDecisions = 0;
  let briefingsSeen = 1;
  const continueOffsets = [];

  async function recordContinuePosition() {
    await page.locator('.serials-dialogue-row.has-continue .serials-continue').waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.locator('.serials-continue').evaluate((button) => {
      const row = button.closest('.serials-dialogue-row');
      return {
        position: button.getBoundingClientRect().top - row.getBoundingClientRect().top,
        rowHeight: row.getBoundingClientRect().height,
        dialogueHeight: button.closest('.serials-dialogue').getBoundingClientRect().height,
        mobile: matchMedia('(max-width: 650px)').matches,
      };
    });
    continueOffsets.push({ width: page.viewportSize().width, ...layout });
  }

  async function assertDialogueFullyVisible() {
    const layout = await page.locator('.serials-dialogue > p').evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
      text: element.textContent,
    }));
    assert(!['auto', 'scroll'].includes(layout.overflowY), `Dialogue text never uses an inner scrollbar: ${JSON.stringify(layout)}`);
    assert(layout.scrollHeight <= layout.clientHeight + 1, `Dialogue text is fully visible: ${JSON.stringify(layout)}`);
  }

  while (steps++ < 180) {
    let data = await api(`/api/serials/runs/${runId}`);
    if (data.run.status !== 'active') {
      finishedEpisodes++;
      await page.locator('.serials-finale').waitFor();
      assert(data.practice_report.decision_count >= 6, 'Every episode contains substantial negotiation practice');
      const result = page.locator('.serials-finale .serial-result');
      await result.waitFor();
      assert.equal(await page.locator('.serials-finale .serials-metrics meter').count(), 4, 'Result shows four final metrics inline');
      assert.equal(await page.locator('.serials-finale .serial-result-decisions, .serials-finale textarea, .serials-finale details').count(), 0, 'Result contains only the outcome and metrics');
      resultsChecked++;
      if (finishedEpisodes === 1) {
        await capture('13-episode-result', true);
        for (const width of [390, 320]) {
          await resizePage(width, 844);
          await capture(`13-episode-result-${width}`);
        }
        await resizePage(1440, 1000);
      }
      const next = page.getByRole('button', { name: /Следующая серия/ });
      if (await next.count()) {
        await next.click();
        await page.locator('.serials-briefing').waitFor();
        briefingsSeen++;
        if (finishedEpisodes === 1) {
          const seasonPage = await context.newPage();
          seasonPage.on('pageerror', (pageError) => errors.push(pageError.message));
          await seasonPage.goto(`${base}/serials/after_school`);
          await seasonPage.locator('.serials-season-content').waitFor();
          assert.equal(await seasonPage.locator('.serials-episode-row.is-current').count(), 1, 'The active episode has one clear current state');
          const currentEpisodeAction = seasonPage.getByRole('button', { name: /^Продолжить серию 2:/ });
          assert.equal(await currentEpisodeAction.count(), 1, 'The whole active episode row exposes one direct continue action');
          assert.equal(await seasonPage.locator('.serials-episode-copy h3').filter({ hasText: /^\d+\./ }).count(), 0, 'Episode titles never repeat their sequence number');
          await seasonPage.screenshot({ path: resolve(output, '17-season-current.png'), fullPage: true });
          assert(await seasonPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Current season has no horizontal overflow');
          await seasonPage.setViewportSize({ width: 390, height: 844 });
          await seasonPage.screenshot({ path: resolve(output, '17-season-current-390.png'), fullPage: true });
          assert(await seasonPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Current mobile season has no horizontal overflow');
          await currentEpisodeAction.click();
          await seasonPage.waitForURL(new RegExp(`/serials/play/${runId}$`));
          await seasonPage.close();
        }
        await startBriefIfVisible();
        continue;
      }
      if (!data.episode.bonus) {
        await capture('14-season-ending', true);
        await page.getByRole('button', { name: /Другая сторона/ }).click();
        const episodes = page.getByRole('dialog', { name: 'Серии' });
        const open = episodes.getByRole('button', { name: /^Открыть/ });
        await open.last().click();
        await page.locator('.serials-briefing').waitFor();
        briefingsSeen++;
        await startBriefIfVisible();
        continue;
      }
      break;
    }

    await startBriefIfVisible();
    data = await api(`/api/serials/runs/${runId}`);
    await page.waitForFunction((text) => document.querySelector('.serials-dialogue > p')?.textContent === text, data.scene.dialogue?.[0]?.text);
    await assertDialogueFullyVisible();
    const lines = data.scene.dialogue?.length || 1;
    for (let line = 1; line < lines; line++) {
      const previous = await page.locator('.serials-dialogue > p').textContent();
      await recordContinuePosition();
      await page.locator('.serials-continue').click();
      await page.waitForFunction((text) => document.querySelector('.serials-dialogue > p')?.textContent !== text, previous);
      await assertDialogueFullyVisible();
    }
    assert.equal(await page.locator('.serial-learning-feedback, .serial-learning-prompt, textarea').count(), 0, 'Turn reviews and notes never interrupt the scene');

    if (data.feedback?.applied_effects) {
      measuredDecisions++;
      const metrics = page.getByRole('complementary', { name: 'Показатели переговоров', exact: true });
      await metrics.waitFor();
      assert.equal(await metrics.locator('xpath=ancestor::*[contains(@class, "serials-conversation-column")]').count(), 1, 'Metrics stay in the conversation column');
      assert(await metrics.evaluate((element) => element.parentElement?.lastElementChild === element), 'Metrics stay at the bottom of the conversation column');
      assert.deepEqual(await metrics.locator('dt').allTextContents(), ['Доверие', 'Цель', 'Инициатива', 'Внимание к чувствам']);
      assert.deepEqual(await metrics.locator('dd > span').allTextContents(), ['trust', 'goal', 'control', 'eq'].map((key) => {
        const delta = data.feedback.applied_effects[key];
        return `${delta > 0 ? '+' : ''}${delta}`;
      }), 'Independent metric panel displays exact server-applied changes');
      if (!metricsChecked) {
        for (const [width, name] of [[1440, '10-metrics-desktop'], [390, '11-metrics-390'], [320, '12-metrics-320']]) {
          await resizePage(width, width === 1440 ? 1000 : 844);
          await page.locator('.serials-dialogue-row').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
          await capture(name);
          const bounds = await metrics.boundingBox();
          assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, 'Metrics remain inside the viewport');
        }
        await resizePage(1440, 1000);
        metricsChecked = true;
      }
    } else assert.equal(await page.locator('.serials-decision-metrics dd > span').count(), 0, 'No metric delta is invented before a decision');

    if (data.scene.choices?.length) {
      assert(await page.locator('.serials-decision-metrics').evaluate((element) => element.previousElementSibling?.classList.contains('serials-choices')), 'Metrics follow the response choices');
      assert.equal(await page.locator('.serials-choice-prompt > span').textContent(), 'Ваш ход', 'Response options identify the player turn');
      assert.equal(await page.locator('.serials-choice-prompt > h2').textContent(), 'Что вы ответите?', 'Response options use a direct conversational prompt');
      if (!choiceCapture) {
        const dialogueChrome = await page.locator('.serials-dialogue-row').evaluate((element) => {
          const style = getComputedStyle(element);
          const marker = getComputedStyle(element, '::before');
          return { left: style.borderLeftWidth, right: style.borderRightWidth, marker: marker.content };
        });
        assert.equal(dialogueChrome.left, dialogueChrome.right, 'Dialogue card uses one quiet border instead of a side accent');
        assert(dialogueChrome.marker === 'none' || dialogueChrome.marker === 'normal', `Dialogue card has no speech-tail frame: ${JSON.stringify(dialogueChrome)}`);
        assert(['Реплика', 'Ваш ответ', 'Описание'].includes(await page.locator('.serials-dialogue-state').textContent()), 'Dialogue type is named explicitly');
        await resizePage(390, 844);
        await page.locator('.serials-choices').scrollIntoViewIfNeeded();
        await capture('15-choices-390');
        await resizePage(1440, 1000);
        await page.evaluate(() => scrollTo(0, 0));
        const choiceBounds = await page.locator('.serials-choices').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return { top: bounds.top, bottom: bounds.bottom, viewport: innerHeight };
        });
        assert(choiceBounds.top >= 0 && choiceBounds.bottom <= choiceBounds.viewport + 1, `Desktop choices stay inside one viewport: ${JSON.stringify(choiceBounds)}`);
        await capture('16-choices-desktop', true);
        choiceCapture = true;
      }
      const premium = data.scene.choices.findIndex((choice) => choice.cost > 0 && choice.available && choice.affordable);
      const index = !purchased && premium >= 0 ? premium : data.scene.choices.findIndex((choice) => !choice.cost && choice.available);
      assert(index >= 0, 'An available free choice exists');
      await page.locator('.serials-choice').nth(index).click();
      if (!purchased && premium >= 0) {
        const confirm = page.getByRole('dialog');
        await confirm.waitFor();
        await confirm.getByRole('button', { name: 'Открыть за 3 ★', exact: true }).click();
        purchased = true;
      }
    } else if (data.scene.ending) await page.getByRole('button', { name: 'Посмотреть результат', exact: true }).click();
    else {
      await recordContinuePosition();
      await page.locator('.serials-continue').click();
    }
    await waitForRevision(runId, data.run.revision);
  }

  assert(steps < 180, 'Season and alternate perspective reach a finite ending');
  assert.equal(finishedEpisodes, 4);
  assert.equal(briefingsSeen, 4);
  assert.equal(resultsChecked, 4);
  assert(purchased, 'Optional permanent scene purchased through confirmation');
  assert(metricsChecked && measuredDecisions >= 24, 'Repeated practice and compact metric changes are exercised');
  for (const width of new Set(continueOffsets.map((entry) => entry.width))) {
    const positions = continueOffsets.filter((entry) => entry.width === width).map((entry) => entry.position);
    const minimum = Math.min(...positions), maximum = Math.max(...positions);
    assert(maximum - minimum <= 1, `Continue button keeps one stable vertical position at ${width}px (${minimum}–${maximum}): ${JSON.stringify(continueOffsets.filter((entry) => entry.width === width))}`);
  }
  const completed = await api(`/api/serials/runs/${runId}`);
  assert.equal(completed.stars, 10, '5 gift + 4 × 2 rewards − 3 extra scene');

  await page.reload();
  await page.locator('.serials-finale').waitFor();
  assert.equal((await api(`/api/serials/runs/${runId}`)).stars, 10, 'Reload never rewards twice');

  await page.goto(`${base}/serials/after_school`);
  await page.locator('.serials-season-content').waitFor();
  assert.equal(await page.locator('.serials-episode-row.is-locked').count(), 0, 'Completing the season reveals every episode title');
  assert.deepEqual(await page.locator('.serials-episode-copy h3').allTextContents(), qaStory.episodes.map((episode) => episode.title.replace(/^\s*\d+\.\s*/, '')), 'Revealed titles match the authored episodes without duplicate numbering');
  await capture('18-season-revealed', true);

  await page.goto(`${base}/profile`);
  await page.locator('.serial-collection').waitFor();
  await page.locator('.serial-collection-results .serial-collection-result').first().waitFor();
  assert.equal(await page.locator('.serial-collection-result-metrics dd').count(), 4, 'Profile exposes automatic case metrics');
  await page.locator('.serial-collection').scrollIntoViewIfNeeded();
  await capture('18-profile-results', true);
  for (const width of [390, 320]) {
    await resizePage(width, 844);
    await page.locator('.serial-collection').scrollIntoViewIfNeeded();
    await capture(`18-profile-results-${width}`, true);
  }
  assert.deepEqual(errors, [], 'No browser errors');

  const result = { stories: catalog.stories.length, finishedEpisodes, purchased, briefingsSeen, resultsChecked, metricsChecked, measuredDecisions, finalStars: completed.stars, steps, browserErrors: errors, output };
  await writeFile(resolve(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
