import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012";
assert.equal(process.env.ARENA_QA_DISPOSABLE, "1", "This check creates content: use a disposable QA database");
assert.equal(new URL(base).port, "8012", "Extras QA is restricted to the disposable preview on port 8012");
for (const key of ["ARENA_QA_READER", "ARENA_QA_AUTHOR", "ARENA_QA_MODERATOR", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const output = resolve("../.cache/feed-qa/extras");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const contexts = [], errors = [], checks = [], artifacts = {};
const run = Date.now();
let lastPage;
async function account(key) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); contexts.push(context);
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env[key], password: process.env.ARENA_QA_PASSWORD } });
  assert.ok(login.ok(), `${key} login ${login.status()}`);
  const { access_token } = await login.json();
  // Do not set browser-wide Authorization: UI requests must use the real api()/apiBlob() mechanism.
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const get = path => context.request.get(`${base}${path}`, { headers: { Authorization: `Bearer ${access_token}` } });
  const me = await (await get("/api/auth/me")).json();
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  return { context, page, me, get };
}
async function mutation(page, path, method, action) {
  lastPage = page;
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
  await action(); const result = await pending;
  assert.ok(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`);
  return result.json();
}
async function openMenu(card) { await card.locator("summary[aria-label='Действия с публикацией']").click(); }
async function snapshot(page, name) { await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false }); }
async function check(name, task) {
  if (process.env.ARENA_QA_CHECKS && !process.env.ARENA_QA_CHECKS.split(",").includes(name)) return;
  try { await task(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (failure) { checks.push({ name, passed: false, error: failure.message }); if (lastPage && !lastPage.isClosed()) await snapshot(lastPage, `failure-${name}`).catch(() => {}); console.error(`FAIL ${name}: ${failure.message}`); }
}
try {
  const author = await account("ARENA_QA_AUTHOR"), reader = await account("ARENA_QA_READER"), moderator = await account("ARENA_QA_MODERATOR");
  let draft, pollPost, mediaPost, story, highlight;
  await check("draft-publish-edit-pin", async () => {
    const page = author.page; lastPage = page;
    await page.goto(`${base}/feed`);
    await page.getByLabel("Текст публикации", { exact: true }).fill(`Extras draft ${run}: уточнить условия встречи.`);
    draft = await mutation(page, "/api/social/posts", "POST", () => page.getByRole("button", { name: "Черновик", exact: true }).click());
    artifacts.draft_post_id = draft.id;
    assert.equal(draft.status, "DRAFT");
    assert.equal((await reader.get(`/api/social/posts/${draft.id}`)).status(), 404);
    await page.goto(`${base}/profile`);
    let card = page.locator(`[data-post-id='${draft.id}']`); await card.waitFor();
    await card.getByText("Этот черновик виден только вам.", { exact: true }).waitFor();
    const published = await mutation(page, `/api/social/posts/${draft.id}`, "PATCH", () => card.getByRole("button", { name: "Опубликовать", exact: true }).click());
    assert.equal(published.status, "PUBLISHED");
    assert.equal((await reader.get(`/api/social/posts/${draft.id}`)).status(), 200);
    await openMenu(card); await card.getByRole("button", { name: "Редактировать", exact: true }).click();
    const composer = page.locator(".arena-feed-composer[aria-label='Редактировать публикацию']");
    const editedText = `Extras edited ${run}: согласовать критерии и следующий шаг.`;
    await composer.locator("textarea").fill(editedText);
    await mutation(page, `/api/social/posts/${draft.id}`, "PATCH", () => composer.getByRole("button", { name: "Сохранить", exact: true }).click());
    card = page.locator(`[data-post-id='${draft.id}']`); await card.getByText(editedText, { exact: true }).waitFor();
    await openMenu(card);
    const pinned = await mutation(page, `/api/social/posts/${draft.id}`, "PATCH", () => card.getByRole("button", { name: "Закрепить на стене", exact: true }).click());
    assert.equal(pinned.pinned, true);
    await page.reload(); await card.getByText("Закреплённая публикация", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-post-id]").first().getAttribute("data-post-id"), String(draft.id));
    await snapshot(page, "draft-published-edited-pinned");
  });
  await check("poll-create-vote-change", async () => {
    const page = author.page; lastPage = page;
    await page.goto(`${base}/feed`);
    await page.getByLabel("Текст публикации", { exact: true }).fill(`Extras poll ${run}: с чего начнёте встречу?`);
    await page.getByRole("button", { name: "Опрос", exact: true }).click();
    await page.getByPlaceholder("Вариант 1", { exact: true }).fill("Уточню интересы");
    await page.getByPlaceholder("Вариант 2", { exact: true }).fill("Предложу условия");
    pollPost = await mutation(page, "/api/social/posts", "POST", () => page.getByRole("button", { name: "Опубликовать", exact: true }).click());
    artifacts.poll_post_id = pollPost.id;
    await reader.page.goto(`${base}/feed/post/${pollPost.id}`);
    const poll = reader.page.locator(`[data-post-id='${pollPost.id}'] .arena-feed-poll`);
    const voted = await mutation(reader.page, `/api/social/posts/${pollPost.id}/vote`, "POST", () => poll.getByRole("button", { name: "Уточню интересы", exact: true }).click());
    assert.equal(voted.poll.total_votes, 1); assert.equal(voted.poll.voted_option_id, pollPost.poll.options[0].id);
    const changed = await mutation(reader.page, `/api/social/posts/${pollPost.id}/vote`, "POST", () => poll.getByRole("button", { name: /Предложу условия/ }).click());
    assert.equal(changed.poll.total_votes, 1); assert.equal(changed.poll.voted_option_id, pollPost.poll.options[1].id);
    await reader.page.reload(); await poll.getByRole("button", { name: /Предложу условия/ }).waitFor();
    assert.equal(await poll.getByRole("button", { name: /Предложу условия/ }).getAttribute("aria-pressed"), "true");
    await snapshot(reader.page, "poll-vote-persisted");
  });
  await check("canonical-scenario-attachment", async () => {
    const catalog = await (await author.get("/api/social/attachments?kind=SCENARIO")).json();
    const scenario = catalog.items.find(item => item.kind === "SCENARIO" && item.available); assert.ok(scenario, "Canonical scenario catalog is empty");
    artifacts.scenario_id = scenario.id;
    const page = author.page; lastPage = page;
    await page.goto(`${base}/feed?attach=SCENARIO&id=${encodeURIComponent(scenario.id)}`);
    const composer = page.getByRole("region", { name: "Создать публикацию", exact: true });
    await composer.locator(".arena-feed-content-link").getByText(scenario.title, { exact: true }).waitFor();
    await composer.getByLabel("Текст публикации", { exact: true }).fill(`Extras scenario ${run}`);
    const post = await mutation(page, "/api/social/posts", "POST", () => composer.getByRole("button", { name: "Опубликовать", exact: true }).click());
    artifacts.scenario_post_id = post.id;
    assert.equal(post.linked_content.kind, "SCENARIO"); assert.equal(post.linked_content.id, String(scenario.id));
    await reader.page.goto(`${base}/feed/post/${post.id}`);
    const link = reader.page.locator(`[data-post-id='${post.id}'] .arena-feed-content-link`); await link.waitFor();
    assert.equal(await link.getAttribute("href"), scenario.path);
    await link.click(); assert.ok(!reader.page.url().includes(`/feed/post/${post.id}`));
  });
  await check("video-upload-authenticated-playback", async () => {
    const caps = await (await author.get("/api/social/media/capabilities")).json(); assert.equal(caps.video_enabled, true, caps.video_unavailable_reason);
    const page = author.page; lastPage = page; await page.goto(`${base}/feed`);
    const composer = page.getByRole("region", { name: "Создать публикацию", exact: true });
    await composer.getByLabel("Текст публикации", { exact: true }).fill(`Extras media ${run}`);
    // The input starts in image-only mode until this browser's capability request resolves.
    await composer.getByRole("button", { name: "Фото / видео", exact: true }).waitFor();
    await composer.locator("input[type='file']").setInputFiles(resolve("../.cache/stories-qa/test-video.mp4"));
    await composer.locator("video").waitFor();
    mediaPost = await mutation(page, "/api/social/posts", "POST", () => composer.getByRole("button", { name: "Опубликовать", exact: true }).click());
    artifacts.media_post_id = mediaPost.id; assert.equal(mediaPost.media.length, 1); assert.equal(mediaPost.media[0].kind, "VIDEO");
    await reader.page.goto(`${base}/feed/post/${mediaPost.id}`);
    const card = reader.page.locator(`[data-post-id='${mediaPost.id}']`);
    const downloaded = reader.page.waitForResponse(response => new URL(response.url()).pathname === `/api/social/media/${mediaPost.media[0].id}` && response.request().method() === "GET");
    await card.getByRole("button", { name: /Открыть видео/ }).click();
    const response = await downloaded; assert.equal(response.status(), 200);
    assert.match(response.request().headers().authorization || "", /^Bearer /);
    assert.ok(!response.url().includes("token"), "Media URL must not include a token");
    const video = card.locator("video"); await video.waitFor();
    await video.evaluate(element => element.play());
    await reader.page.waitForFunction(() => { const video = document.querySelector(".arena-feed-private-media video"); return video && video.readyState >= 2 && video.currentTime > 0; });
    const unauthenticated = await reader.context.request.get(`${base}/api/social/media/${mediaPost.media[0].id}`); assert.equal(unauthenticated.status(), 401);
    await snapshot(reader.page, "video-authenticated-playback");
  });
  await check("report-hide-restore-reader-access", async () => {
    assert.ok(draft?.id, "Draft post required"); const reason = `Extras report ${run}: проверка обратимой модерации.`;
    const page = reader.page; lastPage = page; await page.goto(`${base}/feed/post/${draft.id}`);
    const card = page.locator(`[data-post-id='${draft.id}']`); await card.waitFor(); await openMenu(card); await card.getByRole("button", { name: "Пожаловаться", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Что произошло?", { exact: true }).fill(reason);
    await mutation(page, "/api/social/reports", "POST", () => page.getByRole("dialog").getByRole("button", { name: "Отправить жалобу", exact: true }).click());
    await page.getByRole("dialog").getByRole("button", { name: "Понятно", exact: true }).click();
    await moderator.page.goto(`${base}/admin/social`); lastPage = moderator.page;
    const report = moderator.page.locator(".arena-moderation-report").filter({ hasText: reason }); await report.waitFor();
    const reports = await (await moderator.get("/api/admin/social/reports?status=pending")).json(); const item = reports.items.find(item => item.reason === reason); assert.ok(item); artifacts.report_id = item.id;
    await mutation(moderator.page, `/api/admin/social/reports/${item.id}/moderate`, "POST", () => report.getByRole("button", { name: "Скрыть материал", exact: true }).click());
    await page.reload(); await page.getByRole("heading", { name: "Публикация недоступна", exact: true }).waitFor(); assert.equal(await page.locator(`[data-post-id='${draft.id}']`).count(), 0);
    assert.equal((await reader.get(`/api/social/posts/${draft.id}`)).status(), 404);
    await moderator.page.getByRole("button", { name: "Рассмотренные", exact: true }).click(); await report.waitFor();
    await mutation(moderator.page, `/api/admin/social/reports/${item.id}/moderate`, "POST", () => report.getByRole("button", { name: "Восстановить материал", exact: true }).click());
    await page.reload(); await page.locator(`[data-post-id='${draft.id}']`).waitFor();
    assert.equal((await reader.get(`/api/social/posts/${draft.id}`)).status(), 200);
    await snapshot(moderator.page, "moderation-restored");
  });
  await check("story-save-highlight-wall-view", async () => {
    const page = author.page; lastPage = page; await page.goto(`${base}/feed`);
    await page.getByRole("button", { name: /Ваша история/ }).click();
    const text = `Extras story ${run}: сохраняем важный вывод.`;
    await page.getByLabel("Текст истории", { exact: true }).fill(text);
    await page.getByRole("dialog").locator(".arena-feed-audience select").selectOption("PUBLIC");
    story = await mutation(page, "/api/social/stories", "POST", () => page.getByRole("dialog").getByRole("button", { name: "Опубликовать на 24 часа" }).click());
    artifacts.story_id = story.id;
    const firstRead = page.waitForResponse(response => /^\/api\/social\/stories\/\d+$/.test(new URL(response.url()).pathname) && response.request().method() === "GET");
    await page.locator(".arena-social-story-tile:not(.is-create)").filter({ hasText: story.author.display_name || story.author.username }).first().click();
    let currentStory = await (await firstRead).json();
    let dialog = page.getByRole("dialog");
    for (let step = 0; step < 40 && currentStory.id !== story.id; step += 1) {
      await dialog.locator(".arena-social-story-stage").waitFor();
      const nextRead = page.waitForResponse(response => /^\/api\/social\/stories\/\d+$/.test(new URL(response.url()).pathname) && response.request().method() === "GET");
      await dialog.getByRole("button", { name: "Дальше", exact: true }).click(); currentStory = await (await nextRead).json();
    }
    await dialog.getByText(text, { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "В актуальное", exact: true }).click();
    const title = `Extras highlights ${run}`; await dialog.getByLabel("Название", { exact: true }).fill(title);
    highlight = await mutation(page, "/api/social/highlights", "POST", () => dialog.getByRole("button", { name: "Сохранить", exact: true }).click());
    artifacts.highlight_id = highlight.id; await dialog.getByText("История сохранена в актуальном.", { exact: true }).waitFor(); await page.keyboard.press("Escape");
    await page.goto(`${base}/profile`); await page.getByRole("button", { name: "Актуальное", exact: true }).click();
    await page.getByRole("button", { name: `Открыть актуальное: ${title}`, exact: true }).click();
    await page.getByRole("dialog").getByText(text, { exact: true }).waitFor(); await page.keyboard.press("Escape");
    await reader.page.goto(`${base}${story.author.path}`); await reader.page.getByRole("button", { name: "Актуальное", exact: true }).click();
    await reader.page.getByRole("button", { name: `Открыть актуальное: ${title}`, exact: true }).click(); await reader.page.getByRole("dialog").getByText(text, { exact: true }).waitFor();
    await snapshot(reader.page, "reader-highlight-view"); await reader.page.keyboard.press("Escape");
  });
  await check("notification-preferences-persistence", async () => {
    const page = reader.page; lastPage = page; await page.goto(`${base}/feed/notifications`);
    await page.getByText("Какие уведомления получать", { exact: true }).click();
    const original = await (await reader.get("/api/social/preferences")).json();
    const labels = { likes: "Оценки публикаций", comments: "Комментарии и ответы", follows: "Новые подписчики и сохранения подборок", reposts: "Репосты", mentions: "Упоминания", stories: "Ответы на истории" };
    for (const [key, label] of Object.entries(labels)) {
      const result = await mutation(page, "/api/social/preferences", "PUT", () => page.getByLabel(label, { exact: true }).click()); assert.equal(result[key], !original[key]);
    }
    await page.reload(); await page.getByText("Какие уведомления получать", { exact: true }).click();
    for (const [key, label] of Object.entries(labels)) assert.equal(await page.getByLabel(label, { exact: true }).isChecked(), !original[key]);
    await snapshot(page, "notification-preferences");
    for (const [key, label] of Object.entries(labels)) { const result = await mutation(page, "/api/social/preferences", "PUT", () => page.getByLabel(label, { exact: true }).click()); assert.equal(result[key], original[key]); }
  });
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(JSON.stringify({ passed: checks.every(item => item.passed), checks, artifacts, screenshots: output, browser_errors: errors }));
  if (checks.some(item => !item.passed)) process.exitCode = 1;
} finally { for (const context of contexts) await context.close(); await browser.close(); }
