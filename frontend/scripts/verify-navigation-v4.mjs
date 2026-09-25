import assert from "node:assert/strict";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/design-pass-v4/qa-browser");
const videoDir = resolve(output, "videos");
await mkdir(videoDir, { recursive: true });
const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const errors = [];
const results = {};
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/`);
  await page.getByRole("button", { name: /Начать путешествие/ }).click();
  await page.waitForTimeout(1100);
  results.railToAi = await page.evaluate(() => ({ section: document.querySelector(".nova-world-section[id=ai]")?.getBoundingClientRect().top, scrollY: scrollY }));
  await page.screenshot({ path: resolve(output, "home-rail-ai.png") });
  for (const id of ["rooms", "scenarios", "learning", "history", "friends", "profile", "finale"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(130);
  }
  results.finale = await page.evaluate(() => ({ scrollY, max: document.documentElement.scrollHeight - innerHeight }));
  await page.screenshot({ path: resolve(output, "home-finale.png") });
  for (const id of ["profile", "friends", "history", "learning", "scenarios", "rooms", "ai", "hero"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(90);
  }
  results.returnToHero = await page.evaluate(() => scrollY);
  await page.screenshot({ path: resolve(output, "home-return-hero.png") });

  await page.goto(`${base}/#learning`);
  await page.waitForTimeout(800);
  results.directHash = await page.evaluate(() => ({ hash: location.hash, sectionTop: document.querySelector("#learning")?.getBoundingClientRect().top, scrollY }));
  await page.screenshot({ path: resolve(output, "home-direct-hash.png") });
  await page.locator("#learning").getByRole("button", { name: /Открыть путь развития/ }).click();
  await page.waitForURL(`${base}/training`);
  await page.getByRole("heading", { name: "Изучайте и закрепляйте навыки" }).waitFor();
  await page.waitForTimeout(250);
  results.trainingScroll = await page.evaluate(() => scrollY);
  await page.goBack();
  await page.waitForURL(/#learning$/);
  await page.waitForTimeout(400);
  results.popToHome = await page.evaluate(() => ({ hash: location.hash, sectionTop: document.querySelector("#learning")?.getBoundingClientRect().top, scrollY }));
  await page.goForward();
  await page.waitForURL(`${base}/training`);
  await page.getByRole("heading", { name: "Изучайте и закрепляйте навыки" }).waitFor();
  await page.waitForTimeout(250);
  results.forwardScroll = await page.evaluate(() => scrollY);

  await page.goto(`${base}/shop`);
  await page.getByLabel("Эффекты интерфейса").selectOption("off");
  results.off = await page.locator(".product-static-motif").evaluate((el) => getComputedStyle(el).display !== "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Эффекты интерфейса").selectOption("full");
  results.reducedLive = await page.locator(".product-static-motif").evaluate((el) => getComputedStyle(el).display !== "none");
  await page.screenshot({ path: resolve(output, "shop-reduced-live.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(150);
  results.restoredEffects = await page.locator(".product-static-motif").evaluate((el) => getComputedStyle(el).display === "none");
  const lost = await page.evaluate(() => {
    const canvas = document.querySelector(".nova-experience-canvas canvas");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return Boolean(extension);
  });
  await page.waitForTimeout(250);
  results.contextLoss = { extension: lost, fallback: await page.evaluate(() => document.documentElement.dataset.productWorldFallback === "true") };
  await page.screenshot({ path: resolve(output, "shop-context-lost.png") });
  assert.equal(results.off, true);
  assert.equal(results.reducedLive, true);
  assert.equal(results.restoredEffects, true);
  assert.equal(results.trainingScroll, 0);
  assert.equal(results.forwardScroll, 0);
  assert.deepEqual(errors, []);

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 320, height: 720 });
  results.width320 = {};
  for (const route of ["setup", "rooms", "scenarios", "shop", "people"]) {
    await mobile.goto(`${base}/${route}`);
    await mobile.waitForTimeout(200);
    results.width320[route] = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }
  await mobile.screenshot({ path: resolve(output, "people-320.png") });
  await mobile.close();
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await page.close();
  const video = await page.video().path();
  await context.close();
  await browser.close();
  await rename(video, resolve(videoDir, "v4-navigation-and-fallback.webm"));
}
