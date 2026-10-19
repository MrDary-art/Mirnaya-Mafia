import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Use a local preview");
for (const key of ["ARENA_QA_AUTHOR", "ARENA_QA_PASSWORD"]) assert.ok(process.env[key], `Missing ${key}`);
const output = resolve("../.cache/feed-qa/pins");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errors = [], checks = [];

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    try {
      const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env.ARENA_QA_AUTHOR, password: process.env.ARENA_QA_PASSWORD } });
      assert.ok(login.ok(), `Login: ${login.status()}`);
      const { access_token } = await login.json();
      await context.setExtraHTTPHeaders({ Authorization: `Bearer ${access_token}` });
      await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
      const me = await (await context.request.get(`${base}/api/auth/me`)).json();
      const makePost = (id, body) => ({
        id, body, author: { ...me, path: `/people/${me.username}` }, company: null,
        kind: "TEXT", status: "PUBLISHED", audience: "PUBLIC", pinned: false,
        created_at: `2020-01-0${id - 900000}T12:00:00Z`, published_at: `2020-01-0${id - 900000}T12:00:00Z`, edited_at: null,
        comments_enabled: true, media: [], linked_content: null, poll: null, repost_original: null,
        path: `/feed/post/${id}`, counts: { likes: 0, comments: 0, reposts: 0 },
        viewer_state: { liked: false, bookmarked: false, following_author: false, can_edit: true, can_delete: true, can_comment: true, can_repost: true },
      });
      const posts = [makePost(900002, "Новая обычная запись"), makePost(900001, "Старая важная запись")];
      const ordered = () => [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.id - a.id);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", error => errors.push(error.message));
      // All publication writes are fixtures; the local account's content stays untouched.
      await page.route(`${base}/api/social/**`, async route => {
        const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
        if (method === "GET" && (path === "/api/social/feed" || path === `/api/social/users/${me.id}/posts`)) {
          return route.fulfill({ json: { items: ordered(), next_cursor: null, pinned_post: ordered().find(post => post.pinned) || null } });
        }
        const match = path.match(/^\/api\/social\/posts\/(\d+)$/);
        if (match && method === "GET") return route.fulfill({ json: posts.find(post => post.id === Number(match[1])) });
        if (match && method === "PATCH") {
          const post = posts.find(post => post.id === Number(match[1]));
          const { pinned } = request.postDataJSON();
          assert.equal(typeof pinned, "boolean");
          if (pinned) posts.forEach(item => { item.pinned = false; });
          post.pinned = pinned;
          return route.fulfill({ json: post });
        }
        if (path === "/api/social/posts" && method === "POST") {
          const post = makePost(900003, request.postDataJSON().body);
          posts.unshift(post);
          return route.fulfill({ json: post });
        }
        if (method !== "GET") {
          errors.push(`Unexpected mutation: ${method} ${path}`);
          return route.fulfill({ status: 403, json: { detail: "Fixture writes only" } });
        }
        return route.continue();
      });
      const firstId = () => page.locator(".arena-feed-stream > [data-post-id]").first().getAttribute("data-post-id");
      async function pin(id, active) {
        const card = page.locator(`[data-post-id='${id}']`);
        await card.locator(".arena-feed-post-menu > summary").click();
        const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/social/feed");
        await card.getByRole("button", { name: active ? "Закрепить на стене" : "Открепить", exact: true }).click();
        await (await refreshed).finished();
        await page.locator(".arena-feed-stream[aria-busy='false']").waitFor();
        assert.equal(await firstId(), String(active ? id : 900002));
        assert.equal(await page.locator(".arena-feed-stream > article > .arena-feed-pinned").count(), active ? 1 : 0);
      }
      await page.goto(`${base}/feed`);
      await page.locator("[data-post-id='900001']").waitFor();
      assert.equal(await firstId(), "900002");
      await pin(900001, true);
      await pin(900002, true);
      await pin(900002, false);
      await pin(900001, true);
      const composer = page.locator(".arena-feed-composer").first();
      await composer.getByLabel("Текст публикации", { exact: true }).fill("Новая публикация после закрепления");
      await composer.getByRole("button", { name: "Опубликовать", exact: true }).click();
      await page.locator("[data-post-id='900003']").waitFor();
      assert.equal(await firstId(), "900001", "New posts must stay below the pin");
      await page.reload();
      await page.locator("[data-post-id='900003']").waitFor();
      assert.equal(await firstId(), "900001", "The pin must stay first after reload");
      await page.goto(`${base}/feed?user_id=${me.id}`);
      await page.locator("[data-post-id='900003']").waitFor();
      assert.equal(await firstId(), "900001", "The author wall must keep the pin first");
      assert.equal(await page.locator("[data-post-id='900001']").count(), 1, "A pin must not be duplicated");
      await page.locator("[data-post-id='900001']").scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `pinned-first-${width}.png`) });
      checks.push({ width, pin: true, replace: true, unpin: true, publish: true, reload: true, wall: true });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks, browserErrors: errors }));
} finally { await browser.close(); }
