import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8000";
assert.ok(process.env.ARENA_QA_READER && process.env.ARENA_QA_PASSWORD, "Provide an existing account through the environment");
const before = process.argv.includes("--before");
const output = resolve(`../.cache/community-refinement/${before ? "before" : "after"}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env.ARENA_QA_READER, password: process.env.ARENA_QA_PASSWORD } });
  assert.ok(login.ok(), `Existing account login: ${login.status()}`);
  const token = (await login.json()).access_token;
  await context.addInitScript(token => localStorage.setItem("arena_token", token), token);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = [], results = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    for (const compact of width < 768 ? [false] : [false, true]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.goto(base);
      await page.evaluate(compact => localStorage.setItem("arena_rail_compact", String(compact)), compact);
      await page.goto(`${base}/feed`);
      await page.getByRole("heading", { name: "Лента", exact: true }).waitFor();
      await page.locator(".arena-feed-composer").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector(".arena-feed-stream")?.getAttribute("aria-busy") === "false");
      await page.locator(".arena-social-story-loading").waitFor({ state: "hidden" });
      const geometry = await page.evaluate(() => {
        const rect = selector => { const node = document.querySelector(selector); if (!node || getComputedStyle(node).display === "none") return null; const { x, y, width, height, right, bottom } = node.getBoundingClientRect(); return { x, y, width, height, right, bottom }; };
        return { viewport: innerWidth, document: document.documentElement.scrollWidth, rail: rect(".nova-rail"), page: rect(".arena-feed-page"), nav: rect(".arena-feed-nav"), center: rect(".arena-feed-center"), header: rect(".arena-feed-page-header") };
      });
      results.push({ width, compact, ...geometry });
      if ([390, 1024, 1440].includes(width) && !compact) await page.screenshot({ path: resolve(output, `feed-${width}.png`), fullPage: false });
      if (!before) {
        assert.equal(await page.locator(".arena-feed-nav").count(), 0, "No second vertical navigation rail");
        assert.ok(geometry.document <= width + 1, `${width}/${compact}: horizontal overflow`);
        if (geometry.rail) assert.ok(geometry.page.x >= geometry.rail.right, `${width}/${compact}: content overlaps global rail`);
        if (geometry.nav && geometry.center) assert.ok(geometry.nav.right <= geometry.center.x + 1 || geometry.nav.bottom <= geometry.center.y + 1, `${width}/${compact}: local navigation overlaps content`);
        await page.evaluate(() => window.scrollTo(0, 400));
        assert.ok(await page.locator(".nova-account-actions").evaluate(node => node.getBoundingClientRect().bottom <= 0), "Account controls scroll with the header instead of covering content");
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, before, output, results }));
  await context.close();
} finally { await browser.close(); }
