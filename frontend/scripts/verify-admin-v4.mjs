import assert from "node:assert/strict";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = resolve("../docs/design/design-pass-v4/qa-browser");
const videos = resolve(output, "videos");
await mkdir(videos, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videos, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("admin");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/app`);
  await page.goto(`${base}/admin`);
  await page.locator(".admin-settings").waitFor();
  await page.getByLabel("Название компании").waitFor();
  await page.screenshot({ path: resolve(output, "admin-settings.png") });
  const company = await page.getByLabel("Название компании").inputValue();
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await page.getByText("Контекст сохранён. Новые сессии получат обновлённые настройки.").waitFor();
  await page.screenshot({ path: resolve(output, "admin-save-success.png") });

  await page.route("**/api/admin/settings", (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Проверка ошибки администратора" }) })
    : route.continue());
  await page.getByLabel("Название компании").fill(`${company} QA`);
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await page.getByRole("alert").getByText("Проверка ошибки администратора").waitFor();
  await page.screenshot({ path: resolve(output, "admin-save-error.png") });
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.unroute("**/api/admin/settings");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ adminLoaded: true, savedUnchanged: true, injectedError: true, scenarios: await page.locator(".admin-scenarios textarea").count(), errors }, null, 2));
} finally {
  await page.close();
  const video = await page.video().path();
  await context.close();
  await browser.close();
  await rename(video, resolve(videos, "v4-admin-settings.webm"));
}
