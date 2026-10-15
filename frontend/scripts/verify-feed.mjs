import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012";
assert.equal(process.env.ARENA_QA_DISPOSABLE, "1", "This check creates content: use a disposable QA database");
for (const key of ["ARENA_QA_READER", "ARENA_QA_AUTHOR", "ARENA_QA_MODERATOR", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const output = resolve("../.cache/feed-qa/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const contexts = [], errors = [], checks = [];
let lastPage;
async function account(key) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); contexts.push(context);
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env[key], password: process.env.ARENA_QA_PASSWORD } });
  assert.ok(login.ok(), `${key} login ${login.status()}`);
  const { access_token } = await login.json();
  await context.setExtraHTTPHeaders({ Authorization: `Bearer ${access_token}` });
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  const me = await (await context.request.get(`${base}/api/auth/me`)).json();
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  return { context, page, me };
}
async function mutation(page, path, method, action) {
  lastPage = page;
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
  await action(); const result = await pending;
  assert.ok(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`);
  return result.json();
}
async function snapshot(page, name) {
  lastPage = page;
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflow`);
}
try {
  const author = await account("ARENA_QA_AUTHOR"), reader = await account("ARENA_QA_READER"), moderator = await account("ARENA_QA_MODERATOR");
  const run = Date.now(), body = `Проверка ленты ${run}. Сначала уточняем интересы, затем обсуждаем встречные условия. #переговоры`;
  // Establish a real friendship for the existing messenger's recipient picker.
  const friends = await (await reader.context.request.get(`${base}/api/social/friends`)).json();
  if (!friends.some(item => item.id === author.me.id && item.relationship === "FRIENDS")) {
    await reader.context.request.post(`${base}/api/social/friends/${author.me.id}/request`);
    const accepted = await author.context.request.post(`${base}/api/social/friends/${reader.me.id}/accept`);
    assert.ok(accepted.ok(), await accepted.text());
  }
  const page = author.page;
  await page.goto(`${base}/feed`);
  await page.getByLabel("Текст публикации", { exact: true }).fill(body);
  const post = await mutation(page, "/api/social/posts", "POST", () => page.getByRole("button", { name: "Опубликовать", exact: true }).click());
  const selector = `[data-post-id="${post.id}"]`;
  await page.locator(selector).waitFor();
  await page.reload(); await page.locator(selector).waitFor();
  checks.push("create-reload-feed");
  await page.goto(`${base}/profile`); await page.locator(selector).waitFor(); checks.push("profile-wall");
  await reader.page.goto(`${base}/feed/post/${post.id}`);
  let card = reader.page.locator(selector);
  await card.waitFor();
  await mutation(reader.page, `/api/social/posts/${post.id}/like`, "POST", () => card.getByRole("button", { name: /^Нравится:/ }).click());
  await mutation(reader.page, `/api/social/posts/${post.id}/bookmark`, "POST", () => card.getByRole("button", { name: "Сохранить публикацию", exact: true }).click());
  await reader.page.reload(); await card.getByRole("button", { name: /^Убрать лайк:/ }).waitFor();
  assert.equal(await card.getByRole("button", { name: "Убрать из сохранённого", exact: true }).getAttribute("aria-pressed"), "true");
  await card.getByLabel("Ваш комментарий", { exact: true }).fill("Сначала договориться о критериях, потом о решении.");
  const comment = await mutation(reader.page, `/api/social/posts/${post.id}/comments`, "POST", () => card.locator(".arena-feed-comment-composer").getByRole("button", { name: "Отправить", exact: true }).click());
  await page.goto(`${base}/feed/post/${post.id}`);
  const ownCard = page.locator(selector);
  await ownCard.locator(".arena-feed-comment").filter({ hasText: comment.text }).getByRole("button", { name: "Ответить", exact: true }).click();
  await ownCard.getByLabel("Ваш комментарий", { exact: true }).fill("Да, критерии помогают сохранить общий ориентир.");
  await mutation(page, `/api/social/posts/${post.id}/comments`, "POST", () => ownCard.locator(".arena-feed-comment-composer").getByRole("button", { name: "Отправить", exact: true }).click());
  await reader.page.reload(); await card.locator(".arena-feed-comment.is-reply").waitFor(); checks.push("reactions-bookmarks-comments-replies");
  await card.locator("summary[aria-label='Действия с публикацией']").click();
  await card.getByRole("button", { name: "Добавить в подборку" }).click();
  let dialog = reader.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Новая подборка", exact: true }).click();
  await dialog.getByLabel("Название", { exact: true }).fill(`Рабочие приёмы ${run}`);
  const collection = await mutation(reader.page, "/api/social/collections", "POST", () => dialog.getByRole("button", { name: "Создать подборку", exact: true }).click());
  await dialog.getByText("Материал добавлен.", { exact: false }).waitFor(); await reader.page.keyboard.press("Escape");
  await reader.page.goto(`${base}/collections/${collection.id}`); await reader.page.getByRole("heading", { name: `Рабочие приёмы ${run}` }).waitFor();
  assert.equal((await author.context.request.get(`${base}/api/social/collections/${collection.id}`)).status(), 404);
  checks.push("collections-ui-private-acl");
  await reader.page.goto(`${base}/feed/post/${post.id}`); card = reader.page.locator(selector);
  await card.getByRole("button", { name: /^Поделиться публикацией/ }).click(); dialog = reader.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "На мою стену", exact: true }).click();
  await dialog.getByLabel("Ваш комментарий к репосту").fill("Полезно для следующего разговора.");
  await mutation(reader.page, `/api/social/posts/${post.id}/repost`, "POST", () => dialog.getByRole("button", { name: "Опубликовать репост", exact: true }).click());
  await dialog.getByRole("button", { name: "Сообщение", exact: true }).click();
  await dialog.locator(`input[name='recipient'][value='${author.me.id}']`).check();
  const shareNote = `Комментарий отправителя ${run}`;
  await dialog.getByLabel("Сообщение (необязательно)").fill(shareNote);
  await mutation(reader.page, `/api/social/posts/${post.id}/share-message`, "POST", () => dialog.getByRole("button", { name: "Отправить", exact: true }).click());
  await reader.page.keyboard.press("Escape");
  await page.goto(`${base}/people?chat=${reader.me.id}`); await page.locator(`.social-shared-post a[href='/feed/post/${post.id}']`).waitFor();
  await page.locator(".social-shared-post").filter({ hasText: shareNote }).waitFor();
  checks.push("repost-existing-chat-share");
  await page.goto(`${base}/feed/notifications`); await page.getByText("Вашу публикацию оценили", { exact: true }).first().waitFor();
  await mutation(page, "/api/social/notifications/read-all", "POST", () => page.getByRole("button", { name: "Прочитать всё", exact: true }).click()); checks.push("real-notifications");
  // Create a real text story using the composer and open it as another user.
  const previousStories = await (await reader.context.request.get(`${base}/api/social/stories?user_id=${author.me.id}&limit=40`)).json();
  for (const previous of previousStories.items || []) await reader.context.request.post(`${base}/api/social/stories/${previous.id}/view`);
  await page.goto(`${base}/feed`); await page.getByRole("button", { name: /Ваша история/ }).click();
  await page.getByLabel("Текст истории", { exact: true }).fill(`Момент ${run}: договорились о следующем шаге.`);
  const story = await mutation(page, "/api/social/stories", "POST", () => page.getByRole("dialog").getByRole("button", { name: "Опубликовать на 24 часа" }).click());
  await reader.page.goto(`${base}/feed`);
  await reader.page.locator(".arena-social-story-tile").filter({ hasText: story.author.display_name || story.author.username }).first().click();
  await reader.page.getByRole("dialog").getByText(`Момент ${run}: договорились о следующем шаге.`, { exact: true }).waitFor();
  await reader.page.keyboard.press("Escape"); assert.equal(await reader.page.getByRole("dialog").count(), 0); checks.push("story-compose-view-keyboard");
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [360, 800]]) {
    await reader.page.setViewportSize({ width, height }); await reader.page.goto(`${base}/feed`); await reader.page.locator(selector).waitFor(); await snapshot(reader.page, `feed-${width}`);
    if (width === 390) { await reader.page.getByRole("button", { name: "Ещё", exact: true }).click(); await reader.page.getByRole("dialog").getByRole("link", { name: "Сценарии", exact: true }).waitFor(); await snapshot(reader.page, "mobile-menu"); await reader.page.keyboard.press("Escape"); }
  }
  await reader.page.goto(`${base}/saved`); await reader.page.locator(selector).waitFor(); await snapshot(reader.page, "saved-360");
  await reader.page.goto(`${base}/collections/${collection.id}`); await reader.page.getByRole("heading", { name: `Рабочие приёмы ${run}` }).waitFor(); await snapshot(reader.page, "collection-360");
  checks.push("responsive-360-390-768-1440", "saved-page", "more-menu-keyboard");
  // Permission changes revoke every alternate entry, including the shared preview.
  assert.ok((await author.context.request.patch(`${base}/api/social/posts/${post.id}`, { data: { audience: "ONLY_ME" } })).ok());
  assert.equal((await reader.context.request.get(`${base}/api/social/posts/${post.id}`)).status(), 404);
  const messages = await (await reader.context.request.get(`${base}/api/social/messages/${author.me.id}`)).json();
  assert.equal(messages.filter(item => item.type === "POST_SHARE").at(-1).payload.available, false);
  checks.push("live-share-source-privacy");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks, screenshots: output, post_id: post.id, collection_id: collection.id, story_id: story.id }));
} catch (failure) {
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: resolve(output, "failure.png"), fullPage: false }).catch(() => {});
  console.error(JSON.stringify({ passed: false, checks, error: failure.message, browser_errors: errors }));
  throw failure;
} finally { for (const context of contexts) await context.close(); await browser.close(); }
