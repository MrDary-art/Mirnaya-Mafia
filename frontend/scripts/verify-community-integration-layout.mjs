import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

// Read-only: can be used with an existing account; never sends messages or changes friendships.
const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8012";
assert.ok(process.env.ARENA_QA_READER && process.env.ARENA_QA_PASSWORD);
const output = resolve(`../.cache/community-integration/${new URL(base).port === "8000" ? "live" : "layout"}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env.ARENA_QA_READER, password: process.env.ARENA_QA_PASSWORD } });
  assert.ok(login.ok(), `login ${login.status()}`);
  const token = (await login.json()).access_token;
  await context.addInitScript(token => localStorage.setItem("arena_token", token), token);
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of new URL(base).port === "8000" ? [390, 1440] : [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const route of ["/feed", "/feed?section=friends", "/feed?section=messages", "/profile?section=friends", "/profile?section=messages"]) {
      await page.goto(`${base}${route}`);
      await page.locator(".community-tabs").waitFor();
      if (route !== "/feed") { await page.locator(".friends-workspace").waitFor(); await page.getByText(/Загружаем друзей…|Загружаем чаты…/).waitFor({ state: "hidden" }); }
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const rect = selector => { const node = document.querySelector(selector); if (!node || getComputedStyle(node).display === "none") return null; const { x, right, top, bottom } = node.getBoundingClientRect(); return { x, right, top, bottom }; };
        return { viewport: innerWidth, document: document.documentElement.scrollWidth, rail: rect(".nova-rail"), tabs: rect(".community-tabs"), workspace: rect(".friends-workspace"), header: rect(".nova-account-actions") };
      });
      assert.ok(geometry.document <= width + 1, `${route} ${width}: horizontal overflow ${geometry.document}`);
      assert.ok(geometry.tabs.top >= geometry.header.bottom || geometry.tabs.right <= geometry.header.x, `${route} ${width}: header overlaps tabs`);
      if (geometry.rail) assert.ok(geometry.tabs.x >= geometry.rail.right, `${route} ${width}: content overlaps global rail`);
      assert.equal(await page.locator(".community-tabs [aria-current='page']").count(), 1);
      assert.equal(await page.locator(".arena-feed-nav, .nova-home-friends").count(), 0);
      assert.ok((await page.locator(".nova-account-messages").getAttribute("href")).includes("section=messages"));
      if (route.startsWith("/profile")) {
        const back = await page.locator(".product-page-back").boundingBox();
        assert.ok(back.x + back.width <= geometry.header.x || back.y >= geometry.header.bottom, `${width}: account controls overlap Back`);
        await page.evaluate(() => window.scrollTo(0, 300));
        const headerPosition = await page.locator(".nova-account-actions").evaluate(node => ({ top: node.getBoundingClientRect().top, scroll: window.scrollY, position: getComputedStyle(node).position }));
        assert.equal(headerPosition.position, "absolute", "Profile controls are not fixed over the conversation");
        assert.ok(Math.abs(headerPosition.top + headerPosition.scroll - geometry.header.top) < 1, "Profile controls move with actual page scroll, including short pages");
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(output, `${route.startsWith("/profile") ? "profile" : "feed"}-${new URL(`${base}${route}`).searchParams.get("section") || "posts"}-${width}.png`), fullPage: false });
      results.push({ route, width, ...geometry });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: results.length, output, results }));
} finally { await browser.close(); }
