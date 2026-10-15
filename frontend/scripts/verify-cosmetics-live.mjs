import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = "../.cache/cosmetics";
await mkdir(output, { recursive: true });
try {
  const request = await browser.newContext();
  const login = await request.request.post(`${base}/api/auth/login`, { data: { username: process.env.ARENA_QA_USER || "demo", password: process.env.ARENA_QA_PASSWORD || "demo" } });
  assert.equal(login.status(), 200);
  const { access_token: token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const shop = await (await request.request.get(`${base}/api/shop`, { headers })).json();
  const collection = await (await request.request.get(`${base}/api/me/cosmetics`, { headers })).json();
  assert.equal(shop.stars, collection.stars);
  assert(shop.items.some((item) => item.category === "status"));
  await request.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript((value) => localStorage.setItem("arena_token", value), token);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/shop`);
  await page.getByRole("heading", { name: "Оформление для вашего профиля" }).waitFor();
  await page.getByRole("button", { name: "Рамки", exact: true }).click();
  const frameCards = page.locator(".cosmetic-shop-card");
  assert((await frameCards.count()) >= 13);
  assert.equal(await frameCards.evaluateAll((cards) => cards.every((card) => {
    const frame = card.querySelector(".cosmetic-frame");
    const contour = frame?.querySelector("rect[rx]");
    return Boolean(contour && Number(contour.getAttribute("rx")) > 0);
  })), true, "every frame must use a rounded-square contour");
  await page.screenshot({ path: `${output}/shop-frames-live-desktop.png`, fullPage: true });
  await page.goto(`${base}/profile/edit`);
  await page.getByRole("heading", { name: "Моё оформление" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/profile-editor-live-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(JSON.stringify({ realAccountStars: shop.stars, owned: collection.items.length, frameItems: shop.items.filter((item) => item.category === "frame").length, mobileOverflow: 0 }));
} finally { await browser.close(); }
