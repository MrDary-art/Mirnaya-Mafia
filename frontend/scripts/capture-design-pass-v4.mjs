import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const phase = process.argv[2] || "baseline";
const output = resolve(`../docs/design/design-pass-v4/${phase}`);
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

async function capture(name, path, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${appUrl}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
  return { name, path, heading: await page.locator("h1").first().textContent().catch(() => null), errors: errors.splice(0) };
}

try {
  const results = [];
  results.push(await capture("login-desktop", "/login", 1440, 900));
  results.push(await capture("login-mobile", "/login", 390, 844));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Логин").fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`, { timeout: 15000 });
  for (const [name, path] of [
    ["home-desktop", "/app"],
    ["ai-desktop", "/ai"],
    ["setup-desktop", "/setup?mode=online"],
    ["scenarios-desktop", "/scenarios"],
    ["training-desktop", "/training"],
    ["rooms-desktop", "/rooms"],
    ["profile-desktop", "/profile"],
  ]) results.push(await capture(name, path, 1440, 900));
  for (const [name, path] of [
    ["home-mobile", "/app"],
    ["ai-mobile", "/ai"],
    ["setup-mobile", "/setup?mode=online"],
    ["scenarios-mobile", "/scenarios"],
  ]) results.push(await capture(name, path, 390, 844));
  console.log(JSON.stringify({ phase, output, results }, null, 2));
} finally {
  await browser.close();
}
