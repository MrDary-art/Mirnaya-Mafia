import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/design-pass-v4/route-matrix");
await mkdir(output, { recursive: true });
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`);
  const routes = [
    ["home", "/app"], ["ai", "/ai"], ["job", "/ai/job"], ["setup", "/setup"],
    ["practice", "/practice"], ["scenarios", "/scenarios"], ["rooms", "/rooms"],
    ["training", "/training"], ["theory", "/theory"], ["path", "/training/path"],
    ["learn", "/learn"], ["training-errors", "/training/errors"],
    ["people", "/people"], ["profile", "/profile"], ["shop", "/shop"],
    ["history", "/history"], ["unknown", "/v4-unknown-route"],
  ];
  const results = [];
  for (const [width, height, suffix] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of routes) {
      await page.goto(`${appUrl}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const [heading, overflow, buttons] = await Promise.all([
        page.locator("h1").first().textContent().catch(() => null),
        page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
        page.getByRole("button").count(),
      ]);
      await page.screenshot({ path: resolve(output, `${name}-${suffix}.png`) });
      results.push({ name, path, suffix, heading, overflow, buttons, pageErrors: errors.splice(0) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
