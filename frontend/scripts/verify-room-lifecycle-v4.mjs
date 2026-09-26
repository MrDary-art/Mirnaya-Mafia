import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = resolve("../docs/design/design-pass-v4/qa-browser");
const videos = resolve(output, "videos");
await mkdir(videos, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videos, size: { width: 1440, height: 900 } } });
const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
const errors = [];
host.on("pageerror", (error) => errors.push(`host: ${error.message}`));
guest.on("pageerror", (error) => errors.push(`guest: ${error.message}`));
const guestName = `v4room_${randomUUID().slice(0, 8)}`;

try {
  await host.goto(`${base}/login`);
  await host.getByLabel("Логин", { exact: true }).fill("demo");
  await host.getByLabel("Пароль", { exact: true }).fill("demo");
  await host.locator(".arena-auth-submit").click();
  await host.waitForURL(`${base}/app`);
  await guest.goto(`${base}/login`);
  await guest.getByRole("tab", { name: "Регистрация" }).click();
  await guest.getByLabel("Логин", { exact: true }).fill(guestName);
  await guest.getByLabel("Пароль", { exact: true }).fill(randomUUID());
  await guest.locator(".arena-auth-submit").click();
  await guest.waitForURL(`${base}/app`);

  // An immediate slot is created through the real API because the booking UI intentionally offers 09:00–22:00 slots only.
  const created = await host.evaluate(async () => {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("arena_token")}` },
      body: JSON.stringify({ mode: "duel", display_name: "Демо — QA", request_text: "Подготовка к интервью продуктового менеджера", goal: "Согласовать реалистичные условия", role: "Кандидат", level: "начальный", duration_minutes: 2, timezone: "Europe/Moscow", scheduled_at: null, ranked: false }),
    });
    return { ok: response.ok, data: await response.json() };
  });
  assert.equal(created.ok, true, JSON.stringify(created.data));
  assert.ok(created.data.id && created.data.code);
  await guest.goto(`${base}/rooms?code=${created.data.code}`);
  await guest.getByRole("button", { name: "Проверить приглашение" }).click();
  await guest.getByText("Подготовка к интервью продуктового менеджера").waitFor();
  await guest.screenshot({ path: resolve(output, "room-preview-mobile.png") });
  await guest.getByLabel("Как к вам обращаться").last().fill("Второй кандидат");
  await guest.getByRole("button", { name: /Подтвердить и войти/ }).click();
  await guest.waitForURL(new RegExp(`/room/${created.data.id}$`));
  await guest.getByRole("heading", { name: "Проверьте условия и связь" }).waitFor();
  await guest.screenshot({ path: resolve(output, "room-duel-lobby-mobile.png") });

  await host.goto(`${base}/room/${created.data.id}`);
  await host.getByRole("heading", { name: "Проверьте условия и связь" }).waitFor();
  await host.getByRole("button", { name: "Я готов" }).waitFor({ state: "visible" });
  await host.waitForFunction(() => ![...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Я готов")?.disabled);
  await host.getByRole("button", { name: "Я готов" }).click();
  await guest.getByRole("button", { name: "Я готов" }).click();
  await host.getByRole("button", { name: "Завершить тренировку" }).waitFor({ timeout: 15000 });
  await host.waitForFunction(() => window.scrollY <= 20);
  await host.screenshot({ path: resolve(output, "room-duel-active.png") });
  await host.getByRole("button", { name: "Завершить тренировку" }).click();
  await guest.getByRole("button", { name: "Завершить тренировку" }).waitFor({ timeout: 15000 });
  await guest.getByRole("button", { name: "Завершить тренировку" }).click();
  await host.getByRole("heading", { name: "Зафиксируйте результат" }).waitFor({ timeout: 15000 });
  await host.waitForFunction(() => window.scrollY <= 20);
  await host.screenshot({ path: resolve(output, "room-feedback.png") });
  await host.getByLabel("Чем закончилась встреча?").fill("Зафиксировали следующий шаг");
  await host.getByLabel("Что у вас получилось?").fill("Ясно сформулировали условия");
  await host.getByRole("button", { name: "Отправить и получить отчёт" }).click();
  await host.getByRole("heading", { name: "Практика завершена" }).waitFor({ timeout: 45000 });
  await host.waitForFunction(() => window.scrollY <= 20);
  await host.waitForTimeout(750);
  await host.screenshot({ path: resolve(output, "room-duel-result.png") });
  const teamComplete = await host.locator(".arena-room-page").getAttribute("data-room-team-complete");
  await host.getByLabel("Эффекты интерфейса").selectOption("off");
  await host.evaluate(() => window.scrollTo(0, 0));
  const teamFallback = await host.locator(".product-static-motif--team").evaluate((node) => getComputedStyle(node).display !== "none");
  const baseHidden = await host.locator(".product-static-motif--base").evaluate((node) => getComputedStyle(node).display === "none");
  assert.equal(teamFallback && baseHidden, true, "Finished room should show M11 static fallback, not M03");
  await host.screenshot({ path: resolve(output, "room-duel-result-fallback.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "passed", roomId: created.data.id, preview: true, joined: true, active: true, feedback: true, finished: true, teamComplete, teamFallback, errors }));
} finally {
  await host.close();
  await guest.close();
  const video = await host.video().path();
  await hostContext.close();
  await guestContext.close();
  await browser.close();
  await rename(video, resolve(videos, "v4-room-lifecycle.webm"));
}
