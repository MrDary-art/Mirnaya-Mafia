import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.LAB_QA_URL || "http://127.0.0.1:5176";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "QA only runs locally");
const output = resolve("../.cache/game-lab/qa");
await mkdir(output, { recursive: true });

const registration = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: `lab-qa-${Date.now()}`, password: "game-lab-local-only", avatar_code: "avatar_analyst" }),
});
const auth = await registration.json();
assert.equal(registration.status, 200, JSON.stringify(auth));

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
await context.addInitScript((token) => localStorage.setItem("arena_token", token), auth.access_token);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

async function stable() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector(".nova-page-wrap"));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function capture(name, fullPage = false) {
  await stable();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage });
}

try {
  await page.goto(`${base}/lab`);
  await page.locator(".lab-feature").waitFor();
  assert.equal(await page.locator(".lab-feature").count(), 1, "The Lab opens with one focused trainer");
  assert.equal(await page.locator(".lab-feature .lab-character-layer.is-current").evaluate((image) => image.complete && image.naturalWidth > 1000), true);
  await capture("01-lab-desktop", true);

  await page.locator(".lab-feature").click();
  await page.waitForURL("**/lab/red-zone");
  await page.locator(".lab-case-row").first().waitFor();
  assert.equal(await page.locator(".lab-case-row").count(), 5, "Five authored cases are visible");
  assert.equal(await page.locator(".lab-case-row .lab-character").count(), 5, "Every case has its own character");
  assert.equal(new Set(await page.locator(".lab-case-row .lab-character-layer.is-current").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")))).size, 5);
  const portraitSources = await page.locator(".lab-case-row .lab-character-layer.is-current").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
  const emotionSources = portraitSources.flatMap((source) => [source, source.replace(".webp", "-receptive.webp"), source.replace(".webp", "-escalated.webp")]);
  const emotionWidths = await page.evaluate((sources) => Promise.all(sources.map((source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => reject(new Error(`Failed to load ${source}`));
    image.src = source;
  }))), emotionSources);
  assert(emotionWidths.every((width) => width > 1000), "All fifteen sharp emotion portraits load");
  await capture("02-cases-desktop", true);

  await page.locator(".lab-case-row").first().getByRole("button").click();
  await page.waitForURL(/\/lab\/red-zone\/play\//);
  await page.locator(".lab-game, .lab-result").first().waitFor();
  await page.locator(".lab-game").waitFor();
  assert.equal(await page.locator(".product-page-back:visible").count(), 0, "Player has no duplicate back button");
  assert.equal(await page.locator(".lab-choices button").count(), 3);
  assert.equal(await page.locator(".lab-metrics .lab-metric").count(), 4);
  assert.match(await page.locator(".lab-scene .lab-character-layer.is-current").getAttribute("src"), /viktor\.webp$/);
  const layout = await page.evaluate(() => {
    const dialogue = document.querySelector(".lab-dialogue p");
    const choices = document.querySelector(".lab-actions");
    const metrics = document.querySelector(".lab-metrics");
    const character = document.querySelector(".lab-scene .lab-character-layer.is-current");
    return {
      dialogueOverflow: getComputedStyle(dialogue).overflowY,
      dialogueFits: dialogue.scrollHeight <= dialogue.clientHeight + 1,
      metricsBelowChoices: metrics.getBoundingClientRect().top >= choices.getBoundingClientRect().bottom - 1,
      characterLoaded: character.complete && character.naturalWidth > 1000,
    };
  });
  assert.equal(layout.dialogueFits, true, "Dialogue is fully visible");
  assert(!["auto", "scroll"].includes(layout.dialogueOverflow), "Dialogue has no inner scrollbar");
  assert.equal(layout.metricsBelowChoices, true, "Metrics stay below the choices");
  assert.equal(layout.characterLoaded, true, "Sharp character asset is loaded");
  await capture("03-player-desktop");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    window.__labEmotionTransition = null;
    const character = document.querySelector(".lab-scene .lab-character");
    const observer = new MutationObserver(() => {
      const outgoing = character.querySelector(".lab-character-layer.is-previous");
      const incoming = character.querySelector(".lab-character-layer.is-current.is-entering");
      if (outgoing && incoming) {
        window.__labEmotionTransition = {
          incomingDuration: getComputedStyle(incoming).animationDuration,
          outgoingDuration: getComputedStyle(outgoing).animationDuration,
        };
        observer.disconnect();
      }
    });
    observer.observe(character, { childList: true, subtree: true });
  });
  await page.locator(".lab-choices button").first().click();
  await page.locator(".lab-dialogue.is-reaction").waitFor();
  assert.equal(await page.locator(".lab-choices").count(), 0, "Choice analysis is not inserted into the story");
  assert.equal(await page.getByRole("button", { name: "Продолжить" }).count(), 1);
  assert.equal(await page.locator(".lab-metrics .lab-metric").count(), 4);
  await page.locator(".lab-emotion-status.is-receptive").waitFor();
  assert.match(await page.locator(".lab-scene .lab-character-layer.is-current").getAttribute("src"), /viktor-receptive\.webp$/);
  assert.deepEqual(await page.evaluate(() => window.__labEmotionTransition), {
    incomingDuration: "0.36s",
    outgoingDuration: "0.36s",
  }, "Emotion change crossfades both portrait layers");
  await page.waitForFunction(() => !document.querySelector(".lab-scene .lab-character-layer.is-previous"));
  await capture("04-reaction-desktop");

  await page.locator(".lab-continue").click();
  await page.locator(".lab-dialogue.is-decision").waitFor();
  assert.equal(await page.locator(".lab-choices button").count(), 3);
  await page.locator(".lab-choices button").nth(1).click();
  await page.locator(".lab-emotion-status.is-escalated").waitFor();
  assert.match(await page.locator(".lab-scene .lab-character-layer.is-current").getAttribute("src"), /viktor-escalated\.webp$/);
  await page.waitForFunction(() => !document.querySelector(".lab-scene .lab-character-layer.is-previous"));
  await capture("05-escalated-desktop");
  await page.locator(".lab-continue").click();
  await page.locator(".lab-dialogue.is-decision").waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".lab-game").waitFor();
  assert.equal(await page.locator(".nova-mobile-nav:visible, .nova-account-actions:visible").count(), 0);
  assert.equal(await page.locator(".lab-dialogue p").evaluate((node) => node.scrollHeight <= node.clientHeight + 1), true);
  await capture("05-player-mobile", true);

  await page.goto(`${base}/lab/red-zone`);
  await page.locator(".lab-case-row").first().waitFor();
  assert.equal(await page.locator(".nova-mobile-nav:visible, .nova-account-actions:visible").count(), 0);
  await capture("06-cases-mobile", true);

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator(".lab-case-row").first().getByRole("button").click();
  await page.waitForURL(/\/lab\/red-zone\/play\//);
  await page.locator(".lab-game, .lab-result").first().waitFor();
  for (let step = 0; step < 14 && !(await page.locator(".lab-result").count()); step++) {
    await page.waitForFunction(() => document.querySelector(".lab-result") || document.querySelector(".lab-choices button:not(:disabled)") || document.querySelector(".lab-continue:not(:disabled)"));
    if (await page.locator(".lab-result").count()) break;
    const choice = page.locator(".lab-choices button:not(:disabled)").first();
    if (await choice.count()) await choice.click();
    else await page.locator(".lab-continue:not(:disabled)").click();
  }
  await page.locator(".lab-result").waitFor();
  assert.equal(await page.locator(".lab-result .lab-metric").count(), 4, "Result keeps the four canonical metrics");
  assert((await page.locator(".lab-techniques span").count()) <= 4, "Result keeps the technique summary compact");
  assert.equal(await page.getByText("+2 звезды").count(), 1, "First completion reward is visible");
  await capture("07-result-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await capture("08-result-mobile", true);

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: output, errors }, null, 2));
} finally {
  await browser.close();
}
