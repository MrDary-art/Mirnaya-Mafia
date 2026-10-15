import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

// Mutates only disposable QA :8012 and one newly registered QA partner.
// The existing reader/author relationship is never changed by this script.
const origin = new URL(process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012");
assert.equal(process.env.ARENA_QA_DISPOSABLE, "1", "Explicit disposable QA guard required");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname) && origin.port === "8012" && origin.protocol === "http:", "Only loopback disposable HTTP :8012 is allowed");
assert.ok(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash, "Use the bare QA origin");
for (const key of ["ARENA_QA_READER", "ARENA_QA_AUTHOR", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const base = origin.origin, output = resolve("../.cache/community-qa/friends");
const partnerUsername = `stories-qa-friends-${Date.now()}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const contexts = [], checks = [], errors = [], mutations = [];
let lastPage, reader, partner, baseline;
const profilePath = username => `/people/${encodeURIComponent(username)}`;

async function account(username, register = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); contexts.push(context);
  const response = await context.request.post(`${base}/api/auth/${register ? "register" : "login"}`, { data: { username, password: process.env.ARENA_QA_PASSWORD, ...(register ? { avatar_code: "avatar_analyst" } : {}) } });
  assert.ok(response.ok(), `${register ? "Register" : "Login"} ${username}: ${response.status()} ${await response.text()}`);
  const { access_token } = await response.json();
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const raw = (path, method = "GET", data) => {
    assert.ok(path.startsWith("/api/") && !path.includes("://"), "QA requests must use local API paths");
    return context.request.fetch(`${base}${path}`, { method, data, headers: { Authorization: `Bearer ${access_token}` } });
  };
  const request = async (path, method = "GET", data) => { const result = await raw(path, method, data); assert.ok(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`); return result.json(); };
  const me = await request("/api/auth/me"); assert.equal(me.is_admin, false, "Friendship actors must not be administrators");
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "POST" && /^\/api\/social\/friends\//.test(new URL(request.url()).pathname)) mutations.push({ actor: me.id, path: new URL(request.url()).pathname }); });
  return { context, page, me, request, raw };
}

async function mutation(page, otherId, action, click) {
  lastPage = page;
  const path = `/api/social/friends/${otherId}/${action}`;
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST");
  await click();
  const response = await pending;
  assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function relationship(actor, other) { return (await actor.request(`/api/social/people/${encodeURIComponent(other.me.username)}`)).relationship; }
async function publicProfile(actor, other) {
  lastPage = actor.page;
  await actor.page.goto(`${base}${profilePath(other.me.username)}`);
  const actions = actor.page.locator(".profile-social-actions:not(.is-compact)"); await actions.waitFor();
  return actions;
}
async function findPerson(actor, other, pathname = "/feed") {
  lastPage = actor.page;
  await actor.page.goto(`${base}${pathname}?section=friends&qa_keep=1`);
  const workspace = actor.page.getByRole("region", { name: "Мои друзья", exact: true });
  await workspace.getByRole("button", { name: "Найти людей", exact: true }).first().click();
  const form = workspace.locator(".social-discover-search");
  await form.locator("input").fill(other.me.username);
  await form.getByRole("button", { name: "Найти", exact: true }).click();
  const row = workspace.locator(".social-result").filter({ hasText: `@${other.me.username}` });
  await row.waitFor(); assert.equal(await row.count(), 1);
  return row;
}
async function screenshot(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${name}: horizontal overflow`);
}
async function check(name, task) {
  try { await task(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); if (lastPage && !lastPage.isClosed()) await screenshot(lastPage, `failure-${name}`).catch(() => {}); throw error; }
}
function partnerProfile(messagesVisibility) {
  return { username: partner.me.username, first_name: "QA", last_name: "Партнёр", profile_visibility: "public", search_visibility: "all", messages_visibility: messagesVisibility };
}
async function clearTestPair() {
  if (!reader || !partner) return;
  // Never acts on any account other than this run's brand-new partner.
  const mine = await reader.request("/api/social/blocked");
  if (mine.some(person => person.id === partner.me.id)) await reader.request(`/api/social/friends/${partner.me.id}/unblock`, "POST");
  const theirs = await partner.request("/api/social/blocked");
  if (theirs.some(person => person.id === reader.me.id)) await partner.request(`/api/social/friends/${reader.me.id}/unblock`, "POST");
  const state = await relationship(reader, partner);
  if (state === "FRIENDS") await reader.request(`/api/social/friends/${partner.me.id}/remove`, "POST");
  if (state === "REQUEST_RECEIVED") await reader.request(`/api/social/friends/${partner.me.id}/decline`, "POST");
  if (state === "REQUEST_SENT") await partner.request(`/api/social/friends/${reader.me.id}/decline`, "POST");
}

try {
  reader = await account(process.env.ARENA_QA_READER);
  baseline = (await reader.request(`/api/social/people/${encodeURIComponent(process.env.ARENA_QA_AUTHOR)}`)).relationship;
  partner = await account(partnerUsername, true);
  await check("public-self-no-social-self-actions", async () => {
    const actions = await publicProfile(reader, reader);
    assert.equal(await actions.getByRole("button").count(), 0);
    assert.equal(await actions.getByRole("link", { name: "Мой профиль", exact: true }).getAttribute("href"), "/profile");
  });
  await check("people-search-request-real-api", async () => {
    const row = await findPerson(reader, partner);
    await mutation(reader.page, partner.me.id, "request", () => row.getByRole("button", { name: "Добавить", exact: true }).click());
    assert.equal(await relationship(reader, partner), "REQUEST_SENT");
    assert.equal(await relationship(partner, reader), "REQUEST_RECEIVED");
  });
  await check("public-profile-decline-canonical", async () => {
    const actions = await publicProfile(partner, reader);
    await mutation(partner.page, reader.me.id, "decline", () => actions.getByRole("button", { name: "Отклонить", exact: true }).click());
    assert.equal(await relationship(reader, partner), "NONE");
  });
  await check("public-profile-request-real-api", async () => {
    const actions = await publicProfile(reader, partner);
    await mutation(reader.page, partner.me.id, "request", () => actions.getByRole("button", { name: "Добавить в друзья", exact: true }).click());
    assert.equal(await relationship(partner, reader), "REQUEST_RECEIVED");
  });
  await check("people-search-accept-not-request", async () => {
    const row = await findPerson(partner, reader);
    const start = mutations.length;
    await mutation(partner.page, reader.me.id, "accept", () => row.getByRole("button", { name: "Принять заявку", exact: true }).click());
    assert.deepEqual(mutations.slice(start).map(item => item.path), [`/api/social/friends/${reader.me.id}/accept`]);
    assert.equal(await relationship(reader, partner), "FRIENDS");
  });
  await check("public-message-enters-shared-feed-chat", async () => {
    const actions = await publicProfile(reader, partner);
    await actions.getByRole("button", { name: "Написать сообщение", exact: true }).click();
    await reader.page.waitForURL(url => url.pathname === "/feed" && url.searchParams.get("section") === "messages" && url.searchParams.get("chat") === String(partner.me.id));
    await reader.page.locator(".friends-chat").waitFor();
    await screenshot(reader.page, "public-profile-shared-chat");
  });
  await check("embedded-profile-search-preserves-chat-host", async () => {
    const row = await findPerson(partner, reader, "/profile");
    await row.getByRole("button", { name: "Написать", exact: true }).click();
    await partner.page.waitForURL(url => url.pathname === "/profile" && url.searchParams.get("section") === "messages" && url.searchParams.get("chat") === String(reader.me.id));
    assert.equal(new URL(partner.page.url()).searchParams.get("qa_keep"), "1");
    await partner.page.locator(".friends-chat").waitFor();
  });
  await check("real-privacy-false-disabled-in-profile-and-search", async () => {
    await partner.request("/api/social/profile", "PUT", partnerProfile("none"));
    try {
      const dto = await reader.request(`/api/social/people/${encodeURIComponent(partner.me.username)}`); assert.equal(dto.can_message, false);
      let actions = await publicProfile(reader, partner);
      assert.equal(await actions.getByRole("button", { name: "Сообщения недоступны", exact: true }).isDisabled(), true);
      const row = await findPerson(reader, partner);
      assert.equal(await row.getByRole("button", { name: "Сообщения недоступны", exact: true }).isDisabled(), true);
      const denied = await reader.raw(`/api/social/messages/${partner.me.id}`, "POST", { text: "QA: это сообщение должно быть отклонено" }); assert.equal(denied.status(), 403);
      await reader.page.setViewportSize({ width: 390, height: 844 });
      await screenshot(reader.page, "privacy-disabled-search-mobile");
      await reader.page.setViewportSize({ width: 1440, height: 1000 });
      await check("real-privacy-false-disabled-in-share-dialog", async () => {
        const feed = await reader.request("/api/social/feed?limit=20");
        const post = feed.items.find(item => item.status === "PUBLISHED");
        assert.ok(post, "An existing accessible QA publication is required for share verification");
        await reader.page.goto(`${base}/feed/post/${post.id}`);
        await reader.page.getByRole("button", { name: /^Поделиться публикацией\. Репостов:/ }).click();
        const dialog = reader.page.getByRole("dialog", { name: "Поделиться публикацией", exact: true });
        await dialog.getByRole("button", { name: "Сообщение", exact: true }).click();
        await dialog.getByRole("searchbox").fill(partner.me.username);
        const recipient = dialog.locator(`input[type="radio"][value="${partner.me.id}"]`);
        await recipient.waitFor();
        assert.equal(await recipient.isDisabled(), true);
        await dialog.getByText("Личные сообщения закрыты", { exact: false }).waitFor();
        assert.equal(await dialog.getByRole("button", { name: "Отправить", exact: true }).isDisabled(), true);
        const deniedShare = await reader.raw(`/api/social/posts/${post.id}/share-message`, "POST", { recipient_id: partner.me.id, text: "QA: отправка должна быть запрещена" });
        assert.equal(deniedShare.status(), 403);
        await screenshot(reader.page, "privacy-disabled-share-dialog");
      });
    } finally { await partner.request("/api/social/profile", "PUT", partnerProfile("friends")); }
  });
  await check("public-remove-confirmed-canonical", async () => {
    const actions = await publicProfile(reader, partner);
    reader.page.once("dialog", dialog => dialog.accept());
    await mutation(reader.page, partner.me.id, "remove", () => actions.getByRole("button", { name: "Удалить из друзей", exact: true }).click());
    assert.equal(await relationship(reader, partner), "NONE");
  });
  await check("public-accept-canonical", async () => {
    await partner.request(`/api/social/friends/${reader.me.id}/request`, "POST");
    const actions = await publicProfile(reader, partner); const start = mutations.length;
    await mutation(reader.page, partner.me.id, "accept", () => actions.getByRole("button", { name: "Принять заявку", exact: true }).click());
    assert.deepEqual(mutations.slice(start).map(item => item.path), [`/api/social/friends/${partner.me.id}/accept`]);
    assert.equal(await relationship(reader, partner), "FRIENDS");
  });
  await check("people-search-decline-canonical", async () => {
    await reader.request(`/api/social/friends/${partner.me.id}/remove`, "POST");
    await partner.request(`/api/social/friends/${reader.me.id}/request`, "POST");
    const row = await findPerson(reader, partner);
    await mutation(reader.page, partner.me.id, "decline", () => row.getByRole("button", { name: "Отклонить", exact: true }).click());
    assert.equal(await relationship(reader, partner), "NONE");
  });
  await check("public-block-confirmation-real-api", async () => {
    const actions = await publicProfile(reader, partner);
    reader.page.once("dialog", dialog => dialog.accept());
    await mutation(reader.page, partner.me.id, "block", () => actions.getByRole("button", { name: "Заблокировать", exact: true }).click());
    await reader.page.getByRole("heading", { name: "Пользователь заблокирован", exact: true }).waitFor();
    assert.ok((await reader.request("/api/social/blocked")).some(person => person.id === partner.me.id));
    await reader.request(`/api/social/friends/${partner.me.id}/unblock`, "POST");
  });
  assert.deepEqual(errors, [], "Browser runtime errors");
} catch (error) {
  if (!checks.some(check => !check.passed)) checks.push({ name: "setup-or-runtime", passed: false, error: error.message });
  process.exitCode = 1;
} finally {
  try {
    await clearTestPair();
    if (reader && baseline !== undefined) assert.equal((await reader.request(`/api/social/people/${encodeURIComponent(process.env.ARENA_QA_AUTHOR)}`)).relationship, baseline, "The existing reader/author relationship must remain unchanged");
  } catch (error) { checks.push({ name: "isolated-pair-cleanup", passed: false, error: error.message }); process.exitCode = 1; }
  const report = { passed: checks.length > 0 && checks.every(check => check.passed) && errors.length === 0, checks, browser_errors: errors,
    partner: partner ? { username: partner.me.username, id: partner.me.id } : null, mutation_count: mutations.length, screenshots: output };
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
  for (const context of contexts) await context.close();
  await browser.close();
}
