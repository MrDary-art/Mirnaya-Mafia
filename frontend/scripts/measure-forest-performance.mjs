import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const isolateCanvas2d = process.env.ARENA_DISABLE_WEBGL === "1";
const browser = await chromium.launch({ executablePath, headless: true,
  args: isolateCanvas2d ? ["--disable-webgl"] : ["--use-angle=swiftshader"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Логин").fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`, { timeout: 15000 });
  await page.goto(`${appUrl}/app?worldDebug=1`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-journey").waitFor({ state: "visible" });
  const results = [];
  for (const mode of ["full", "calm", "static"]) {
    await page.locator("#forest-motion-mode").selectOption(mode);
    await page.waitForTimeout(4200);
    results.push(await page.evaluate(() => ({ mode: document.querySelector(".forest-journey").dataset.forestMotion,
      owlFps: window.__arenaWorldStats?.fps || null, owlFallback: Boolean(document.querySelector(".nova-owl-fallback")),
      forestFps: window.__forestStats?.fps || null, forestP95Ms: window.__forestStats?.p95Ms || null,
      canvasPixels: [document.querySelector(".forest-ambient-canvas").width, document.querySelector(".forest-ambient-canvas").height] })));
  }
  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => /\/assets\/(?:owl|forest2d)|\/src\/pages\//.test(entry.name))
    .map((entry) => ({ path: new URL(entry.name).pathname, transferBytes: entry.transferSize || null })));
  console.log(JSON.stringify({ browser: isolateCanvas2d ? "Chrome headless, WebGL disabled" : "Chrome headless SwiftShader",
    viewport: "1440x900@1", results, resources }, null, 2));
} finally {
  await browser.close();
}
