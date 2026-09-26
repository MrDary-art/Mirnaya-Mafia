import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = resolve("../docs/design/qa");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem("arena_token", "visual-qa"));
await context.route("**/api/**", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(route.request().url().endsWith("/auth/me")
    ? { username: "visual-qa", is_admin: false, level: 1, stars: 0, xp: 0 }
    : { daily_challenge: { minutes: 3, reward: 2 } }),
}));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`${appUrl}/app`, { waitUntil: "domcontentloaded" });
  await Promise.race([
    page.locator(".arena-auth-card").waitFor({ state: "visible" }),
    page.locator(".nova-home-world").waitFor({ state: "visible" }),
  ]);
  if (await page.locator(".arena-auth-card").isVisible()) {
    await page.getByLabel("Логин").fill("demo");
    await page.getByLabel("Пароль").fill("demo");
    await page.locator(".arena-auth-submit").click();
  }
  await page.locator(".nova-home-world").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".nova-owl-fallback").waitFor({ state: "detached", timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: resolve(output, "home-desktop.png") });
  const webgl = await page.locator(".nova-experience canvas").count();
  const fallback = await page.locator(".nova-owl-fallback").count();
  await page.evaluate(() => { window.__arenaCanvas = document.querySelector(".nova-experience canvas"); });

  await page.locator("#ai .nova-button").click();
  await page.locator(".mode-card").first().waitFor({ state: "visible" });
  await page.screenshot({ path: resolve(output, "ai-transition-early.png") });
  await page.waitForTimeout(1300);
  const canvasPersisted = await page.evaluate(() => window.__arenaCanvas === document.querySelector(".nova-experience canvas"));
  await page.screenshot({ path: resolve(output, "ai-entry-desktop.png") });
  await page.goBack();
  await page.locator(".nova-home-world").waitFor({ state: "visible" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: resolve(output, "home-mobile.png") });
  await page.getByRole("button", { name: "Ещё" }).click();
  await page.screenshot({ path: resolve(output, "more-mobile.png") });

  const source = await readFile(resolve("../docs/design/home-reference.png"));
  const implementation = await readFile(resolve(output, "home-desktop.png"));
  const compare = await context.newPage();
  await compare.setViewportSize({ width: 2880, height: 1100 });
  await compare.setContent(`<html><body style="margin:0;background:#07090a;display:flex;align-items:start;gap:0"><img style="width:1440px;height:1024px;object-fit:contain" src="data:image/png;base64,${source.toString("base64")}"><img style="width:1440px;height:1024px;object-fit:contain" src="data:image/png;base64,${implementation.toString("base64")}"></body></html>`);
  await compare.screenshot({ path: resolve(output, "home-comparison.png") });
  await compare.close();
  if (webgl !== 1 || !canvasPersisted || fallback !== 0 || errors.length) {
    throw new Error(`Design smoke check failed: ${JSON.stringify({ webgl, canvasPersisted, fallback, errors })}`);
  }
  console.log(JSON.stringify({ url: appUrl, screenshots: output, webglCanvas: webgl, canvasPersisted, fallbackImage: fallback, errors }, null, 2));
} finally {
  await browser.close();
}
