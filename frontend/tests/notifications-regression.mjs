import assert from "node:assert/strict";
import { chromium } from "playwright-core";

// Run against Vite. Every API call is mocked; no account or backend is required.
const base = process.env.UI_TEST_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem("arena_token", "notification-test"));
const date = "2026-10-20T12:00:00Z";
let social = [
  { id: 1, type: "SOCIAL_LIKE", read: false, created_at: date, payload: { path: "/feed?post=1" } },
  { id: 2, type: "SOCIAL_FOLLOW", read: true, created_at: date, payload: {} },
];
let company = [1, 2].map(id => ({ id, type: "COMPANY_ASSIGNMENT", title: `Задание ${id}`, text: "Обсудите условия", created_at: date, read: false }));
let failSocial = false, failCompany = null, posts = [];
await page.route("**/api/**", async route => {
  const path = new URL(route.request().url()).pathname;
  const post = route.request().method() === "POST";
  if (post) posts.push(path);
  if (post && ((path.startsWith("/api/social/notifications/") && failSocial) || path === `/api/company/7/inbox/${failCompany}/read`)) return route.fulfill({ status: 503, json: { detail: "Не удалось сохранить прочтение" } });
  if (path === "/api/social/notifications") return route.fulfill({ json: social });
  if (path === "/api/social/preferences") return route.fulfill({ json: { likes: true, comments: true, follows: true, reposts: true, mentions: true, stories: true } });
  if (path === "/api/social/notifications/read-all") social = social.map(item => ({ ...item, read: true }));
  else if (post && path.startsWith("/api/social/notifications/")) social = social.map(item => item.id === Number(path.split("/").at(-2)) ? { ...item, read: true } : item);
  else if (post && path.startsWith("/api/company/7/inbox/")) company = company.map(item => item.id === Number(path.split("/").at(-2)) ? { ...item, read: true } : item);
  if (path === "/api/company/context") return route.fulfill({ json: { company: { id: 7 }, inbox: company } });
  await route.fulfill({ json: {} });
});
const count = (selector, expected) => page.waitForFunction(({ selector, expected }) => document.querySelectorAll(selector).length === expected, { selector, expected });
try {
  await page.goto(`${base}/tests/notifications-harness.html`);
  await count(".arena-notification", 1);
  await page.getByRole("button", { name: "Прочитать и скрыть уведомление" }).click();
  await count(".arena-notification", 0);
  assert.equal(social[0].read, true);
  assert.equal(await page.evaluate(() => window.notificationChanges), 1);
  await page.reload();
  await page.getByRole("heading", { name: "Здесь пока тихо" }).waitFor();
  await page.getByLabel("Показать прочитанные").check();
  await count(".arena-notification", 2);
  await page.getByLabel("Показать прочитанные").uncheck();

  social[0].read = false;
  await page.reload(); await count(".arena-notification", 1);
  failSocial = true;
  await page.getByRole("button", { name: "Прочитать всё", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".arena-notification").count(), 1);
  assert.equal(social[0].read, false);
  failSocial = false;
  await page.getByRole("button", { name: "Прочитать всё", exact: true }).click();
  await count(".arena-notification", 0);
  social[0].read = false;
  await page.reload(); await count(".arena-notification", 1);
  await page.getByRole("button", { name: "Открыть", exact: true }).click();
  await count(".arena-notification", 0);
  assert.equal(social[0].read, true, "Opening must persist the read state before navigating");

  await page.goto(`${base}/tests/notifications-harness.html?company`);
  await count(".business-notification-list article", 2);
  failCompany = 1;
  await page.getByRole("button", { name: /Задание 1/ }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".business-notification-list article").count(), 2);
  assert.equal(await page.evaluate(() => window.notificationNavigation), undefined);
  failCompany = null;
  await page.getByRole("button", { name: /Задание 1/ }).click();
  await count(".business-notification-list article", 1);
  await page.waitForFunction(() => document.querySelector("output").textContent === "1");
  assert.equal(await page.evaluate(() => window.notificationNavigation), "/business/7/learning");
  await page.reload(); await count(".business-notification-list article", 1);
  await page.getByLabel("Показать прочитанные").check();
  await count(".business-notification-list article", 2);
  await page.getByLabel("Показать прочитанные").uncheck();
  await page.getByRole("button", { name: "Прочитать все", exact: true }).click();
  await count(".business-notification-list article", 0);
  await page.waitForFunction(() => document.querySelector("output").textContent === "0");

  company = company.map(item => ({ ...item, read: false }));
  await page.reload(); await count(".business-notification-list article", 2);
  failCompany = 2;
  await page.getByRole("button", { name: "Прочитать все", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await count(".business-notification-list article", 1);
  assert.deepEqual(company.map(item => item.read), [true, false], "A partial failure must retain successfully saved reads");
  failCompany = null;
  await page.getByRole("button", { name: "Прочитать все", exact: true }).click();
  await count(".business-notification-list article", 0);
  await page.reload();
  await page.getByText("Всё прочитано. Историю можно открыть выше.").waitFor();
  assert.deepEqual(errors, []);
  console.log(`Notification regression passed: persistence, hiding, archive, navigation, counters, failures and retry (${posts.length} mocked writes).`);
} finally { await browser.close(); }
