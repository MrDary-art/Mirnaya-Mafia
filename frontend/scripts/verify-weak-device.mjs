import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = resolve("../docs/design/living-world-v8/evidence/current");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-webgl"] });
const result = { profile: "Chrome headless, software WebGL disabled, simulated 2 cores / 2 GB / Save-Data" };
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 2 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 2 });
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/`, { timeout: 15000 });
  await page.locator(".nova-owl-fallback").waitFor({ state: "visible" });
  result.home = {
    motion: await page.locator("#forest-motion-mode").inputValue(),
    quality: await page.locator("#forest-motion-mode-quality").inputValue(),
    timePlaceholderDisabled: await page.locator("#forest-motion-mode-time").isDisabled(),
    owlFallback: await page.locator(".nova-owl-fallback").getAttribute("src"),
    canvas: await page.locator(".forest-ambient-canvas").evaluate((canvas) => [canvas.width, canvas.height]),
    phase: await page.locator(".forest-journey").getAttribute("data-forest-phase"),
  };
  assert.equal(result.home.motion, "static");
  assert.equal(result.home.quality, "economy");
  assert.equal(result.home.timePlaceholderDisabled, true);
  assert.deepEqual(result.home.canvas, [1, 1]);
  await page.screenshot({ path: resolve(output, "weak-device-home.png") });

  const seen = () => page.evaluate(() => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  result.home.resources = (await seen()).filter((path) => /\/assets\/(?:forest2d|owl)/.test(path));
  assert.ok(result.home.resources.filter((path) => /\/(?:hero|ai|rooms|scenarios|learning|history|friends|profile)\.webp$/.test(path)).length <= 2);
  assert.ok(!result.home.resources.some((path) => /\.glb$|three\.module/.test(path)));
  assert.ok(!result.home.resources.some((path) => /sky-mask|sky-cloud/.test(path)));

  for (const path of ["/scenarios", "/training", "/history", "/profile", "/practice"]) {
    const start = Date.now();
    await page.goto(`${appUrl}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator("#main-content h1").first().waitFor({ state: "visible", timeout: 15000 });
    result[path] = { readyMs: Date.now() - start, heading: await page.locator("#main-content h1").first().textContent(),
      motion: await page.locator(".forest-route-backdrop").getAttribute("data-forest-motion") };
  }
  assert.equal(result["/practice"].motion, "static");
  assert.deepEqual(errors, []);
  result.errors = errors;
  await context.close();
} finally {
  await browser.close();
}
await writeFile(resolve(output, "weak-device.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
