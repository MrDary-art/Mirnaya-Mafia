import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const screenshots = join(tmpdir(), "arena-business-entry-qa");
await mkdir(screenshots, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});

const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
await context.addInitScript(() => localStorage.setItem("arena_token", "business-entry-qa"));
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

await page.route("**/api/auth/me", route => route.fulfill({ json: { username: "alex", is_admin: false, level: 1, stars: 0, xp: 0 } }));
await page.route("**/api/company/context", route => route.fulfill({ json: { companies: [], pending_invitations: [] } }));
await page.route("**/api/company/search?*", route => route.fulfill({ json: [{ id: 7, name: "Северная студия", industry: "Образование", members: 24, application_status: null }] }));

try {
  await page.goto(`${appUrl}/business/workspaces`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Подключите компанию" }).waitFor();
  assert.equal(await page.getByText(/генеральный директор|роль владельца/i).count(), 0, "Role explanations must not compete with the primary choices");
  assert.deepEqual(await page.locator(".business-entry-option h2").allTextContents(), ["Присоединиться", "Создать компанию"]);
  assert.equal(await page.locator("#business-invitation-code").count(), 0, "Invitation form should use progressive disclosure");
  await page.screenshot({ path: join(screenshots, "desktop.png"), fullPage: true });

  const searchTrigger = page.getByRole("button", { name: /Найти компанию/ });
  await searchTrigger.click();
  const companyQuery = page.getByLabel("Название компании");
  await companyQuery.waitFor();
  assert.equal(await companyQuery.evaluate(input => document.activeElement === input), true, "Opening search must focus the company query");
  await companyQuery.fill("Север");
  await page.getByRole("button", { name: "Искать" }).click();
  await page.getByRole("heading", { name: "Северная студия" }).waitFor();
  await page.screenshot({ path: join(screenshots, "desktop-search.png"), fullPage: true });

  await page.getByRole("button", { name: "Закрыть поиск компании" }).click();
  assert.equal(await page.locator("#business-company-search").count(), 0);
  assert.equal(await searchTrigger.evaluate(button => document.activeElement === button), true, "Closing search must restore focus to its trigger");
  const inviteTrigger = page.getByRole("button", { name: "Ввести код" });
  await inviteTrigger.click();
  const inviteInput = page.getByLabel("Ссылка или код");
  await inviteInput.waitFor();
  assert.equal(await inviteInput.evaluate(input => document.activeElement === input), true, "Opening an invitation must focus its input");
  await page.getByRole("button", { name: "Свернуть" }).click();
  assert.equal(await inviteTrigger.evaluate(button => document.activeElement === button), true, "Collapsing an invitation must restore focus to its trigger");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/business/workspaces`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Подключите компанию" }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Mobile layout must not overflow horizontally");
  await page.screenshot({ path: join(screenshots, "mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 667, height: 375 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Landscape layout must not overflow horizontally");
  assert.deepEqual(pageErrors, []);
  console.log(`Business entry checks passed. Screenshots: ${screenshots}`);
} finally {
  await context.close();
  await browser.close();
}
