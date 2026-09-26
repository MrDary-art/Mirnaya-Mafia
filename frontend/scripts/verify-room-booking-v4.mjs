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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
let blockedByTimezone = false;
const testSituation = `Проверка календаря ${Date.now()}`;
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`);
  await page.locator(".nova-home-world").waitFor();
  await page.goto(`${appUrl}/rooms`);
  await page.locator(".arena-room-hub").waitFor();
  await page.getByLabel("Как к вам обращаться").first().fill("Демо тестирование v4");
  await page.getByLabel("Ситуация переговоров").fill(testSituation);
  await page.getByLabel("Желаемый результат").fill("Найти общий план и закрепить сроки");
  await page.getByText("Дата и время по Москве").waitFor();
  const available = page.locator('button[title="Забронировать"]:not(:disabled)');
  if (!(await available.count())) await page.locator(".booking-day:not(:disabled)").last().click();
  await available.first().click();
  await page.getByRole("button", { name: /Проверить встречу/ }).click();
  await page.locator(".booking-modal").getByRole("button", { name: /Создать встречу/ }).click();
  await page.waitForTimeout(1200);
  const bookingAlerts = await page.getByRole("alert").allTextContents();
  blockedByTimezone = bookingAlerts.some((message) => message.includes("Неизвестный часовой пояс"));
  if (blockedByTimezone) {
    await page.screenshot({ path: resolve(output, "room-booking-environment-error.png"), fullPage: true });
    console.log(JSON.stringify({ status: "blocked-local-timezone-data", bookingAlerts, errors }, null, 2));
  } else {
    assert.deepEqual(bookingAlerts, []);
    const dialog = page.getByRole("dialog", { name: "Время забронировано" });
    await dialog.waitFor();
    await page.screenshot({ path: resolve(output, "room-created.png") });
    await dialog.getByRole("button", { name: "Копировать код" }).click();
    assert.match(await dialog.getByRole("status").textContent(), /Скопировано/);
    await dialog.getByRole("button", { name: /Посмотреть запись|Перейти к встрече/ }).click();
    await page.waitForURL(/\/room\/\d+/);
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(output, "room-lobby.png") });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "passed", roomUrl: page.url(), errors }, null, 2));
  }
} finally {
  try {
    const cancelled = await page.evaluate(async (problem) => {
      const headers = { Authorization: `Bearer ${localStorage.getItem("arena_token")}` };
      const rooms = await (await fetch("/api/rooms", { headers })).json();
      const matches = rooms.filter((room) => room.problem === problem && room.status === "waiting");
      const results = await Promise.all(matches.map(async (room) => ({ id: room.id, status: (await fetch(`/api/rooms/${room.id}/cancel`, { method: "POST", headers })).status })));
      return results;
    }, testSituation);
    if (cancelled.length) console.log(JSON.stringify({ testBookingsCancelled: cancelled }));
  } catch (error) { console.warn(`Не удалось очистить тестовую запись: ${error.message}`); }
  await page.close();
  const video = await page.video().path();
  await context.close();
  await browser.close();
  await rename(video, resolve(videoDir, blockedByTimezone ? "v4-room-booking-blocked.webm" : "v4-room-booking.webm"));
}
