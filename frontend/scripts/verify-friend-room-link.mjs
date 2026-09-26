import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  const profileLoaded = page.waitForResponse((response) => response.url().includes("/api/auth/me"));
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/app`);
  await profileLoaded;

  await page.goto(`${base}/people`);
  const contact = page.locator(".social-contact").first();
  await contact.waitFor();
  await contact.click();
  await page.getByRole("button", { name: /1 на 1/ }).click();
  await page.waitForURL(/\/rooms\?friend=\d+/);
  await page.locator(".room-booking-form").waitFor();
  const friendId = Number(new URL(page.url()).searchParams.get("friend"));
  assert.ok(friendId > 0);
  await page.waitForFunction((id) => [...document.querySelectorAll(".room-booking-form select option")].some((option) => option.value === String(id)), friendId);
  assert.equal(await page.locator(".room-booking-form select").first().inputValue(), String(friendId));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile room form overflows horizontally");
  await page.setViewportSize({ width: 1280, height: 900 });

  let createdBody;
  let invitedBody;
  let invitationAttempts = 0;
  await page.route("**/api/rooms", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createdBody = route.request().postDataJSON();
    const time = createdBody.scheduled_at ? new Date(createdBody.scheduled_at) : new Date();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: 987654, code: "friend-room-test", mode: createdBody.mode,
      host_id: 1, your_id: 1, guest_id: null, can_cancel: true,
      scheduled_at: createdBody.scheduled_at,
      entry_opens_at: new Date(time.getTime() - 15 * 60_000).toISOString(),
      entry_available: !createdBody.scheduled_at,
    }) });
  });
  await page.route("**/api/rooms/987654/invite", async (route) => {
    invitationAttempts += 1;
    invitedBody = route.request().postDataJSON();
    if (invitationAttempts === 2) return route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Временный сбой"}' });
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"sent":true}' });
  });

  await page.locator(".room-booking-form textarea").first().fill("Согласовать сроки проекта");
  await page.locator(".room-booking-form textarea").nth(1).fill("Найти общий план работ");
  assert.equal(await page.getByRole("button", { name: "Сейчас", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: /Создать и пригласить/ }).click();
  await page.getByText("Приглашение отправлено в чат друга.").waitFor();
  assert.equal(createdBody.mode, "human");
  assert.equal(createdBody.scheduled_at, null);
  assert.equal(invitedBody.friend_id, friendId);
  await page.getByText("Вход открыт сейчас").waitFor();
  await page.getByRole("button", { name: /Открыть переписку/ }).click();
  await page.waitForURL(new RegExp(`/people\\?chat=${friendId}$`));

  await page.getByRole("button", { name: /1 на 1/ }).click();
  await page.locator(".room-booking-form").waitFor();
  await page.getByRole("button", { name: "Запланировать", exact: true }).click();
  await page.locator(".room-booking-form textarea").first().fill("Согласовать сроки проекта");
  await page.locator(".room-booking-form textarea").nth(1).fill("Найти общий план работ");
  await page.locator('button[title="Забронировать"]').first().click();
  await page.getByRole("button", { name: /Забронировать и пригласить/ }).click();
  await page.getByText("Время забронировано").waitFor();
  assert.ok(createdBody.scheduled_at);
  await page.getByText(/Встреча создана, но приглашение не отправилось/).waitFor();
  await page.getByRole("button", { name: "Повторить отправку" }).click();
  await page.getByText("Приглашение отправлено в чат друга.").waitFor();
  assert.equal(invitationAttempts, 3);
  assert.deepEqual(errors, []);
  console.log(`Friends → immediate/scheduled room → invitation/retry → chat: OK (friend ${friendId}, mocked POSTs)`);
} catch (failure) {
  console.error("QA page:", page.url(), (await page.locator("body").innerText()).slice(0, 1200));
  throw failure;
} finally {
  await browser.close();
}
