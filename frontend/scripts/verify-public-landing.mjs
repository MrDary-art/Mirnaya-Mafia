import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const screenshots = join(tmpdir(), "arena-public-landing-qa");
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-webgl"] });

try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  const mutations = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() !== "GET") mutations.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Две Арены. Один вход." }).waitFor();
  assert.equal(await page.locator("h1").count(), 1);
  const header = page.locator(".gateway-header");
  assert.equal(await header.getByRole("link", { name: "Описание" }).getAttribute("href"), "#description");
  assert.equal(await header.getByRole("link", { name: "О нас" }).getAttribute("href"), "#about");
  assert.equal(await header.getByRole("button", { name: /^Войти/ }).count(), 1);
  assert.deepEqual(await page.locator(".gateway-mode h2").allTextContents(), ["Арена переговоров", "Арена для бизнеса"]);
  assert.equal(await page.locator(".gateway-role-map tbody tr").count(), 3);
  assert.match(await page.locator(".gateway-no-company").innerText(), /Найти свою компанию/);
  assert.match(await page.locator(".gateway-no-company").innerText(), /Зарегистрировать компанию/);

  await header.getByRole("button", { name: /^Войти/ }).click();
  const chooser = page.locator(".gateway-entry-dialog");
  await chooser.getByRole("heading", { name: "Куда вы хотите войти?" }).waitFor();
  assert.equal(await chooser.locator(".gateway-entry-options > button").count(), 2);
  await chooser.getByRole("button", { name: /Арена переговоров/ }).click();
  await page.getByRole("heading", { name: "Вход в Арену переговоров" }).waitFor();
  assert.deepEqual(await page.locator(".registration-form input").evaluateAll((inputs) => inputs.map((input) => input.name)), ["login", "password"]);

  await page.getByRole("button", { name: /Выбрать другую Арену/ }).click();
  await chooser.getByRole("button", { name: /Арена для бизнеса/ }).click();
  await page.getByRole("heading", { name: "Вход в Арену для бизнеса" }).waitFor();
  assert.match(await page.locator("#landing-auth-description").innerText(), /Сотрудники и руководители входят одинаково/);
  await page.getByRole("tab", { name: "Регистрация" }).click();
  assert.deepEqual(await page.locator(".registration-form input").evaluateAll((inputs) => inputs.map((input) => input.name)), ["fullName", "nickname", "login", "password"]);
  assert.match(await page.locator("#arena-nickname-hint").innerText(), /увидят другие участники/);
  assert.match(await page.locator("#arena-login-hint").innerText(), /только для входа/);
  await page.keyboard.press("Escape");
  await page.locator(".gateway-entry-dialog, .landing-auth-dialog").waitFor({ state: "detached" });

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(appUrl, { waitUntil: "networkidle" });
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(layout.scroll <= layout.width, `Horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: join(screenshots, `${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/business/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Вход в Арену для бизнеса" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.size, 0, "Business entry query should be cleaned from the address bar");
  await page.getByRole("button", { name: /Выбрать другую Арену/ }).click();
  await page.getByRole("heading", { name: "Куда вы хотите войти?" }).waitFor();

  assert.deepEqual(mutations, [], "Public entry flow must not mutate backend data before submit");

  await page.keyboard.press("Escape");
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.locator("#gateway-mobile-menu").getByRole("button", { name: "Войти" }).click();
  await page.getByRole("heading", { name: "Куда вы хотите войти?" }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".gateway-entry-dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("gateway-menu-button")), true, "Mobile entry must return focus to the persistent menu button");

  await page.route("**/api/auth/register", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "qa-token", username: "qa-nickname", is_admin: false, level: 1, stars: 0, xp: 0 }) }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 999, username: "qa-nickname", display_name: "QA User", is_admin: false, level: 1, stars: 0, xp: 0 }) }));
  await page.route("**/api/company/context", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ companies: [], pending_invitations: [] }) }));
  await page.route("**/api/company/invitations/QA-INVITE", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ company: { name: "QA Company" }, role_label: "Сотрудник", job_title: "Менеджер" }) }));
  await page.goto(`${appUrl}/business/register?invitation=QA-INVITE`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Создайте аккаунт" }).waitFor();
  await page.getByRole("button", { name: /Выбрать другую Арену/ }).click();
  await page.getByRole("button", { name: /Арена для бизнеса/ }).click();
  await page.getByLabel("ФИО").fill("Тестовый Пользователь");
  await page.getByLabel("Никнейм").fill("qa-nickname");
  await page.getByLabel("Логин").fill("qa-private-login");
  await page.getByLabel("Пароль", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: /^Создать аккаунт/ }).click();
  await page.waitForURL(/\/business\/workspaces\?invitation=QA-INVITE$/);
  assert.match(page.url(), /invitation=QA-INVITE$/, "Invitation target must survive returning to the Arena chooser");

  assert.deepEqual(errors, []);
  console.log(`Public entry checks passed. Screenshots: ${screenshots}`);
  await context.close();
} finally {
  await browser.close();
}
