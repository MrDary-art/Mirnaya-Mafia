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

async function assertDialogGeometry(dialog, label) {
  const geometry = await dialog.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewportWidth, `${label} must fit viewport width: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.viewportHeight, `${label} must fit viewport height: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${label} must not overflow horizontally: ${JSON.stringify(geometry)}`);
}

try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await chooser.getByRole("heading", { name: "Куда хотите войти?" }).waitFor();
  assert.equal(await chooser.locator(".gateway-entry-options > button").count(), 2);
  await assertDialogGeometry(chooser, "Desktop Arena chooser");
  await chooser.screenshot({ path: join(screenshots, "chooser-desktop.png") });
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.closest(".gateway-entry-options")?.lastElementChild === document.activeElement), true, "Initial backward tab must move to the last Arena option");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("gateway-entry-close")), true, "Forward tab must wrap to the chooser close button");
  await chooser.getByRole("button", { name: /Арена переговоров/ }).click();
  await page.getByRole("heading", { name: "С возвращением!" }).waitFor();
  assert.equal(await page.locator(".registration-context").innerText(), "АРЕНА ПЕРЕГОВОРОВ");
  assert.deepEqual(await page.locator(".registration-form input").evaluateAll((inputs) => inputs.map((input) => input.name)), ["login", "password"]);
  await assertDialogGeometry(page.locator(".landing-auth-dialog"), "Desktop personal login");
  await page.locator(".landing-auth-dialog").screenshot({ path: join(screenshots, "personal-login-desktop.png") });

  await page.getByRole("button", { name: /К выбору пространства/ }).click();
  await chooser.getByRole("button", { name: /Арена для бизнеса/ }).click();
  await page.getByRole("heading", { name: "С возвращением!" }).waitFor();
  assert.equal(await page.locator(".registration-context").innerText(), "АРЕНА ДЛЯ БИЗНЕСА");
  assert.match(await page.locator("#landing-auth-description").innerText(), /доступные компании/);
  await page.locator(".landing-auth-dialog").screenshot({ path: join(screenshots, "business-login-desktop.png") });
  await page.getByRole("tab", { name: "Регистрация" }).click();
  assert.deepEqual(await page.locator(".registration-form input").evaluateAll((inputs) => inputs.map((input) => input.name)), ["fullName", "nickname", "login", "password"]);
  assert.match(await page.locator("#arena-nickname-hint").innerText(), /профиле и сообществе/);
  assert.match(await page.locator("#arena-login-hint").innerText(), /Для входа в аккаунт/);
  await assertDialogGeometry(page.locator(".landing-auth-dialog"), "Desktop registration");
  await page.locator(".landing-auth-dialog").screenshot({ path: join(screenshots, "business-registration-desktop.png") });
  await page.keyboard.press("Escape");
  await page.locator(".gateway-entry-dialog, .landing-auth-dialog").waitFor({ state: "detached" });
  const personalCardEntry = page.locator(".gateway-mode-personal").getByRole("button");
  await personalCardEntry.click();
  await page.locator(".landing-auth-dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".landing-auth-dialog").waitFor({ state: "detached" });
  assert.equal(await personalCardEntry.evaluate((button) => document.activeElement === button), true, "Entry must return focus to the latest trigger");

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(appUrl, { waitUntil: "networkidle" });
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(layout.scroll <= layout.width, `Horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: join(screenshots, `${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/business/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "С возвращением!" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/", "Business entry alias must resolve to the canonical landing path");
  assert.equal(new URL(page.url()).search, "", "Business entry query should be cleaned from the address bar");
  await assertDialogGeometry(page.locator(".landing-auth-dialog"), "Mobile business login");
  await page.screenshot({ path: join(screenshots, "business-login-mobile.png") });
  await page.getByRole("button", { name: /К выбору пространства/ }).click();
  await page.getByRole("heading", { name: "Куда хотите войти?" }).waitFor();
  await assertDialogGeometry(page.locator(".gateway-entry-dialog"), "Mobile Arena chooser");
  await page.screenshot({ path: join(screenshots, "chooser-mobile.png") });

  assert.deepEqual(mutations, [], "Public entry flow must not mutate backend data before submit");

  await page.keyboard.press("Escape");
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.locator("#gateway-mobile-menu").getByRole("button", { name: "Войти" }).click();
  await page.getByRole("heading", { name: "Куда хотите войти?" }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".gateway-entry-dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("gateway-menu-button")), true, "Mobile entry must return focus to the persistent menu button");

  const registrationRequests = [];
  await page.route("**/api/auth/register", (route) => {
    registrationRequests.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "qa-token", username: "qa-nickname", is_admin: false, level: 1, stars: 0, xp: 0 }) });
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 999, username: "qa-nickname", display_name: "QA User", is_admin: false, level: 1, stars: 0, xp: 0 }) }));
  await page.route("**/api/company/context", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ companies: [], pending_invitations: [] }) }));
  await page.route("**/api/company/invitations/QA-INVITE", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ company: { name: "QA Company" }, role_label: "Сотрудник", job_title: "Менеджер" }) }));
  await page.goto(`${appUrl}/business/register?invitation=QA-INVITE`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Создайте аккаунт" }).waitFor();
  await assertDialogGeometry(page.locator(".landing-auth-dialog"), "Mobile business registration");
  await page.screenshot({ path: join(screenshots, "business-registration-mobile.png") });
  await page.setViewportSize({ width: 320, height: 568 });
  const compactDialog = page.locator(".landing-auth-dialog");
  await assertDialogGeometry(compactDialog, "Compact mobile registration");
  const compactScroll = await compactDialog.evaluate((dialog) => {
    dialog.scrollTop = 0;
    return { overflowY: getComputedStyle(dialog).overflowY, scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight };
  });
  assert.match(compactScroll.overflowY, /auto|scroll/, `Compact dialog must own vertical scrolling: ${JSON.stringify(compactScroll)}`);
  assert.ok(compactScroll.scrollHeight > compactScroll.clientHeight, `Compact dialog must have scrollable content: ${JSON.stringify(compactScroll)}`);
  await compactDialog.hover();
  await page.mouse.wheel(0, 1600);
  await page.waitForFunction(() => document.querySelector(".landing-auth-dialog")?.scrollTop > 0);
  const compactSubmit = await page.getByRole("button", { name: /^Создать аккаунт/ }).boundingBox();
  assert.ok(compactSubmit && compactSubmit.y >= 0 && compactSubmit.y + compactSubmit.height <= 568, `Compact registration submit must be reachable: ${JSON.stringify(compactSubmit)}`);
  await page.screenshot({ path: join(screenshots, "business-registration-compact-mobile.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await compactDialog.evaluate((dialog) => dialog.scrollTo({ top: 0 }));
  await page.getByRole("button", { name: /^Создать аккаунт/ }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), "fullName", "Registration validation must focus the first invalid field");
  const invalidFieldState = await page.locator('.registration-form input[aria-invalid="true"]').evaluateAll((inputs) => inputs.map((input) => ({ name: input.name, description: input.getAttribute("aria-describedby"), messageExists: Boolean(document.getElementById(input.getAttribute("aria-describedby"))) })));
  assert.deepEqual(invalidFieldState, [
    { name: "fullName", description: "arena-full-name-hint", messageExists: true },
    { name: "nickname", description: "arena-nickname-hint", messageExists: true },
    { name: "login", description: "arena-login-hint", messageExists: true },
    { name: "password", description: "arena-password-hint", messageExists: true },
  ], "Every invalid registration field must expose its validation message");
  assert.equal(await page.locator("#arena-full-name-hint").getAttribute("role"), "alert", "The first validation error must be announced");
  await page.screenshot({ path: join(screenshots, "business-registration-validation-mobile.png") });
  await page.getByRole("button", { name: /К выбору пространства/ }).click();
  await page.getByRole("button", { name: /Арена для бизнеса/ }).click();
  await page.getByLabel("ФИО").fill("Тестовый Пользователь");
  await page.getByLabel("Никнейм").fill("qa-nickname");
  await page.getByLabel("Логин").fill("qa-private-login");
  await page.getByLabel("Пароль", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: /^Создать аккаунт/ }).click();
  await page.waitForURL(/\/business\/workspaces\?invitation=QA-INVITE$/);
  assert.match(page.url(), /invitation=QA-INVITE$/, "Invitation target must survive returning to the Arena chooser");
  assert.deepEqual(registrationRequests, [{
    method: "POST",
    body: { username: "qa-nickname", login: "qa-private-login", full_name: "Тестовый Пользователь", password: "qa-password" },
  }], "Registration must preserve the public nickname/private login contract");

  assert.deepEqual(errors, []);
  console.log(`Public entry checks passed. Screenshots: ${screenshots}`);
  await context.close();
} finally {
  await browser.close();
}
