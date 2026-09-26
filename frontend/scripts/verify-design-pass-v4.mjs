import assert from "node:assert/strict";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/design-pass-v4/qa-browser");
const videoDir = resolve(output, "videos");
await mkdir(videoDir, { recursive: true });
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const errors = [];
const steps = [];
page.on("pageerror", (error) => errors.push(error.message));

async function shot(name) { await page.screenshot({ path: resolve(output, `${name}.png`) }); steps.push(name); }
async function login() {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("wrong-password");
  await page.locator(".arena-auth-submit").click();
  await page.getByRole("alert").waitFor();
  await shot("login-error");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`, { timeout: 15000 });
}

try {
  await login();
  await page.goto(`${appUrl}/ai`);
  await page.getByRole("link", { name: /Настроить разговор/ }).click();
  await page.getByRole("heading", { name: "Настройка сессии" }).waitFor();
  for (const [index, delay] of [0, 155, 310, 465, 620].entries()) {
    if (index) await page.waitForTimeout(delay - [0, 155, 310, 465, 620][index - 1]);
    await shot(`t03-ai-setup-${index * 25}`);
  }
  await page.getByRole("button", { name: /Далее/ }).click();
  assert.match(await page.getByRole("alert").textContent(), /имя/);
  await page.getByLabel("Как к вам обращаться").fill("Тестовый пользователь");
  await page.getByRole("button", { name: /Далее/ }).click();
  await shot("setup-roles");
  await page.getByRole("button", { name: /Далее/ }).click();
  await page.getByLabel("Проблематика").fill("Согласовать сроки проекта");
  await page.getByLabel("Цель").fill("Договориться о сроках без конфликта");
  await page.getByRole("button", { name: /Далее/ }).click();
  await shot("setup-options");
  await page.getByRole("button", { name: /Далее/ }).click();
  await shot("setup-review");
  await page.getByRole("button", { name: "Сохранить пресет" }).click();
  assert.match(await page.getByRole("status").last().textContent(), /сохранён/);

  await page.goto(`${appUrl}/scenarios`);
  await page.locator(".scenario-card button").first().waitFor();
  const first = page.locator(".scenario-card button").first();
  await first.click();
  await page.getByRole("dialog").waitFor();
  await shot("scenario-detail");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.waitForFunction(() => document.activeElement?.matches(".scenario-card button"));
  assert.equal(await first.evaluate((element) => element === document.activeElement), true);
  await page.getByRole("button", { name: /Увольнение без конфликта/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Настроить тренировку/ }).click();
  await page.waitForURL(/\/setup\?preset=hr_firing_01/);
  for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: /Далее/ }).click();
  await page.getByRole("button", { name: /Начать переговоры/ }).click();
  await page.waitForURL(/\/play\/\d+/, { timeout: 15000 });
  await shot("play-workspace");
  for (let turn = 0; turn < 12 && !page.url().includes("/report/"); turn += 1) {
    const options = page.locator(".play-workspace section button.glass");
    await options.first().waitFor({ timeout: 8000 });
    await options.first().click();
    await page.waitForTimeout(450);
  }
  await page.waitForURL(/\/report\/\d+/, { timeout: 15000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.ok((await page.evaluate(() => window.scrollY)) <= 20, "Report must open at its summary, not the old conversation scroll position");
  await shot("report-summary");
  await page.getByRole("button", { name: "Пройти ещё раз" }).click();
  await page.waitForURL(/\/setup\?preset=hr_firing_01/);
  await page.goto(`${appUrl}/does-not-exist`);
  assert.match(await page.getByRole("heading", { level: 1 }).textContent(), /Этой страницы нет/);
  await shot("not-found");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/scenarios`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `Mobile horizontal overflow: ${overflow}px`);
  await shot("scenario-mobile");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ steps, overflow, errors, url: appUrl }, null, 2));
} finally {
  await page.close();
  const path = await page.video().path();
  await context.close();
  await browser.close();
  await rename(path, resolve(videoDir, "v4-core-flow-final.webm"));
}
