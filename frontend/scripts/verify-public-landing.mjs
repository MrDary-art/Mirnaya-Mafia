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
  const publicRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    publicRequests.push(request.url());
    if (request.url().includes("/api/") && request.method() !== "GET") mutations.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Переговоры лучше тренировать/ }).waitFor();
  assert.equal(await page.locator("h1").count(), 1);
  assert.ok(!publicRequests.some((url) => /(?:three\.module|Report\.jsx|Room\.jsx|Layout\.jsx|VoiceConversation)/.test(url)), "Public landing loaded private bundles");
  const header = page.locator(".landing-header");
  assert.equal(await header.locator("a").count(), 2, "Header should contain only the brand and login link");
  assert.equal(await header.getByRole("button").count(), 0);
  assert.equal(await header.getByRole("link", { name: "Войти" }).getAttribute("href"), "/login?next=%2Fapp");
  assert.equal(await page.locator(".landing-hero-actions a").count(), 1);
  assert.equal(await page.locator(".landing-hero-actions a").getAttribute("href"), "#quick-try");
  for (const selector of [".landing-hero-copy > small", ".landing-preview-footer", ".landing-quick-hint",
    ".landing-use-card > small", ".landing-report-aside", ".landing-report-mock > small",
    ".landing-rooms-grid > div:first-child > small", ".landing-facts p"]) {
    assert.equal(await page.locator(selector).count(), 0, `${selector} adds unnecessary small print`);
  }
  assert.match(await page.locator(".landing-report-head").innerText(), /УСЛОВНЫЕ ДАННЫЕ/);
  assert.equal(await page.locator(".landing-final-inner a").count(), 1);
  assert.equal(await page.locator(".landing-rooms-section a").getAttribute("href"), "/demo/rooms");
  const footer = page.locator(".landing-footer");
  assert.equal(await footer.locator(".landing-footer-grid > *").count(), 4);
  assert.deepEqual(await footer.locator(".landing-footer-grid > div:last-child > span").allTextContents(),
    ["Суховский Андрей", "Полякова Дарья", "Федотова Вероника", "Федотова Анжелика"]);
  assert.equal(await footer.getByRole("navigation", { name: "Аккаунт" }).getByRole("link", { name: "Регистрация" }).getAttribute("href"), "/register?next=%2Fapp");
  for (const selector of [".landing-mode-card", ".landing-how-section", ".landing-learning-section", ".landing-company-section"]) {
    assert.equal(await page.locator(`${selector} a`).count(), 0, `${selector} has redundant links`);
  }
  assert.equal(await page.locator(".landing-quick-result").count(), 0);
  await page.locator(".landing-quick-answers button").first().click();
  await page.getByRole("status").getByText("Вы не спорите с требованием", { exact: false }).waitFor();
  assert.equal(await page.locator(".landing-quick-answers button[disabled]").count(), 3);
  await page.getByRole("button", { name: "Переиграть ход" }).click();
  assert.equal(await page.locator(".landing-quick-result").count(), 0);
  await page.locator(".landing-quick-answers button").nth(1).focus();
  await page.keyboard.press("Space");
  await page.getByRole("status").getByText("Вы сразу отвечаете на вопрос о деньгах", { exact: false }).waitFor();
  assert.equal(await page.getByRole("link", { name: /Пройти полную тренировку/ }).getAttribute("href"), "/register?next=%2Fscenarios");
  await page.getByRole("button", { name: "Переиграть ход" }).click();
  await page.locator(".landing-quick-answers button").nth(2).click();
  await page.getByRole("status").getByText("Вы предлагаете решение", { exact: false }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator(".landing-quick-result").count(), 0);
  assert.deepEqual(mutations, [], "Public demo must not mutate backend data");

  for (const width of [1440, 1280, 768, 430, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(appUrl, { waitUntil: "networkidle" });
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(layout.scroll <= layout.width, `Horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
    await page.screenshot({ path: join(screenshots, `${width}.png`) });
    if (width === 1440 || width === 390) {
      for (const [name, selector] of [
        ["quick", ".landing-quick-section"],
        ["features", ".landing-feature-section"],
        ["modes", ".landing-modes-section"],
        ["report", ".landing-report-section"],
        ["team", ".landing-team-section"],
        ["footer", ".landing-footer"],
      ]) await page.locator(selector).screenshot({ path: join(screenshots, `${width}-${name}.png`) });
    }
    console.log(`${width}px: no overflow`);
  }

  assert.equal(await header.locator("a").count(), 2, "Mobile header gained extra actions");
  await page.locator(".landing-footer").getByRole("link", { name: "Команда" }).click();
  assert.equal(new URL(page.url()).hash, "#team");
  const teamTop = await page.locator("#team").evaluate((node) => node.getBoundingClientRect().top);
  assert.ok(teamTop >= 68, `Team anchor is hidden behind the sticky header: ${teamTop}`);
  await page.screenshot({ path: join(screenshots, "375-team-anchor.png") });

  const offlineContext = await browser.newContext();
  await offlineContext.addInitScript(() => localStorage.setItem("arena_token", "offline-test"));
  await offlineContext.route("**/api/**", (route) => route.abort());
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(appUrl, { waitUntil: "domcontentloaded" });
  await offlinePage.getByRole("heading", { name: /Переговоры лучше тренировать/ }).waitFor();
  await offlineContext.close();

  await page.goto(`${appUrl}/app#rooms`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login\?next=/);
  assert.equal(new URL(page.url()).searchParams.get("next"), "/app#rooms");

  await page.goto(`${appUrl}/demo/rooms`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Одна ситуация/ }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Создать встречу" }).getAttribute("href"), "/register?next=%2Frooms");

  await page.goto(`${appUrl}/register?next=%2Ftraining`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Создайте профиль" }).waitFor();
  assert.equal(await page.locator(".arena-auth-points, .forest-motion-control, .arena-start-avatar").count(), 0);
  assert.equal(await page.locator(".arena-auth-card select").count(), 0);
  assert.equal(await page.locator(".arena-auth-card input").count(), 2);
  await page.screenshot({ path: join(screenshots, "375-register.png") });
  await page.getByRole("link", { name: "На главную" }).click();
  await page.waitForURL(`${appUrl}/`);

  await page.goto(`${appUrl}/login?next=%2Ftraining`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "С возвращением" }).waitFor();
  assert.equal(await page.locator(".arena-auth-points").count(), 0, "Login still shows promotional badges");
  assert.equal(await page.locator(".forest-motion-control").count(), 0, "Login should not show background controls");
  assert.equal(await page.locator(".forest-login-world").count(), 1, "Login background disappeared");
  await page.screenshot({ path: join(screenshots, "375-login.png") });
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/training`, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  assert.ok(await page.evaluate(() => localStorage.getItem("arena_token")), "Login did not save an auth token");
  const refreshed = page.waitForResponse((response) => response.url().includes("/api/auth/me"));
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  assert.equal((await refreshed).status(), 200, "Auth refresh failed after returning to the landing");
  await page.locator(".landing-header-login", { hasText: "В кабинет" }).waitFor();
  await page.locator(".landing-header-login", { hasText: "В кабинет" }).click();
  await page.waitForURL(`${appUrl}/app`, { timeout: 20000 });
  await page.locator("#home-title").waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".forest-journey").count(), 1, "Private Home lost its chapter background");
  assert.equal(await page.locator(".nova-experience.is-home").count(), 1, "Private Home lost its owl composition");
  await page.screenshot({ path: join(screenshots, "app-home.png") });
  assert.deepEqual(errors, []);
  console.log(`Smoke checks passed. Screenshots: ${screenshots}`);
  await context.close();
} finally {
  await browser.close();
}
