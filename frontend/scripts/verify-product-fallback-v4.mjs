import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/design-pass-v4/qa-browser");
await mkdir(output, { recursive: true });
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });

async function login(page) {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await login(page);
  await page.evaluate(() => localStorage.setItem("arena_product_effects", "off"));
  await page.goto(`${appUrl}/shop`);
  await page.locator(".shop-item").first().waitFor();
  await page.screenshot({ path: resolve(output, "shop-effects-off.png") });
  const off = await page.locator(".product-static-motif").evaluate((node) => getComputedStyle(node).display !== "none");

  const state = await context.storageState();
  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", storageState: state });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${appUrl}/theory`);
  await reducedPage.locator(".theory-lesson-card").first().waitFor();
  await reducedPage.screenshot({ path: resolve(output, "theory-reduced-mobile.png") });
  const reduced = await reducedPage.locator(".product-static-motif").evaluate((node) => getComputedStyle(node).display !== "none");

  const noWebglContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
  await noWebglContext.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl") return null;
      return native.call(this, kind, ...args);
    };
  });
  const noWebglPage = await noWebglContext.newPage();
  await noWebglPage.goto(`${appUrl}/shop`);
  await noWebglPage.locator(".shop-item").first().waitFor();
  await noWebglPage.waitForTimeout(600);
  await noWebglPage.screenshot({ path: resolve(output, "shop-no-webgl.png") });
  const noWebgl = await noWebglPage.locator(".product-static-motif").evaluate((node) => getComputedStyle(node).display !== "none");
  const heading = await noWebglPage.getByRole("heading", { name: "Коллекция возможностей" }).count();
  console.log(JSON.stringify({ off, reduced, noWebgl, heading }, null, 2));
  if (!off || !reduced || !noWebgl || !heading) process.exitCode = 1;
} finally {
  await browser.close();
}
