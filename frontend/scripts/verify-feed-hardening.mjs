import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012";
assert.equal(process.env.ARENA_QA_DISPOSABLE, "1", "Disposable QA database required");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname) && new URL(base).port === "8012", "Only disposable loopback preview :8012 is allowed");
for (const key of ["ARENA_QA_AUTHOR", "ARENA_QA_READER", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const screenshots = resolve("../.cache/feed-qa/hardening"); await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const contexts = [], checks = [], errors = []; const run = Date.now(); let lastPage;
async function account(key) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); contexts.push(context);
  const response = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env[key], password: process.env.ARENA_QA_PASSWORD } }); assert.ok(response.ok());
  const { access_token } = await response.json();
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const request = async (path, method = "GET", data) => { const result = await context.request.fetch(`${base}${path}`, { method, data, headers: { Authorization: `Bearer ${access_token}` } }); assert.ok(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`); return result.json(); };
  const me = await request("/api/auth/me"); const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", failure => errors.push(failure.message));
  return { context, page, request, me };
}
async function mutation(page, path, method, action) {
  lastPage = page; const pending = page.waitForResponse(result => new URL(result.url()).pathname === path && result.request().method() === method);
  await action(); const result = await pending; assert.ok(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`); return { data: await result.json(), body: result.request().postDataJSON() };
}
async function check(name, task) {
  if (process.env.ARENA_QA_CHECKS && !process.env.ARENA_QA_CHECKS.split(",").includes(name)) return;
  try { await task(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (failure) { checks.push({ name, passed: false, error: failure.message }); console.error(`FAIL ${name}: ${failure.message}`); await lastPage?.screenshot({ path: resolve(screenshots, `${name}.png`) }).catch(() => {}); }
}
const postBody = body => ({ body, audience: "PUBLIC", status: "PUBLISHED", comments_enabled: true, media_ids: [] });
async function edit(page, post) { await page.goto(`${base}/feed/post/${post.id}`); const card = page.locator(`[data-post-id='${post.id}']`); await card.locator("summary").click(); await card.getByRole("button", { name: "Редактировать", exact: true }).click(); return page.locator(".arena-feed-composer[aria-label='Редактировать публикацию']"); }
async function clearLocal(page) { await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) if (key.startsWith("arena:feed-composer:")) sessionStorage.removeItem(key); }); }
try {
  const author = await account("ARENA_QA_AUTHOR"), reader = await account("ARENA_QA_READER");
  const source = await author.request("/api/social/posts", "POST", postBody(`Hardening source ${run}`));
  const poll = await author.request("/api/social/posts", "POST", { ...postBody(""), poll: { options: ["Уточнить интересы", "Обсудить критерии"] } });
  const repost = await reader.request(`/api/social/posts/${source.id}/repost`, "POST", { body: "", audience: "PUBLIC" });
  const scenario = (await author.request("/api/social/attachments?kind=SCENARIO")).items.find(item => item.available);
  const linkedPost = await author.request("/api/social/posts", "POST", { ...postBody(`Linked ${run}`), linked_content: { kind: scenario.kind, id: scenario.id } });
  await check("local-draft-privacy-poll-link-reload", async () => {
    const page = author.page; lastPage = page; await page.goto(`${base}/feed`); await clearLocal(page);
    await page.goto(`${base}/feed?attach=SCENARIO&id=${scenario.id}`); const form = page.locator(".arena-feed-composer").first();
    await form.getByText(scenario.title, { exact: true }).waitFor(); await form.getByLabel("Текст публикации", { exact: true }).fill(`Локально ${run}`);
    await form.getByLabel("Кто увидит публикацию", { exact: true }).selectOption("ONLY_ME"); await form.getByLabel("Разрешить комментарии", { exact: true }).uncheck();
    await form.getByRole("button", { name: "Опрос", exact: true }).click(); await form.getByPlaceholder("Вариант 1").fill("Первый ответ"); await form.getByPlaceholder("Вариант 2").fill("Второй ответ");
    await page.reload(); await form.getByLabel("Текст публикации", { exact: true }).waitFor();
    assert.equal(await form.getByLabel("Текст публикации", { exact: true }).inputValue(), `Локально ${run}`); assert.equal(await form.getByLabel("Кто увидит публикацию", { exact: true }).inputValue(), "ONLY_ME"); assert.equal(await form.getByLabel("Разрешить комментарии", { exact: true }).isChecked(), false); assert.equal(await form.getByPlaceholder("Вариант 1").inputValue(), "Первый ответ"); await form.getByText(scenario.title, { exact: true }).waitFor();
    await page.locator("a[href='/saved']").first().click(); await page.goBack(); await form.getByPlaceholder("Вариант 2").waitFor(); assert.equal(await form.getByPlaceholder("Вариант 2").inputValue(), "Второй ответ");
    await clearLocal(page);
  });
  await check("edit-repost-and-poll-only", async () => {
    let form = await edit(reader.page, repost); assert.equal(await form.locator("input[type='file']").count(), 0); await form.getByLabel("Текст публикации", { exact: true }).fill(`Исправленная подпись ${run}`);
    const changed = await mutation(reader.page, `/api/social/posts/${repost.id}`, "PATCH", () => form.getByRole("button", { name: "Сохранить", exact: true }).click()); assert.ok(!Object.hasOwn(changed.body, "media_ids")); assert.ok(!Object.hasOwn(changed.body, "linked_content")); assert.equal(changed.data.kind, "REPOST");
    form = await edit(author.page, poll); assert.equal(await form.getByRole("button", { name: "Сохранить", exact: true }).isEnabled(), true); assert.equal(await form.getByPlaceholder("Вариант 1").count(), 0);
    const pollChanged = await mutation(author.page, `/api/social/posts/${poll.id}`, "PATCH", () => form.getByRole("button", { name: "Сохранить", exact: true }).click()); assert.equal(pollChanged.data.body, ""); assert.equal(pollChanged.data.poll.options.length, 2); assert.ok(!Object.hasOwn(pollChanged.body, "poll"));
  });
  await check("unchanged-unavailable-link-not-resubmitted", async () => {
    const page = author.page; lastPage = page; const url = `${base}/api/social/posts/${linkedPost.id}`;
    await page.route(url, async route => { if (route.request().method() !== "GET") return route.continue(); const response = await route.fetch(); const data = await response.json(); data.linked_content = { kind: "SCENARIO", title: "Материал недоступен", available: false }; await route.fulfill({ response, json: data }); });
    try { const form = await edit(page, linkedPost); await form.getByLabel("Текст публикации", { exact: true }).fill(`Только текст ${run}`); const changed = await mutation(page, `/api/social/posts/${linkedPost.id}`, "PATCH", () => form.getByRole("button", { name: "Сохранить", exact: true }).click()); assert.ok(!Object.hasOwn(changed.body, "linked_content")); assert.equal(changed.data.linked_content.id, scenario.id); }
    finally { await page.unroute(url); }
  });
  await check("comment-draft-collapse-reload", async () => {
    const page = reader.page; lastPage = page; await page.goto(`${base}/feed/post/${source.id}`); const card = page.locator(`[data-post-id='${source.id}']`); await card.getByLabel("Ваш комментарий", { exact: true }).fill(`Комментарий без отправки ${run}`);
    await card.getByRole("button", { name: /^Комментарии:/ }).click(); await card.getByRole("button", { name: /^Комментарии:/ }).click(); assert.equal(await card.getByLabel("Ваш комментарий", { exact: true }).inputValue(), `Комментарий без отправки ${run}`);
    await page.reload(); await card.getByLabel("Ваш комментарий", { exact: true }).waitFor(); assert.equal(await card.getByLabel("Ваш комментарий", { exact: true }).inputValue(), `Комментарий без отправки ${run}`);
    await card.getByLabel("Ваш комментарий", { exact: true }).fill("");
  });
  await check("share-fast-tab-switch-and-count-failure", async () => {
    const page = reader.page; lastPage = page; await page.goto(`${base}/feed/post/${source.id}`); await page.locator(`[data-post-id='${source.id}']`).getByRole("button", { name: /^Поделиться публикацией/ }).click(); const dialog = page.getByRole("dialog");
    let release; const barrier = new Promise(resolve => { release = resolve; }); const contacts = /\/api\/social\/(friends|dialogs)$/;
    await page.route(contacts, async route => { const response = await route.fetch(); await barrier; await route.fulfill({ response }).catch(() => {}); });
    try { await dialog.getByRole("button", { name: "Сообщение", exact: true }).click(); await dialog.getByLabel("Сообщение (необязательно)").fill("Текст личного сообщения"); await dialog.getByRole("button", { name: "На мою стену", exact: true }).click(); await dialog.getByLabel("Ваш комментарий к репосту").fill(`Счётчик может обновиться позже ${run}`); assert.equal(await dialog.getByRole("button", { name: "Опубликовать репост", exact: true }).isEnabled(), true); release(); }
    finally { release(); await page.unroute(contacts); }
    await page.route(`${base}/api/social/posts/${source.id}`, route => route.request().method() === "GET" ? route.fulfill({ status: 503, json: { detail: "QA count refresh failure" } }) : route.continue());
    try { await mutation(page, `/api/social/posts/${source.id}/repost`, "POST", () => dialog.getByRole("button", { name: "Опубликовать репост", exact: true }).click()); await dialog.getByText("Репост появился на вашей странице.", { exact: true }).waitFor(); assert.equal(await dialog.getByRole("button", { name: "Опубликовать репост", exact: true }).isDisabled(), true); assert.equal(await dialog.getByText("QA count refresh failure", { exact: true }).count(), 0); await dialog.getByRole("button", { name: "Сообщение", exact: true }).click(); assert.equal(await dialog.getByLabel("Сообщение (необязательно)").inputValue(), "Текст личного сообщения"); await dialog.getByLabel("Сообщение (необязательно)").fill(""); await page.keyboard.press("Escape"); }
    finally { await page.unroute(`${base}/api/social/posts/${source.id}`); }
  });
  await check("media-alt-limit-upload-retry-and-spa-draft", async () => {
    const page = author.page; lastPage = page; await page.goto(`${base}/feed`); await clearLocal(page); await page.reload(); const form = page.locator(".arena-feed-composer").first(); await form.getByLabel("Текст публикации", { exact: true }).fill(`Повтор загрузки ${run}`);
    const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8; const context = canvas.getContext("2d"); context.fillStyle = "#668855"; context.fillRect(0, 0, 8, 8); return canvas.toDataURL("image/png").split(",")[1]; });
    await form.locator("input[type='file']").setInputFiles({ name: "qa-fixture.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    const alt = form.getByLabel("Описание изображения", { exact: true }); assert.equal(await alt.getAttribute("maxlength"), "300"); await alt.fill("Описание для теста");
    await page.locator("a[href='/saved']").first().click(); await page.goBack(); await form.locator(".arena-feed-upload-item img").waitFor(); assert.equal(await form.getByLabel("Описание изображения", { exact: true }).inputValue(), "Описание для теста");
    let uploadCount = 0; const track = request => { if (new URL(request.url()).pathname === "/api/social/media/upload" && request.method() === "POST") uploadCount++; }; page.on("request", track);
    await page.route(`${base}/api/social/posts`, route => route.request().method() === "POST" ? route.fulfill({ status: 503, json: { detail: "QA post retry" } }) : route.continue());
    await form.getByRole("button", { name: "Опубликовать", exact: true }).click(); await form.getByText("QA post retry", { exact: true }).waitFor(); assert.equal(uploadCount, 1);
    await page.unroute(`${base}/api/social/posts`); await mutation(page, "/api/social/posts", "POST", () => form.getByRole("button", { name: "Опубликовать", exact: true }).click()); assert.equal(uploadCount, 1); page.off("request", track);
  });
  await check("late-initial-feed-preserves-created-post", async () => {
    const page = author.page; lastPage = page; let release, entered; const barrier = new Promise(resolve => { release = resolve; }); const captured = new Promise(resolve => { entered = resolve; }); let held = false;
    await page.route(/\/api\/social\/feed(?:\?|$)/, async route => { if (held) return route.continue(); held = true; const response = await route.fetch(); entered(); await barrier; await route.fulfill({ response }).catch(() => {}); });
    try { await page.goto(`${base}/feed`); await captured; const form = page.locator(".arena-feed-composer").first(); await form.getByLabel("Текст публикации", { exact: true }).fill(`Создано во время загрузки ${run}`); const created = await mutation(page, "/api/social/posts", "POST", () => form.getByRole("button", { name: "Опубликовать", exact: true }).click()); release(); await page.locator(`[data-post-id='${created.data.id}']`).waitFor(); }
    finally { release(); await page.unroute(/\/api\/social\/feed(?:\?|$)/); }
  });
  await check("late-page-does-not-resurrect-deleted-post", async () => {
    const page = author.page; lastPage = page; const doomed = await author.request("/api/social/posts", "POST", postBody(`Удаление с задержанной страницей ${run}`)); let release, entered; const barrier = new Promise(resolve => { release = resolve; }); const captured = new Promise(resolve => { entered = resolve; });
    await page.route(/\/api\/social\/feed(?:\?|$)/, async route => { const url = new URL(route.request().url()); if (!url.searchParams.has("cursor")) return route.fulfill({ json: { items: [doomed], next_cursor: "qa-stale-page" } }); entered(); await barrier; await route.fulfill({ json: { items: [doomed], next_cursor: null } }).catch(() => {}); });
    try { await page.goto(`${base}/feed`); const card = page.locator(`[data-post-id='${doomed.id}']`); await card.waitFor(); await page.locator(".arena-feed-load-more").scrollIntoViewIfNeeded(); await captured; await card.locator("summary").click(); await card.getByRole("button", { name: "Удалить публикацию", exact: true }).click(); await mutation(page, `/api/social/posts/${doomed.id}`, "DELETE", () => page.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click()); const lateResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get("cursor") === "qa-stale-page"); release(); await (await lateResponse).finished(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); assert.equal(await page.locator(`[data-post-id='${doomed.id}']`).count(), 0); }
    finally { release(); await page.unroute(/\/api\/social\/feed(?:\?|$)/); }
  });
  await check("saved-removal-after-server-success", async () => {
    await reader.request(`/api/social/posts/${source.id}/bookmark`, "POST"); const page = reader.page; lastPage = page; await page.goto(`${base}/saved`); const card = page.locator(`[data-post-id='${source.id}']`); await card.waitFor(); await mutation(page, `/api/social/posts/${source.id}/bookmark`, "DELETE", () => card.getByRole("button", { name: "Убрать из сохранённого", exact: true }).click()); await card.waitFor({ state: "detached" });
  });
  await check("created-post-respects-search-filter", async () => {
    const page = author.page; lastPage = page; await page.goto(`${base}/feed?q=never-matches-${run}`); const form = page.locator(".arena-feed-composer").first(); await form.getByLabel("Текст публикации", { exact: true }).fill(`Пост вне поискового фильтра ${run}`);
    const nextFeed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/social/feed" && new URL(response.url()).searchParams.get("q") === `never-matches-${run}`);
    const created = await mutation(page, "/api/social/posts", "POST", () => form.getByRole("button", { name: "Опубликовать", exact: true }).click()); await (await nextFeed).finished(); await page.locator(".arena-feed-stream[aria-busy='false']").waitFor(); assert.equal(await page.locator(`[data-post-id='${created.data.id}']`).count(), 0);
  });
  await check("company-audience-switch-ui-guard", async () => {
    const page = author.page; lastPage = page; await page.route(`${base}/api/social/publishers`, route => route.fulfill({ json: { items: [{ id: 987654, name: "QA company selector fixture" }] } }));
    try { await page.goto(`${base}/feed`); await clearLocal(page); await page.reload(); const form = page.locator(".arena-feed-composer").first(); await form.getByLabel("Текст публикации", { exact: true }).fill("Только UI проверка аудитории без публикации"); const audience = form.getByLabel("Кто увидит публикацию", { exact: true }); await audience.selectOption("FRIENDS"); await form.locator(".arena-feed-publisher select").selectOption("987654"); assert.equal(await audience.inputValue(), "COMPANY_INTERNAL"); assert.equal(await audience.locator("option[value='FRIENDS']").count(), 0); await form.locator(".arena-feed-publisher select").selectOption(""); assert.equal(await audience.inputValue(), "PUBLIC"); await clearLocal(page); }
    finally { await page.unroute(`${base}/api/social/publishers`); }
  });
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: checks.every(item => item.passed), checks, browser_errors: errors, screenshots })); if (checks.some(item => !item.passed)) process.exitCode = 1;
} finally { for (const context of contexts) await context.close(); await browser.close(); }
