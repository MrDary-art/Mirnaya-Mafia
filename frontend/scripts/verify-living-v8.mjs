import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = resolve("../docs/design/living-world-v8/evidence/current");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/`, { timeout: 15000 });
  await page.locator(".forest-journey").waitFor({ state: "visible" });

  const control = page.locator(".forest-motion-control:not(.forest-motion-control-menu)");
  await control.locator(".forest-settings-extra summary").click();
  await control.locator("select[id$='-time']").selectOption("solar-location");
  await control.locator("select[id$='-city']").selectOption("tromso");
  await control.locator("select[id$='-quality']").selectOption("economy");
  await control.locator("select[id='forest-motion-mode']").selectOption("static");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("arena_forest_environment_v8")));
  assert.equal(saved.cityId, "tromso");
  assert.equal(saved.timeMode, "solar-location");
  assert.equal(saved.quality, "economy");
  assert.equal(saved.motion, "static");
  checks.push({ name: "independent settings persisted", ok: true });

  await page.goto(`${appUrl}/practice`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-route-backdrop").waitFor({ state: "visible" });
  assert.equal(await page.locator(".forest-route-backdrop").getAttribute("data-forest-motion"), "static");
  checks.push({ name: "work route remains static with persisted environment", ok: true });
  await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-journey").waitFor({ state: "visible" });
  await control.locator(".forest-settings-extra summary").click();
  assert.equal(await control.locator("select[id$='-city']").inputValue(), "tromso");
  await control.locator("select[id$='-time']").selectOption("manual");
  await control.locator("select[id$='-phase']").selectOption("day");
  await control.locator("select[id='forest-motion-mode']").selectOption("full");
  await control.locator(".forest-settings-extra summary").click();
  checks.push({ name: "route navigation retains selected city", ok: true });

  const sizes = [[1920, 1080], [2560, 1440], [3840, 2160]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.locator('.forest-panel[data-forest-scene="hero"] .forest-panel-image').evaluate((image) => image.decode());
    await page.waitForTimeout(300);
    const measure = await page.evaluate(() => {
      const image = document.querySelector('.forest-panel[data-forest-scene="hero"] .forest-panel-image');
      const rect = image.getBoundingClientRect();
      const canvas = document.querySelector(".forest-ambient-canvas");
      return { natural: [image.naturalWidth, image.naturalHeight], displayed: [rect.width, rect.height],
        canvas: [canvas.width, canvas.height], horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(measure.horizontalOverflow, false);
    await page.screenshot({ path: resolve(output, `desktop-hero-${width}x${height}.png`) });
    checks.push({ name: `desktop ${width}x${height}`, ok: true, ...measure });
  }
  assert.deepEqual(errors, []);
  checks.push({ name: "desktop page errors", ok: true, errors });
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    reducedMotion: "reduce" });
  const mobilePage = await mobile.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  await mobilePage.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  const initial = await mobilePage.locator(".forest-login-world").getAttribute("data-forest-motion");
  assert.equal(initial, "static");
  await mobilePage.locator(".arena-auth-submit").click();
  await mobilePage.waitForURL(`${appUrl}/`, { timeout: 15000 });
  assert.equal(await mobilePage.locator(".forest-journey").getAttribute("data-forest-motion"), "static");
  await mobilePage.screenshot({ path: resolve(output, "mobile-hero-390x844-dpr2-reduced.png") });
  checks.push({ name: "mobile DPR2 initial reduced motion", ok: true, errors: mobileErrors,
    horizontalOverflow: await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  assert.deepEqual(mobileErrors, []);
  await mobile.close();
} finally {
  await browser.close();
}
await writeFile(resolve(output, "verification.json"), `${JSON.stringify(checks, null, 2)}\n`);
console.log(JSON.stringify(checks, null, 2));
