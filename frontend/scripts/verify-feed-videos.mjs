import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

// Read-only: plays existing demo videos, never creates posts, accounts or reactions.
const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:8000";
assert.ok(process.env.ARENA_QA_READER && process.env.ARENA_QA_PASSWORD, "Provide an existing account through the environment");
const output = resolve("../.cache/community-refinement/videos");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: process.env.ARENA_QA_READER, password: process.env.ARENA_QA_PASSWORD } });
  assert.ok(login.ok(), `Login ${login.status()}`);
  const token = (await login.json()).access_token;
  await context.addInitScript(token => localStorage.setItem("arena_token", token), token);
  const catalog = await context.request.get(`${base}/api/social/feed?q=${encodeURIComponent("#видеопрактика")}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.ok(catalog.ok());
  const posts = (await catalog.json()).items.filter(post => post.body.startsWith("[ДЕМО]"));
  assert.equal(posts.length, 3, "Publish the three explicit demo posts before this check");
  const errors = [], checks = [];
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/feed`);
  const shelf = page.getByRole("region", { name: "Видеопрактика" });
  await shelf.locator(".arena-feed-video-preview").last().waitFor();
  await shelf.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll(".arena-feed-video-cover img")].length === 3 && [...document.querySelectorAll(".arena-feed-video-cover img")].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: resolve(output, "shelf-desktop.png") });
  checks.push("three-real-authenticated-posters");
  for (let index = 0; index < 3; index++) {
    const button = shelf.locator(".arena-feed-video-preview").nth(index);
    const label = await button.getAttribute("aria-label");
    await button.click();
    const dialog = page.getByRole("dialog"), video = dialog.locator("video");
    await video.waitFor();
    await page.waitForFunction(() => document.querySelector("dialog video")?.readyState >= 2);
    assert.equal(await video.evaluate(element => element.paused), true, "No unsolicited autoplay");
    await video.evaluate(element => { element.muted = true; return element.play(); });
    await page.waitForFunction(() => document.querySelector("dialog video")?.currentTime > 0.2);
    await video.evaluate(element => { element.currentTime = 10; });
    await page.waitForFunction(() => document.querySelector("dialog video")?.currentTime > 10.1);
    await video.evaluate(element => element.pause());
    if (index === 0) await page.screenshot({ path: resolve(output, "player-desktop.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), label, "Focus returns to the original video");
  }
  checks.push("all-three-play-and-seek", "keyboard-close-and-focus-return");
  for (const post of posts) {
    const media = post.media.find(media => media.kind.toLowerCase() === "video");
    assert.equal((await context.request.get(`${base}${media.url}`)).status(), 401);
    assert.equal((await context.request.get(`${base}${media.thumbnail_url}`)).status(), 401);
  }
  checks.push("anonymous-media-and-posters-denied");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/feed`); await shelf.locator(".arena-feed-video-preview").last().waitFor();
  await shelf.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "shelf-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shelf.locator(".arena-feed-video-preview").first().click();
  await page.getByRole("dialog").locator("video").waitFor();
  await page.screenshot({ path: resolve(output, "player-mobile.png") });
  await page.keyboard.press("Escape"); checks.push("mobile-video-layout");
  await page.route("**/api/social/media/*?thumbnail=true", route => route.abort());
  await page.goto(`${base}/feed`); await shelf.locator(".arena-feed-video-preview").last().waitFor();
  assert.equal(await shelf.locator(".arena-feed-video-preview button").count(), 0, "No nested retry controls in a preview button");
  await shelf.locator(".arena-feed-video-preview").first().click(); await page.getByRole("dialog").locator("video").waitFor();
  checks.push("poster-failure-does-not-block-player");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks, post_ids: posts.map(post => post.id), screenshots: output }));
  await context.close();
} finally { await browser.close(); }
