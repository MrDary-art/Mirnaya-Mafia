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
const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const a = await contextA.newPage();
const b = await contextB.newPage();
const errors = [];
a.on("pageerror", (error) => errors.push(`A: ${error.message}`));
b.on("pageerror", (error) => errors.push(`B: ${error.message}`));
const userB = `v4qa_${randomUUID().slice(0, 8)}`;
const passB = randomUUID();

async function find(page, query) {
  await page.goto(`${base}/people`);
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  await page.getByLabel("Имя или ник").fill(query);
  await page.getByRole("button", { name: "Найти партнёра" }).click();
  await page.locator(".people-card").first().waitFor();
}

try {
  await a.goto(`${base}/login`);
  await a.getByLabel("Логин", { exact: true }).fill("demo");
  await a.getByLabel("Пароль", { exact: true }).fill("demo");
  await a.locator(".arena-auth-submit").click();
  await a.waitForURL(`${base}/`);

  await b.goto(`${base}/login`);
  await b.getByRole("tab", { name: "Регистрация" }).click();
  await b.screenshot({ path: resolve(output, "registration-mobile.png") });
  await b.getByLabel("Логин", { exact: true }).fill(userB);
  await b.getByLabel("Пароль", { exact: true }).fill(passB);
  await b.locator(".arena-auth-submit").click();
  await b.waitForURL(`${base}/`, { timeout: 15000 });

  await find(a, userB);
  await a.getByRole("button", { name: "Добавить друга" }).click();
  await a.getByText("Заявка отправлена").waitFor();
  await a.screenshot({ path: resolve(output, "social-request-sent.png") });
  await find(b, "demo");
  await b.getByRole("button", { name: "Принять заявку" }).click();
  await b.getByText("Вы друзья").waitFor();
  await b.screenshot({ path: resolve(output, "social-request-accepted-mobile.png") });

  await a.goto(`${base}/people`);
  await a.getByRole("button", { name: new RegExp(userB) }).click();
  await a.getByLabel("Сообщение").fill("Привет! Проверяем живой диалог v4.");
  await a.getByRole("button", { name: "Отправить", exact: true }).click();
  await a.waitForFunction(() => [...document.querySelectorAll(".friends-chat .overflow-y-auto p")].some((node) => node.textContent === "Привет! Проверяем живой диалог v4."));
  await a.screenshot({ path: resolve(output, "social-chat-sent.png") });

  await b.goto(`${base}/people`);
  await b.getByRole("button", { name: /demo/ }).click();
  await b.getByText("Привет! Проверяем живой диалог v4.").waitFor();
  await b.screenshot({ path: resolve(output, "social-chat-received-mobile.png") });

  await a.getByRole("button", { name: "Пригласить в переговоры" }).click();
  const invite = a.getByRole("dialog", { name: "Настройки переговоров" });
  await invite.getByLabel("Как к вам обращаться").fill("Демо-партнёр");
  await invite.getByLabel("Ситуация и условия").fill("Согласовать сроки выпуска");
  await invite.getByLabel("Желаемый результат").fill("Договориться о реалистичном плане");
  await a.screenshot({ path: resolve(output, "social-invite-dialog.png") });
  await invite.getByRole("button", { name: "Отправить приглашение" }).click();
  await a.getByText("Приглашение отправлено.").waitFor();
  await b.reload();
  await b.getByRole("button", { name: /demo/ }).click();
  await b.getByRole("button", { name: "Принять приглашение" }).waitFor();
  await b.screenshot({ path: resolve(output, "social-invite-received-mobile.png") });
  await b.getByRole("button", { name: "Принять приглашение" }).click();
  await b.waitForURL(/\/room\/\d+/);
  await b.getByRole("heading", { name: "Проверьте условия и связь" }).waitFor();
  await b.screenshot({ path: resolve(output, "social-invite-accepted-mobile.png") });
  const acceptedRoom = b.url();
  await a.goto(acceptedRoom);
  await a.getByRole("heading", { name: "Проверьте условия и связь" }).waitFor();
  await a.screenshot({ path: resolve(output, "social-room-host-lobby.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ userB, friendRequest: true, accepted: true, chat: true, invitationSent: true, invitationReceived: true, invitationAccepted: true, acceptedRoom, errors }));
} finally {
  await a.close();
  await b.close();
  const video = await a.video().path();
  await contextA.close();
  await contextB.close();
  await browser.close();
  await rename(video, resolve(videoDir, "v4-social-flow.webm"));
}
