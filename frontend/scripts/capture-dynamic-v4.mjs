import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/design-pass-v4/dynamic-states");
await mkdir(output, { recursive: true });
const videoDir = resolve("../docs/design/design-pass-v4/qa-browser/videos");
await mkdir(videoDir, { recursive: true });
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const screenshots = [];
async function capture(name) {
  await page.waitForTimeout(600);
  const path = resolve(output, `${name}.png`);
  await page.screenshot({ path });
  screenshots.push({ name, url: page.url(), path, errors: errors.splice(0) });
}

try {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/`);

  await page.goto(`${appUrl}/theory`);
  await page.locator(".theory-lesson-card").first().waitFor();
  await capture("theory-catalog");
  await page.locator(".theory-lesson-card .primary-button").first().click();
  await page.locator(".theory-lesson-head").waitFor();
  await capture("theory-lesson-intro");
  const begin = page.getByRole("button", { name: /Начать урок/ });
  if (await begin.count()) {
    await begin.click();
    await page.getByRole("heading", { level: 2 }).first().waitFor();
    await capture("theory-lesson-content");
  }

  await page.goto(`${appUrl}/training/path/chapter/chapter-1`);
  await page.locator(".path-card").first().waitFor();
  await capture("path-chapter");
  const startLevel = page.locator(".path-card:not(.locked) .primary-button").first();
  if (await startLevel.count()) {
    await startLevel.click();
    await page.waitForURL(/\/training\/path\/attempt\//);
    await capture("path-attempt");
  }

  await page.goto(`${appUrl}/rooms`);
  await page.getByLabel("Как к вам обращаться").first().fill("Демо");
  await page.getByLabel("Ситуация переговоров").fill("Согласовать сроки запуска");
  await page.getByLabel("Желаемый результат").fill("Найти реалистичный план");
  await page.getByRole("button", { name: /Запустить демо сейчас/ }).click();
  await page.waitForURL(`${appUrl}/rooms/demo`);
  await capture("room-demo-invitation");
  await page.getByRole("button", { name: /Далее/ }).last().click();
  await capture("room-demo-reminder");
  await page.getByRole("button", { name: /Далее/ }).last().click();
  await capture("room-demo-lobby");
  await page.getByRole("checkbox", { name: "Формат демо и задание понятны" }).check();
  await page.getByRole("button", { name: "Я готов — войти" }).click();
  await page.getByText("ДЕМО-РАЗГОВОР").waitFor();
  await capture("room-demo-conversation");
  await page.getByPlaceholder("Ответьте голосом или текстом…").fill("Предлагаю согласовать два этапа запуска и ответственных.");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await page.getByText("Предлагаю согласовать два этапа запуска и ответственных.").waitFor();
  await page.getByRole("button", { name: /Завершить раньше/ }).click();
  await page.getByRole("heading", { name: "Зал ожидания" }).waitFor();
  await capture("room-demo-waiting");
  await page.getByRole("button", { name: "Открыть разбор" }).waitFor({ state: "visible" });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((button) => button.textContent === "Открыть разбор")?.disabled, { timeout: 30000 });
  await page.getByRole("button", { name: "Открыть разбор" }).click();
  await capture("room-demo-report");

  await page.goto(`${appUrl}/admin`);
  await capture("admin-access");
  await page.goto(`${appUrl}/people`);
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  await capture("people-search");
  await page.goto(`${appUrl}/__design-v4`);
  await page.getByRole("heading", { name: "Состояния интерфейса" }).waitFor();
  await capture("design-gallery-idle");
  await page.getByRole("button", { name: "Ошибка", exact: true }).click();
  await capture("design-gallery-error");
  await page.getByRole("button", { name: "Открыть окно" }).click();
  await page.getByRole("dialog").waitFor();
  await capture("design-gallery-dialog");
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").count()) throw new Error("Design gallery dialog must close on Escape");
  if (screenshots.some((item) => item.errors.length)) throw new Error("Page errors were recorded in dynamic states");
  console.log(JSON.stringify(screenshots, null, 2));
} finally {
  await page.close();
  const video = await page.video().path();
  await context.close();
  await browser.close();
  await rename(video, resolve(videoDir, "v4-dynamic-demo-flow.webm"));
}
