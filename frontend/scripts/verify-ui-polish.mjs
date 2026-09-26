import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-webgl"],
});
await mkdir("../.cache/ui-polish", { recursive: true });

try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "demo", password: "demo" } });
    assert.equal(login.status(), 200);
    const { access_token } = await login.json();
    await context.addInitScript((token) => localStorage.setItem("arena_token", token), access_token);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push({ path: new URL(page.url()).pathname, message: error.message }));
    const routes = ["/ai", "/rooms", "/rooms/demo", "/scenarios", "/training", "/theory", "/company", "/analytics", "/history", "/people", "/profile"];
    const results = [];
    for (const path of routes) {
      await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      await page.locator("#main-content h1").first().waitFor({ timeout: 12000 });
      const back = page.getByRole("button", { name: /^Назад/ }).first();
      await back.waitFor();
      const geometry = await page.evaluate(() => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        firstHeadingTop: Math.round(document.querySelector("#main-content h1").getBoundingClientRect().top),
      }));
      assert.equal(geometry.overflow, 0, `${path} overflows at ${width}px`);
      assert.ok(geometry.firstHeadingTop < height * .62, `${path} starts too low at ${width}px`);
      results.push({ path, ...geometry });
      if (["/rooms", "/company", "/profile"].includes(path)) {
        await page.screenshot({ path: `../.cache/ui-polish/${path.slice(1)}-${width}.png` });
      }
    }
    await page.goto(`${base}/rooms/demo`);
    await page.getByRole("button", { name: /^Назад/ }).first().click();
    await page.waitForURL(`${base}/rooms`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, routes: results, directLinkBack: true, pageErrors: errors }));
    await context.close();
  }
} finally {
  await browser.close();
}
