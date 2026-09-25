import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/forest2d-qa");
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 900 } } });
const login = await context.newPage();
try {
  await login.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await login.getByLabel("Логин").fill("demo");
  await login.getByLabel("Пароль", { exact: true }).fill("demo");
  await login.locator(".arena-auth-submit").click();
  await login.waitForURL(`${appUrl}/`, { timeout: 15000 });
  await login.close();
  const page = await context.newPage();
  await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-journey").waitFor({ state: "visible" });
  await page.locator(".forest-panel-image").first().evaluate((image) => image.decode());
  await page.waitForTimeout(3000);
  await page.locator('.nova-rail [aria-label="Профиль"]').click();
  await page.waitForTimeout(1100);
  await page.locator('[data-home-section="profile"] .nova-button').click();
  await page.waitForURL(`${appUrl}/profile`);
  await page.waitForTimeout(3000);
  await page.locator('.nova-rail [aria-label="ИИ-диалог"]').click();
  await page.waitForURL(`${appUrl}/#ai`);
  await page.locator('[data-home-section="ai"] .nova-button').click();
  await page.waitForURL(`${appUrl}/ai`);
  await page.waitForTimeout(1600);
  await page.locator('.nova-rail [aria-label="Главная"]').click();
  await page.waitForURL(`${appUrl}/`);
  await page.waitForTimeout(1200);
  await page.locator('.nova-rail [aria-label="Сценарии"]').click();
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, -700);
  await page.waitForTimeout(1100);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(1100);
  await page.goBack();
  await page.waitForTimeout(3000);
  const result = { url: page.url(), scrollY: await page.evaluate(() => scrollY),
    panels: await page.locator(".forest-panel").count() };
  await page.close();
  await rename(await page.video().path(), resolve(output, "navigation-and-reverse.webm"));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
