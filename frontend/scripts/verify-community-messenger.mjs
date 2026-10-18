import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012";
assert.equal(process.env.ARENA_QA_DISPOSABLE, "1", "Disposable QA database required");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname) && new URL(base).port === "8012", "Only disposable loopback :8012 allowed");
for (const key of ["ARENA_QA_AUTHOR", "ARENA_QA_READER", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const output = resolve("../.cache/feed-qa/messenger"); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const contexts = [], errors = [], checks = [], run = Date.now(); let lastPage;
async function account(username, register = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); contexts.push(context);
  const response = await context.request.post(`${base}/api/auth/${register ? "register" : "login"}`, { data: { username, password: process.env.ARENA_QA_PASSWORD } }); assert.ok(response.ok(), `Auth: ${response.status()}`);
  const { access_token } = await response.json(); await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const request = async (path, method = "GET", data) => { const result = await context.request.fetch(`${base}${path}`, { method, data, headers: { Authorization: `Bearer ${access_token}` } }); assert.ok(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`); return result.json(); };
  const page = await context.newPage(); page.setDefaultTimeout(18000); page.on("pageerror", error => errors.push(error.message));
  return { page, context, request, me: await request("/api/auth/me") };
}
async function friend(a, b) {
  let row = (await a.request("/api/social/friends")).find(item => item.id === b.me.id);
  if (row?.relationship === "FRIENDS") return;
  if (row?.relationship === "REQUEST_RECEIVED") await a.request(`/api/social/friends/${b.me.id}/accept`, "POST");
  else { if (row?.relationship !== "REQUEST_SENT") await a.request(`/api/social/friends/${b.me.id}/request`, "POST"); await b.request(`/api/social/friends/${a.me.id}/accept`, "POST"); }
}
async function open(page, person) {
  const contact = page.locator(".social-contact").filter({ hasText: `@${person.username}` });
  if (!(await contact.isVisible().catch(() => false))) await page.getByRole("button", { name: "Назад к чатам", exact: true }).click();
  await contact.click(); await page.locator(".social-chat").waitFor(); assert.equal(new URL(page.url()).searchParams.get("chat"), String(person.id));
  await page.locator(".social-messages[aria-busy='false']").waitFor();
}
async function gotoChat(page, id, prefix = "/feed") { lastPage = page; await page.goto(`${base}${prefix}?section=messages&chat=${id}`); await page.locator(".social-messages[aria-busy='false']").waitFor(); }
async function check(name, task) {
  if (process.env.ARENA_QA_CHECKS && !process.env.ARENA_QA_CHECKS.split(",").includes(name)) return;
  try { await task(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (failure) { checks.push({ name, passed: false, error: failure.message }); console.error(`FAIL ${name}: ${failure.message}`); await lastPage?.screenshot({ path: resolve(output, `${name}.png`) }).catch(() => {}); }
}
try {
  const author = await account(process.env.ARENA_QA_AUTHOR), reader = await account(process.env.ARENA_QA_READER), peer = await account(`qa-messenger-${run}`, true);
  await friend(author, reader); await friend(author, peer);
  await peer.request(`/api/social/messages/${author.me.id}`, "POST", { text: `Third peer ${run}` });
  await check("legacy-redirect-query-and-close", async () => {
    const page = author.page; lastPage = page;
    await page.goto(`${base}/people?chat=${reader.me.id}&scope=friends&q=kept&probe=route`); await page.locator(".social-messages[aria-busy='false']").waitFor();
    let url = new URL(page.url()); assert.equal(url.pathname, "/feed"); assert.equal(url.searchParams.get("section"), "messages"); assert.equal(url.searchParams.get("q"), "kept"); assert.equal(url.searchParams.get("probe"), "route");
    await page.getByRole("button", { name: "Назад к чатам", exact: true }).click(); url = new URL(page.url()); assert.equal(url.searchParams.has("chat"), false); assert.equal(url.searchParams.get("section"), "messages"); assert.equal(url.searchParams.get("scope"), "friends");
    await page.goto(`${base}/people?probe=friends`); await page.locator(".friends-directory").waitFor(); assert.equal(new URL(page.url()).searchParams.get("section"), "friends"); assert.equal(new URL(page.url()).searchParams.get("probe"), "friends");
  });
  await check("profile-workspace-contained-navigation", async () => {
    const page = author.page; lastPage = page; await page.goto(`${base}/profile?section=friends&probe=profile`);
    const row = page.locator(".friends-directory-row").filter({ hasText: reader.me.username }); await row.getByRole("button", { name: "Написать", exact: true }).click(); await page.locator(".social-messages[aria-busy='false']").waitFor();
    let url = new URL(page.url()); assert.equal(url.pathname, "/profile"); assert.equal(url.searchParams.get("section"), "messages"); assert.equal(url.searchParams.get("chat"), String(reader.me.id)); assert.equal(url.searchParams.get("probe"), "profile");
    await page.getByRole("button", { name: "Назад к чатам", exact: true }).click(); assert.equal(new URL(page.url()).pathname, "/profile"); assert.equal(new URL(page.url()).searchParams.has("chat"), false);
  });
  await check("real-send-receive-and-read", async () => {
    const page = author.page; lastPage = page; await reader.page.goto(`${base}/feed?section=messages`); await reader.page.locator(".social-contact").first().waitFor(); await gotoChat(page, reader.me.id);
    const text = `Живое сообщение ${run}`; await page.getByLabel("Сообщение", { exact: true }).fill(text); await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click(); await page.locator(".social-messages").getByText(text, { exact: true }).waitFor();
    let messages = await reader.request(`/api/social/messages/${author.me.id}?mark_read=false`); assert.equal(messages.find(item => item.text === text).is_read, false, "Listing contacts must not read messages");
    await reader.page.reload(); await reader.page.locator(".social-contact").filter({ hasText: author.me.username }).locator(".friends-unread").waitFor();
    const read = reader.page.waitForResponse(response => response.url().includes(`/messages/${author.me.id}?mark_read=true`)); await open(reader.page, author.me); await read;
    messages = await reader.request(`/api/social/messages/${author.me.id}?mark_read=false`); assert.equal(messages.find(item => item.text === text).is_read, true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.locator(".social-message").filter({ hasText: text }).getByText(/Прочитано/).waitFor();
  });
  await check("peer-drafts-spa-profile-and-reload", async () => {
    const page = author.page; lastPage = page; await gotoChat(page, reader.me.id); await page.getByLabel("Сообщение", { exact: true }).fill(`Draft reader ${run}`);
    await open(page, peer.me); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), ""); await page.getByLabel("Сообщение", { exact: true }).fill(`Draft peer ${run}`);
    await open(page, reader.me); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Draft reader ${run}`);
    await page.locator(".community-tabs").getByRole("link", { name: "Друзья", exact: true }).click(); await page.locator(".friends-directory-row").filter({ hasText: reader.me.username }).getByRole("button", { name: "Написать", exact: true }).click(); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Draft reader ${run}`);
    await gotoChat(page, reader.me.id, "/profile"); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Draft reader ${run}`); await page.reload(); await page.getByLabel("Сообщение", { exact: true }).waitFor(); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Draft reader ${run}`);
  });
  await check("send-switch-return-no-duplicate-no-draft-loss", async () => {
    const page = author.page; lastPage = page; await gotoChat(page, reader.me.id); let release, hit; const gate = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { hit = resolve; }); let posts = 0;
    const url = `${base}/api/social/messages/${reader.me.id}`;
    await page.route(url, async route => { if (route.request().method() !== "POST") return route.continue(); posts++; const response = await route.fetch(); hit(); await gate; await route.fulfill({ response }).catch(() => {}); });
    try {
      const text = `Pending send ${run}`; await page.getByLabel("Сообщение", { exact: true }).fill(text); await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click(); await started;
      await open(page, peer.me); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Draft peer ${run}`); await open(page, reader.me); assert.equal(await page.getByRole("button", { name: "Отправить сообщение", exact: true }).isDisabled(), true);
      await page.getByLabel("Сообщение", { exact: true }).fill(`New after send ${run}`); release(); await page.getByRole("button", { name: "Отправить сообщение", exact: true }).waitFor({ state: "visible" }); await page.waitForFunction(() => !document.querySelector(".social-composer button").disabled);
      assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `New after send ${run}`); assert.equal(posts, 1); await open(page, peer.me); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Draft peer ${run}`);
    } finally { release(); await page.unroute(url); }
  });
  await check("late-thread-get-not-rendered-or-read", async () => {
    const page = author.page; lastPage = page; await gotoChat(page, reader.me.id); const unique = `Unread delayed peer ${run}`; await peer.request(`/api/social/messages/${author.me.id}`, "POST", { text: unique });
    let release, hit; const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { hit = resolve; }); const url = `${base}/api/social/messages/${peer.me.id}?mark_read=false`;
    await page.route(url, async route => { const response = await route.fetch(); hit(); await gate; await route.fulfill({ response }).catch(() => {}); });
    try {
      await page.locator(".social-contact").filter({ hasText: peer.me.username }).click(); await started;
      await page.getByRole("button", { name: "Назад к чатам", exact: true }).click(); await open(page, reader.me); release(); await page.waitForTimeout(200);
      assert.equal(await page.locator(".social-messages").getByText(unique, { exact: true }).count(), 0); const messages = await author.request(`/api/social/messages/${peer.me.id}?mark_read=false`); assert.equal(messages.find(item => item.text === unique).is_read, false);
    } finally { release(); await page.unroute(url); }
  });
  await check("hidden-tab-pauses-thread-polling", async () => {
    const page = author.page; lastPage = page; await gotoChat(page, reader.me.id); let calls = 0;
    const observe = request => { if (request.url().includes(`/api/social/messages/${reader.me.id}`)) calls++; }; page.on("request", observe);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    try { await page.waitForTimeout(5500); assert.equal(calls, 0); }
    finally { page.off("request", observe); await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); }); }
  });
  await check("message-privacy-keeps-history-and-draft", async () => {
    const page = author.page; lastPage = page; await gotoChat(page, peer.me.id); await page.getByLabel("Сообщение", { exact: true }).fill(`Private draft ${run}`);
    const profile = { username: peer.me.username, first_name: "QA", last_name: "Messenger", messages_visibility: "none", profile_visibility: "public", search_visibility: "all" };
    try {
      await peer.request("/api/social/profile", "PUT", profile); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.getByText("Пользователь ограничил личные сообщения. История чата остаётся доступной.", { exact: true }).waitFor(); assert.equal(await page.getByLabel("Сообщение", { exact: true }).isDisabled(), true); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Private draft ${run}`); await page.locator(".social-messages").getByText(`Third peer ${run}`, { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: /1 на 1/ }).isDisabled(), true);
    } finally { await peer.request("/api/social/profile", "PUT", { ...profile, messages_visibility: "friends" }); }
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForFunction(() => !document.querySelector(".social-composer textarea").disabled); assert.equal(await page.getByLabel("Сообщение", { exact: true }).inputValue(), `Private draft ${run}`);
  });
  await check("shared-post-card-live-access-and-room-link", async () => {
    const page = author.page; lastPage = page;
    const post = await reader.request("/api/social/posts", "POST", { body: `Shared message ${run}`, audience: "PUBLIC", status: "PUBLISHED", comments_enabled: true, media_ids: [] }); await reader.request(`/api/social/posts/${post.id}/share-message`, "POST", { recipient_id: author.me.id, text: `Карточка ${run}` });
    await gotoChat(page, reader.me.id); const card = page.locator(".social-shared-post").filter({ hasText: `Карточка ${run}` }); await card.getByRole("link", { name: "Открыть публикацию →", exact: true }).waitFor(); assert.equal(await card.getByRole("link").getAttribute("href"), `/feed/post/${post.id}`);
    await reader.request(`/api/social/posts/${post.id}`, "DELETE"); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await card.getByText("Публикация недоступна", { exact: true }).waitFor(); assert.equal(await card.getByRole("link").count(), 0);
    await page.getByRole("button", { name: /1 на 1/ }).click(); await page.waitForURL(`**/rooms?friend=${reader.me.id}`); await page.locator(".room-booking-form").waitFor();
  });
  await check("desktop-mobile-workspace-no-overflow", async () => {
    const page = author.page; lastPage = page;
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await gotoChat(page, reader.me.id); await page.locator(".social-chat-header").waitFor(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
      const box = await page.getByRole("button", { name: "Назад к чатам", exact: true }).boundingBox(); assert.ok(box.width >= 44 && box.height >= 44); await page.screenshot({ path: resolve(output, `chat-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Назад к чатам", exact: true }).click(); await page.locator(".social-contact").first().waitFor(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `List overflow at ${width}`);
    }
  });
  assert.deepEqual(errors, []); console.log(JSON.stringify({ checks, browser_errors: errors }, null, 2)); if (checks.some(item => !item.passed)) process.exitCode = 1;
} finally { for (const context of contexts) await context.close(); await browser.close(); }
