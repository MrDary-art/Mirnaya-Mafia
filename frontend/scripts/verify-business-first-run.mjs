import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

if (process.env.ARENA_QA_MUTATE !== "isolated") {
  throw new Error("Run only against a disposable database with ARENA_QA_MUTATE=isolated.");
}

const base = process.env.ARENA_BASE_URL || "http://127.0.0.1:5176";
const browserPath = process.env.ARENA_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = process.env.ARENA_QA_OUTPUT || "../.cache/business-first-run-qa";
const suffix = randomUUID().slice(0, 8);
const companyName = `Проверка первого запуска ${suffix}`;
const username = `first_run_${suffix}`;
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
await mkdir(output, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${base}/business/register`);
  await page.getByRole("heading", { name: "Создайте аккаунт" }).waitFor();
  await page.locator("#arena-full-name").fill("Проверка Первый Запуск");
  await page.locator("#arena-nickname").fill(username);
  await page.locator("#arena-login").fill(`${username}_login`);
  await page.locator("#arena-password").fill("FirstRunTest-2026!");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await page.getByRole("heading", { name: "Подключитесь к рабочему пространству" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Создать пространство" }).count(), 1);
  await page.screenshot({ path: `${output}/no-company-desktop.png`, fullPage: true });

  await page.getByRole("link", { name: "Создать компанию" }).click();
  await page.getByRole("heading", { name: "Создайте рабочее пространство команды" }).waitFor();
  await page.screenshot({ path: `${output}/create-company-desktop.png`, fullPage: true });
  await page.getByLabel("Название компании *").fill(companyName);
  await page.getByLabel("Отрасль", { exact: false }).fill("Образование");
  await page.getByLabel("Электронная почта *").fill(`${username}@example.test`);
  await page.getByRole("button", { name: /Создать пространство/ }).click();
  await page.getByRole("heading", { name: "Главная", exact: true }).waitFor();
  const companyId = new URL(page.url()).pathname.split("/")[2];
  assert.match(companyId, /^\d+$/);
  await page.getByRole("heading", { name: "Добавьте команду" }).waitFor();
  await page.getByText("1 сотрудник в компании.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Ход обучения команды" }).count(), 0);
  assert.equal(await page.getByRole("link", { name: /Создать рабочую ситуацию/ }).count(), 1);
  await page.screenshot({ path: `${output}/first-home-desktop.png`, fullPage: true });

  await page.goto(`${base}/business/${companyId}/profile`);
  const tabs = page.getByRole("navigation", { name: "Разделы профиля" });
  await tabs.getByRole("button", { name: "Мой профиль" }).waitFor();
  await page.getByRole("region", { name: "Личная статистика" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Ближайшие встречи 1×1" }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Последние события" }).count(), 0);
  await tabs.getByRole("button", { name: "Мои результаты" }).click();
  await page.getByRole("heading", { name: "Личная аналитика" }).waitFor();
  await page.screenshot({ path: `${output}/owner-profile-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/business/${companyId}/overview`);
  await page.getByRole("heading", { name: "Добавьте команду" }).waitFor();
  await page.locator(".business-home-status").waitFor({ state: "hidden" });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${output}/first-home-mobile.png`, fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ companyId, username, screenshots: output, pageErrors }));
} finally {
  await browser.close();
}
