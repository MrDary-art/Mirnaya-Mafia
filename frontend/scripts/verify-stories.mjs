import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

// This acceptance check creates content. Point it only at a disposable database.
const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012";
assert.equal(process.env.ARENA_QA_DISPOSABLE, "1", "Use a disposable QA database and set ARENA_QA_DISPOSABLE=1");
for (const key of ["ARENA_QA_READER", "ARENA_QA_AUTHOR", "ARENA_QA_MODERATOR", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const output = resolve("../.cache/stories-qa/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const errors = [];
const contexts = [];
async function account(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  contexts.push(context);
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env[name], password: process.env.ARENA_QA_PASSWORD } });
  assert.ok(login.ok(), `Login ${name}: ${login.status()}`);
  const { access_token } = await login.json();
  await context.setExtraHTTPHeaders({ Authorization: `Bearer ${access_token}` });
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  return { context, page };
}
async function snapshot(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${name}: horizontal overflow ${overflow}px`);
}
async function response(page, path, action) {
  const pending = page.waitForResponse(r => r.url().includes(path) && r.request().method() !== "GET");
  await action();
  const result = await pending;
  assert.ok(result.ok(), `${path}: HTTP ${result.status()} ${await result.text()}`);
  return result.json();
}
try {
  const reader = await account("ARENA_QA_READER");
  const author = await account("ARENA_QA_AUTHOR");
  const moderator = await account("ARENA_QA_MODERATOR");
  const page = reader.page;
  const feedResponse = await reader.context.request.get(`${base}/api/stories`);
  const feed = await feedResponse.json();
  assert.ok(feed.items.length >= 6, "Six complete editorial stories are available");
  const id = feed.items.find(item => item.author.id === null).id;
  let previous = (await (await reader.context.request.get(`${base}/api/stories/${id}`)).json()).attempt;
  for (let turn = 0; previous?.status === "active" && turn < 8; turn++) {
    const result = await reader.context.request.post(`${base}/api/stories/attempts/${previous.id}/choices`, { data: { node_id: previous.node.id, option_id: previous.node.options[0].id, revision: previous.revision } });
    assert.ok(result.ok()); previous = await result.json();
  }
  await page.goto(`${base}/stories/${id}`);
  let card = page.locator(`[data-story-id="${id}"]`);
  await card.getByRole("button", { name: /^(Войти в историю|Переиграть)$/ }).waitFor();
  await snapshot(page, "desktop-entry");
  let attempt = await response(page, "/attempts", () => card.getByRole("button", { name: /^(Войти в историю|Переиграть)$/ }).click());
  await card.locator(".stories-options button").first().waitFor();
  attempt = await response(page, "/choices", () => card.locator(".stories-options button").first().click());
  await page.reload();
  await card.locator(".stories-play").waitFor();
  assert.equal(await card.locator(".stories-your-choice").first().textContent(), `«${attempt.history.at(-1).choice}»`);
  for (let turn = 0; attempt.status === "active" && turn < 6; turn++) {
    attempt = await response(page, "/choices", () => card.locator(".stories-options button").first().click());
  }
  assert.equal(attempt.status, "finished");
  await card.locator(".stories-ending").waitFor();
  await snapshot(page, "desktop-result");
  await page.reload();
  await card.locator(".stories-ending").waitFor();
  assert.equal(await card.locator(".stories-ending h3").textContent(), attempt.ending.title);
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await snapshot(page, `result-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await response(page, "/like", () => card.getByRole("button", { name: /^(Нравится|Убрать отметку нравится):/ }).click());
  await response(page, "/save", () => card.getByRole("button", { name: /^(Сохранить историю|Убрать из сохранённого)$/ }).click());
  await card.getByRole("button", { name: /^Обсудить:/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ваша точка зрения").fill("Важны встречные условия и конкретный срок.");
  await response(page, "/comments", () => dialog.getByRole("button", { name: "Ответить", exact: true }).click());
  await dialog.locator(".stories-comment").filter({ hasText: "Важны встречные условия" }).getByRole("button", { name: "Удалить", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await card.getByRole("button", { name: "Сообщить о проблеме", exact: true }).click();
  await dialog.getByLabel("Причина").fill("Тестовый сигнал для проверки работы редакции.");
  await response(page, "/report", () => dialog.getByRole("button", { name: "Отправить модератору" }).click());
  await dialog.getByRole("button", { name: "Понятно" }).click();

  const studio = author.page;
  await studio.goto(`${base}/stories/new`);
  const title = `Проверка истории ${Date.now()}`;
  for (const [label, value] of [["Название истории", title], ["Коротко о конфликте", "Руководитель меняет условия после договорённости. Нужно сохранить границы и отношения."], ["Роль читателя", "Дизайнер"], ["Собеседник", "Руководитель"], ["Цель и обстоятельства героя", "Согласовать объём работ и дату завершения."], ["С чего начинается разговор?", "Добавим ещё одну задачу без изменения срока?"]]) {
    await studio.getByLabel(new RegExp(`^${label.replace(/[?]/g, "\\?")}`)).fill(value);
  }
  for (let index = 0; index < 3; index++) {
    const option = studio.locator(".stories-studio-option").nth(index);
    for (const [label, value] of [["Реплика читателя", `Вариант ${index + 1}: обсудим условия`], ["Как отреагирует собеседник?", `Реакция ${index + 1}: условия обсуждены.`], ["Название этого исхода", `Исход ${index + 1}`], ["Почему получилось именно так?", "Реплика определяет следующий шаг собеседника."], ["Что взять в следующий разговор?", "Заранее обсуждать объём работ и границы."]]) await option.getByLabel(new RegExp(`^${label.replace(/[?]/g, "\\?")}`)).fill(value);
  }
  await studio.getByRole("button", { name: "Посмотреть все развилки" }).click();
  await studio.getByRole("dialog").locator(".stories-preview-option").first().waitFor();
  await studio.keyboard.press("Escape");
  const draft = await response(studio, "/api/stories", () => studio.getByRole("button", { name: "Сохранить черновик", exact: true }).click());
  await studio.waitForURL(`**/stories/${draft.id}/edit`);
  await studio.reload();
  assert.equal(await studio.getByLabel(/^Название истории/).inputValue(), title);
  assert.equal((await reader.context.request.get(`${base}/api/stories/${draft.id}`)).status(), 404);
  await response(studio, "/submit", () => studio.getByRole("button", { name: "На проверку", exact: true }).click());
  await moderator.page.goto(`${base}/admin/stories`);
  await moderator.page.locator(".stories-moderation-card").filter({ hasText: title }).getByRole("button", { name: /Открыть на проверку/ }).click();
  await response(moderator.page, "/moderate", () => moderator.page.getByRole("dialog").getByRole("button", { name: "Опубликовать", exact: true }).click());
  const resetFollow = await reader.context.request.put(`${base}/api/stories/authors/${draft.author.id}/follow`, { data: { active: false } });
  assert.ok(resetFollow.ok(), "Reset previous QA subscription before checking follow UI");
  await page.goto(`${base}/stories/${draft.id}`);
  card = page.locator(`[data-story-id="${draft.id}"]`);
  await response(page, "/follow", () => card.getByRole("button", { name: "Подписаться", exact: true }).click());
  await page.goto(`${base}/stories?tab=following`);
  await page.locator(`[data-story-id="${draft.id}"]`).waitFor();
  assert.equal((await reader.context.request.get(`${base}/api/admin/stories/queue`)).status(), 403);
  assert.deepEqual(errors, [], "No browser exceptions");
  console.log(JSON.stringify({ passed: true, checks: ["branching", "active-and-finished-reload", "social-actions", "comments", "report", "author-studio", "draft-privacy", "moderation", "follows", "keyboard-dialog", "responsive-360-390-768-1440"], screenshots: output }));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
