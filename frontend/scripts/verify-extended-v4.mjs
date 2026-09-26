import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = resolve("../docs/design/design-pass-v4/qa-browser");
const videoDir = resolve(output, "videos");
await mkdir(videoDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const username = `v4forms_${randomUUID().slice(0, 8)}`;
const password = randomUUID();
const result = { username, profileSaved: false, profileError: false, practiceStarted: false, practiceTurn: false, practiceReport: false, shopCategories: 0, shopError: false };

try {
  await page.goto(`${base}/login`);
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.getByLabel("Логин", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/app`);

  await page.goto(`${base}/profile`);
  await page.getByRole("button", { name: "Личная информация" }).click();
  await page.getByLabel("Фамилия").fill("Тестовый");
  await page.getByLabel("Имя", { exact: true }).fill("Профиль");
  await page.getByLabel("Город").fill("Москва");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Изменения сохранены.").waitFor();
  await page.screenshot({ path: resolve(output, "profile-saved.png") });
  await page.reload();
  await page.getByRole("button", { name: "Личная информация" }).click();
  assert.equal(await page.getByLabel("Город").inputValue(), "Москва");
  result.profileSaved = true;
  await page.route("**/api/social/profile", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Проверка ошибки сохранения" }) }));
  await page.getByLabel("Город").fill("Другой город");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("alert").getByText("Проверка ошибки сохранения").waitFor();
  await page.screenshot({ path: resolve(output, "profile-save-error.png") });
  result.profileError = true;
  await page.unroute("**/api/social/profile");

  await page.goto(`${base}/shop`);
  await page.locator(".shop-item").first().waitFor();
  const categories = page.locator(".shop-filters button");
  result.shopCategories = await categories.count();
  for (let index = 0; index < result.shopCategories; index += 1) {
    await categories.nth(index).click();
    assert.equal(await categories.nth(index).getAttribute("aria-pressed"), "true");
  }
  await page.screenshot({ path: resolve(output, "shop-filtered.png") });
  const unaffordable = page.locator(".shop-item").filter({ has: page.locator(".shop-item-meta", { hasText: /★ [1-9]/ }) }).first();
  if (await unaffordable.count()) {
    await unaffordable.getByRole("button", { name: "Получить" }).click();
    await page.locator(".product-error").waitFor();
    result.shopError = true;
    await page.screenshot({ path: resolve(output, "shop-purchase-error.png") });
    await page.getByRole("button", { name: "Закрыть" }).click();
  }

  await page.goto(`${base}/practice`);
  await page.getByLabel("Как к вам обращаться").fill("QA пользователь");
  await page.getByLabel("Ситуация").fill("Согласовать сроки проекта");
  await page.getByLabel("Желаемый результат").fill("Договориться о двух этапах");
  await page.getByRole("button", { name: /Войти в разговор/ }).click();
  await page.waitForURL(/\/practice\?session=/, { timeout: 20000 });
  await page.getByLabel("Ваша реплика").waitFor();
  result.practiceStarted = true;
  await page.screenshot({ path: resolve(output, "practice-active.png") });
  const reply = "Предлагаю согласовать первый этап и критерии готовности.";
  await page.getByLabel("Ваша реплика").fill(reply);
  await page.getByRole("button", { name: "Отправить реплику" }).click();
  await page.getByText(reply).waitFor({ timeout: 45000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent.includes("Завершить и получить отчёт"));
    return button && !button.disabled;
  }, null, { timeout: 45000 });
  result.practiceTurn = true;
  await page.waitForFunction(() => [...document.querySelectorAll(".live-message")].every((node) => Number(getComputedStyle(node).opacity) >= 0.99), null, { timeout: 10000 });
  result.chatColors = await page.locator(".live-bubble-text").evaluateAll((nodes) => nodes.map((node) => ({ color: getComputedStyle(node).color, opacity: getComputedStyle(node).opacity, parentOpacity: getComputedStyle(node.closest(".live-message")).opacity })));
  assert.ok(result.chatColors.every((item) => item.color === "rgb(244, 247, 242)" && Number(item.parentOpacity) >= 0.99));
  await page.screenshot({ path: resolve(output, "practice-after-turn.png") });
  await page.getByRole("button", { name: "Завершить и получить отчёт" }).click();
  await page.waitForURL(/\/report\/\d+/, { timeout: 20000 });
  await page.screenshot({ path: resolve(output, "practice-report.png") });
  result.practiceReport = true;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...result, errors }, null, 2));
} finally {
  await page.close();
  const video = await page.video().path();
  await context.close();
  await browser.close();
  await rename(video, resolve(videoDir, "v4-extended-forms.webm"));
}
