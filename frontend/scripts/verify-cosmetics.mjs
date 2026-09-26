import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = "../.cache/cosmetics";
await mkdir(output, { recursive: true });
let stars = 14;
let custom = false;
const owned = new Set(["avatar_analyst", "frame_classic", "theme_arena"]);
const equipment = { avatar_code: "avatar_analyst", frame_code: "frame_classic", profile_theme: "theme_arena", badge_code: null, status_code: null };
const definitions = [
  ["avatar_analyst", "Сова", "avatar", 0], ["frame_classic", "Рамка «Классика»", "frame", 0],
  ["frame_neon", "Рамка «Неон»", "frame", 12], ["theme_arena", "Тема «Арена»", "theme", 0],
  ["status_online", "На связи", "status", 2], ["badge_spark", "Значок «Искра»", "badge", 3],
];
const field = { avatar: "avatar_code", frame: "frame_code", theme: "profile_theme", badge: "badge_code", status: "status_code" };
const items = () => definitions.map(([code, name, category, cost]) => ({ code, name, category, cost, rarity: "обычный", owned: owned.has(code), equipped: equipment[field[category]] === code, is_active: true, obtained_at: owned.has(code) ? new Date().toISOString() : null }));
const personal = () => ({ items: [...items().filter((item) => item.owned), ...(custom ? [{ code: "avatar_custom", name: "Моё фото", category: "avatar", cost: 0, owned: true, equipped: equipment.avatar_code === "avatar_custom", is_active: true, rarity: "личный" }] : [])], stars, equipment: { ...equipment }, username: "Тестовый игрок", level: 2, user_id: 1, has_custom_avatar: custom });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await context.addInitScript(() => localStorage.setItem("arena_token", "cosmetics-qa"));
const photo = await readFile("public/assets/forest2d/learning.webp");
await context.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  let body = {};
  if (path === "/api/avatars/1") return route.fulfill({ status: 200, contentType: "image/webp", body: photo });
  if (path === "/api/auth/me") body = { id: 1, username: "Тестовый игрок", level: 2, stars, xp: 0, avatar_code: equipment.avatar_code, frame_code: equipment.frame_code };
  else if (path === "/api/shop" && method === "GET") body = { ...personal(), items: items() };
  else if (path === "/api/me/cosmetics" && method === "GET") body = personal();
  else if (path.match(/^\/api\/shop\/items\/[^/]+\/purchase$/)) {
    const code = path.split("/")[4];
    const item = items().find((entry) => entry.code === code);
    assert(item && !owned.has(code) && stars >= item.cost);
    stars -= item.cost; owned.add(code);
    body = { success: true, new_balance: stars, owned: true, item };
  } else if (path === "/api/me/cosmetics/equip") {
    const choice = JSON.parse(route.request().postData());
    assert(choice.item_code === null || choice.item_code === "avatar_custom" && custom || owned.has(choice.item_code));
    equipment[field[choice.category]] = choice.item_code;
    body = { ...equipment };
  } else if (path === "/api/me/avatar") {
    assert.equal(method, "POST"); custom = true; body = { avatar_code: "avatar_custom", user_id: 1, equipped: false };
  } else if (path === "/api/social/notifications") body = [];
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${base}/shop`);
  await page.getByRole("heading", { name: "Оформление для вашего профиля" }).waitFor();
  assert.equal(await page.locator(".cosmetic-filters, .cosmetic-sort").count(), 0);
  await page.screenshot({ path: `${output}/shop-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Рамки", exact: true }).click();
  await page.locator(".cosmetic-shop-card").filter({ hasText: "Рамка «Неон»" }).click();
  await page.getByRole("button", { name: "Купить за 12 ★" }).click();
  await page.getByText("Куплено — предмет доступен в редакторе профиля.").waitFor();
  assert.equal(stars, 2);
  assert.equal(equipment.frame_code, "frame_classic", "purchase must not auto-equip");
  assert.equal(await page.locator(".cosmetic-shop-card.is-owned").filter({ hasText: "Рамка «Неон»" }).count(), 1);
  await page.getByRole("button", { name: "Выбрать в профиле", exact: true }).click();
  await page.getByRole("heading", { name: "Моё оформление" }).waitFor();
  await page.locator(".cosmetic-card").filter({ hasText: "Рамка «Неон»" }).click();
  await page.getByText("Рамка «Неон» — теперь в профиле.").waitFor();
  assert.equal(equipment.frame_code, "frame_neon");
  await page.getByRole("button", { name: "Аватары", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("public/assets/forest2d/learning.webp");
  await page.getByText("Фото загружено и установлено в профиле.").waitFor();
  assert.equal(equipment.avatar_code, "avatar_custom");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/profile-editor-mobile.png`, fullPage: true });
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
  }
  await page.goto(`${base}/shop`);
  await page.getByRole("heading", { name: "Оформление для вашего профиля" }).waitFor();
  assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ flow: "shop purchase → owned → one-click equip → photo upload", stars, equipment, mobileOverflow: 0 }));
} finally { await browser.close(); }
