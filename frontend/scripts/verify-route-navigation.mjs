import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-webgl"] });

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const login = await context.request.post(`${appUrl}/api/auth/login`, { data: { username: "demo", password: "demo" } });
  assert.equal(login.status(), 200);
  const { access_token } = await login.json();
  await page.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  await page.goto(`${appUrl}/app`, { waitUntil: "domcontentloaded" });
  await page.locator("#home-title").waitFor({ state: "visible" });

  const routes = [
    ["scenarios", "/scenarios"], ["learning", "/training"],
    ["history", "/history"], ["profile", "/profile", "#profile-page"],
    ["ai", "/ai"], ["rooms", "/rooms"],
  ];
  for (const [section, path, contentSelector = "#main-content h1"] of routes) {
    const start = performance.now();
    await page.locator(["history", "profile"].includes(section) ? `.nova-rail a[href="${path}"]` : `[data-home-section="${section}"] .nova-button-secondary`).click();
    await page.waitForURL(`${appUrl}${path}`);
    const heading = page.locator(contentSelector).first();
    await heading.waitFor({ state: "visible", timeout: 15000 });
    const elapsed = Math.round(performance.now() - start);
    assert.ok(await heading.textContent(), `Missing content on ${path}`);
    assert.equal(await page.locator(".nova-page-wrap").count(), 1);
    console.log(`${path}: ${elapsed} ms`);
    await page.locator(".nova-rail-brand").click();
    await page.waitForURL(`${appUrl}/app`);
    await page.locator("#home-title").waitFor({ state: "visible" });
  }

  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}
