import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.setItem("arena_token", "visual-qa"));
await context.route("**/api/**", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(route.request().url().endsWith("/auth/me")
    ? { username: "visual-qa", is_admin: false, level: 1, stars: 0, xp: 0 }
    : { daily_challenge: { minutes: 3, reward: 2 } }),
}));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:5173/app", { waitUntil: "domcontentloaded" });
  await page.locator(".nova-home-world").waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".nova-experience canvas").count(), 0);
  assert.ok(await page.locator(".forest-journey").count());
  await page.screenshot({ path: resolve(output, "home-world-hero.png") });
  const rail = page.locator('.nova-rail-links');
  for (const id of ["ai", "rooms", "scenarios", "learning", "history", "friends", "profile"]) {
    await rail.locator(`a[href="/app#${id}"]`).click();
    await page.waitForFunction((sectionId) => {
      const section = document.getElementById(sectionId);
      return section && Math.abs(section.getBoundingClientRect().top) < 35;
    }, id, { timeout: 5500 });
    await page.waitForTimeout(260);
    assert.equal(await rail.locator(`a[href="/app#${id}"]`).getAttribute("aria-current"), "location");
    assert.equal(await page.locator(".nova-experience canvas").count(), 0);
    await page.screenshot({ path: resolve(output, `home-world-${id}.png`) });
  }
  await rail.locator('a[href="/app"]').click();
  await page.waitForFunction(() => window.scrollY < 15, undefined, { timeout: 5500 });
  await page.screenshot({ path: resolve(output, "home-world-return.png") });
  await rail.locator('a[href="/app#ai"]').click();
  await page.waitForFunction(() => Math.abs(document.getElementById("ai").getBoundingClientRect().top) < 35);
  await page.locator("#ai .nova-button").click();
  await page.locator(".product-page").waitFor({ state: "visible" });
  assert.ok(page.url().endsWith("/ai"));
  await rail.locator('a[href="/app#scenarios"]').click();
  await page.locator(".nova-home-world").waitFor();
  await page.waitForFunction(() => Math.abs(document.getElementById("scenarios").getBoundingClientRect().top) < 35);
  assert.equal(await rail.locator('a[href="/app#scenarios"]').getAttribute("aria-current"), "location");
  await page.close();

  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto("http://127.0.0.1:5173/app", { waitUntil: "domcontentloaded" });
  await mobilePage.locator(".nova-home-world").waitFor();
  assert.equal(await mobilePage.locator(".nova-experience canvas").count(), 0);
  await mobilePage.screenshot({ path: resolve(output, "home-world-mobile-hero.png") });
  await mobilePage.locator('.nova-mobile-nav a[href="/app#ai"]').click();
  await mobilePage.waitForFunction(() => Math.abs(document.getElementById("ai").getBoundingClientRect().top) < 35);
  await mobilePage.screenshot({ path: resolve(output, "home-world-mobile-ai.png") });
  await mobilePage.close();

  const reducedPage = await context.newPage();
  await reducedPage.emulateMedia({ reducedMotion: "reduce" });
  await reducedPage.goto("http://127.0.0.1:5173/app#learning", { waitUntil: "domcontentloaded" });
  await reducedPage.locator(".nova-home-world").waitFor();
  await reducedPage.waitForTimeout(350);
  assert.ok(await reducedPage.evaluate(() => Math.abs(document.getElementById("learning").getBoundingClientRect().top) < 35));
  await reducedPage.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ sections: 8, owlOnHome: false, navigation: true, errors }, null, 2));
} finally {
  await browser.close();
}
