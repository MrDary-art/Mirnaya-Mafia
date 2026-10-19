import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.ARENA_BASE_URL || "http://127.0.0.1:5173";
const browserPath = process.env.ARENA_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = process.env.ARENA_QA_OUTPUT || "../.cache/business-workspace-qa";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const pageErrors = [];
const sectionChecks = [];

async function authenticatedContext(username, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password: process.env.ARENA_DEMO_PASSWORD || "company-demo" },
  });
  assert.equal(login.status(), 200, `${username} can sign in`);
  const { access_token } = await login.json();
  await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
  return context;
}

async function assertViewport(page, label, width) {
  await page.screenshot({ path: `${output}/${label}-${width}.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow at ${width}px`);
  const topbar = page.locator(".business-topbar");
  assert.equal(await topbar.evaluate(element => getComputedStyle(element).position), "sticky");
  await page.evaluate(() => scrollTo(0, 400));
  assert(Math.abs((await topbar.boundingBox()).y) <= 1, `${label}: back action remains visible while scrolling`);
}

async function auditSections(page, companyId, sections, role, width) {
  for (const section of sections) {
    await page.goto(`${base}/business/${companyId}/${section}`);
    await page.locator("#business-main").waitFor();
    await page.waitForTimeout(350);
    assert.equal(await page.getByText("Раздел недоступен", { exact: true }).count(), 0, `${role}: ${section} is accessible`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}: ${section} fits ${width}px`);
    const alerts = await page.locator("#business-main .business-alert").allTextContents();
    assert.deepEqual(alerts, [], `${role}: ${section} has no API errors`);
    if (role === "owner" && ["analytics", "settings"].includes(section)) {
      await page.screenshot({ path: `${output}/owner-${section}-${width}.png` });
    }
    sectionChecks.push(`${role}:${section}:${width}`);
  }
}

async function auditTabs(page, companyId, section, label, role, width) {
  await page.goto(`${base}/business/${companyId}/${section}`);
  const navigation = page.getByRole("navigation", { name: label });
  await navigation.waitFor();
  const tabs = navigation.getByRole("button");
  await tabs.first().waitFor();
  const count = await tabs.count();
  assert(count > 0, `${role}: ${section} has usable tabs`);
  for (let index = 0; index < count; index += 1) {
    const name = (await tabs.nth(index).innerText()).trim();
    await tabs.nth(index).click();
    await page.waitForTimeout(450);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}: ${section}/${name} fits ${width}px`);
    const alerts = await page.locator("#business-main .business-alert").allTextContents();
    assert.deepEqual(alerts, [], `${role}: ${section}/${name} has no API errors`);
    const visualSamples = {
      "owner:learning:Назначить практику": "owner-learning-manage",
      "owner:team:Общение и опросы": "owner-team-communication",
      "owner:profile:AI и архив": "owner-profile-tools",
      "employee:profile:Профессия и рост": "employee-profile-growth",
    };
    const sample = visualSamples[`${role}:${section}:${name}`];
    if (sample) await page.screenshot({ path: `${output}/${sample}-${width}.png` });
    sectionChecks.push(`${role}:${section}/${name}:${width}`);
  }
}

try {
  for (const width of [1440, 390]) {
    const ownerContext = await authenticatedContext("hierarchy_owner", width);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on("pageerror", error => pageErrors.push(`owner ${width}: ${error.message}`));
    await ownerPage.goto(`${base}/business/continue`);
    await ownerPage.getByRole("heading", { name: "Главная" }).waitFor();
    const companyId = new URL(ownerPage.url()).pathname.split("/")[2];
    assert(companyId && companyId !== "continue");
    await ownerPage.locator(".business-my-arena").waitFor();
    await ownerPage.locator(".business-home-team-progress dl").waitFor();
    await assertViewport(ownerPage, "owner-home", width);
    await ownerPage.locator(".business-topbar-back").click();
    await ownerPage.getByRole("heading", { name: "Ваши компании" }).waitFor();
    await ownerPage.goto(`${base}/business/${companyId}/episodes`);
    await ownerPage.getByRole("button", { name: "Новая ситуация" }).click();
    await ownerPage.getByRole("heading", { name: "Новая рабочая ситуация" }).waitFor();
    await assertViewport(ownerPage, "owner-create", width);

    const onboardingPage = await ownerContext.newPage();
    onboardingPage.on("pageerror", error => pageErrors.push(`onboarding ${width}: ${error.message}`));
    await onboardingPage.route(`**/api/company/context?company_id=${companyId}`, async route => {
      const response = await route.fetch();
      const context = await response.json();
      await route.fulfill({ response, json: { ...context, summary: { ...context.summary, employees: 1 } } });
    });
    await onboardingPage.route(`**/api/company/${companyId}/my-arena`, route => route.fulfill({ json: { episodes: [], commitments: [], meetings: [] } }));
    await onboardingPage.goto(`${base}/business/${companyId}/overview`);
    await onboardingPage.getByRole("link", { name: /Создать рабочую ситуацию/ }).waitFor();
    await onboardingPage.getByRole("heading", { name: "Добавьте команду" }).waitFor();
    await onboardingPage.getByText("1 сотрудник в компании.", { exact: false }).waitFor();
    assert.equal(await onboardingPage.getByRole("heading", { name: "Ход обучения команды" }).count(), 0);
    await assertViewport(onboardingPage, "owner-first-run", width);
    await onboardingPage.getByRole("link", { name: /Открыть команду/ }).click();
    await onboardingPage.locator("#company-employees").waitFor();
    assert(new URL(onboardingPage.url()).hash === "#company-employees");
    await onboardingPage.waitForFunction(() => document.querySelector(".business-hierarchy-page") && document.getElementById("company-employees")?.getBoundingClientRect().top < 300);
    await onboardingPage.goto(`${base}/business/${companyId}/overview`);
    await onboardingPage.getByRole("link", { name: /Создать рабочую ситуацию/ }).waitFor();
    await onboardingPage.getByRole("link", { name: /Создать рабочую ситуацию/ }).click();
    await onboardingPage.getByRole("heading", { name: "Новая рабочая ситуация" }).waitFor();
    await auditSections(ownerPage, companyId, ["episodes", "learning", "meetings", "team", "analytics", "calendar", "profile", "settings"], "owner", width);
    await auditTabs(ownerPage, companyId, "learning", "Разделы обучения", "owner", width);
    await auditTabs(ownerPage, companyId, "team", "Разделы команды", "owner", width);
    await auditTabs(ownerPage, companyId, "profile", "Разделы профиля", "owner", width);
    await ownerContext.close();

    const employeeContext = await authenticatedContext("northstar_13", width);
    const employeePage = await employeeContext.newPage();
    employeePage.on("pageerror", error => pageErrors.push(`employee ${width}: ${error.message}`));
    await employeePage.goto(`${base}/business/continue`);
    await employeePage.getByRole("heading", { name: "Главная" }).waitFor();
    await employeePage.getByRole("link", { name: /Ответить/ }).waitFor();
    assert.equal(await employeePage.getByRole("link", { name: "Аналитика" }).count(), 0);
    await assertViewport(employeePage, "employee-home", width);
    await employeePage.getByRole("link", { name: /Ответить/ }).click();
    await employeePage.getByText("Приглашение в эпизод").waitFor();
    await assertViewport(employeePage, "employee-invitation", width);
    await auditSections(employeePage, companyId, ["episodes", "learning", "meetings", "team", "calendar", "profile"], "employee", width);
    await auditTabs(employeePage, companyId, "learning", "Разделы обучения", "employee", width);
    await auditTabs(employeePage, companyId, "team", "Разделы команды", "employee", width);
    await auditTabs(employeePage, companyId, "profile", "Разделы профиля", "employee", width);
    await employeeContext.close();
  }
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ widths: [1440, 390], roles: ["owner", "employee"], sectionChecks: sectionChecks.length, pageErrors, screenshots: output }));
} finally {
  await browser.close();
}
