import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const password = process.env.ARENA_QA_PASSWORD;
assert(password, "ARENA_QA_PASSWORD is required");
const output = process.env.ARENA_QA_OUTPUT || ".cache/business-growth-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  args: ["--use-angle=swiftshader"],
});
const errors = [];
const results = [];

async function openAs(username, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${username}: ${error.message}`));
  const login = await page.request.post(base + "/api/auth/login", { data: { username, password } });
  assert.equal(login.status(), 200, `login failed for ${username}`);
  const session = await login.json();
  const companyResponse = await page.request.get(base + "/api/company/context", { headers: { Authorization: "Bearer " + session.access_token } });
  assert.equal(companyResponse.status(), 200);
  const company = (await companyResponse.json()).company.id;
  await page.goto(base + "/business");
  await page.evaluate(token => localStorage.setItem("arena_token", token), session.access_token);
  await page.goto(`${base}/business/${company}/overview`);
  await page.locator(".business-shell").waitFor();
  return { context, page, company };
}

async function verifyRole(username, role) {
  const { context, page, company } = await openAs(username, { width: 1440, height: 1000 });
  try {
    const labels = await page.locator(".business-primary-nav a span:last-child").allTextContents();
    assert.deepEqual(labels, ["Главная", "Обучение", "Команда", "Развитие"]);
    assert.equal(await page.getByText("Продолжите с того места, где остановились").count() + await page.getByText("Рабочее пространство готово").count(), 1);
    await page.goto(`${base}/business/${company}/learning`);
    await page.locator(".business-product-tabs").waitFor();
    const learningTabs = await page.locator(".business-product-tabs button").allTextContents();
    assert(learningTabs.includes("Моё обучение"));
    assert(learningTabs.includes("Практика"));
    assert(learningTabs.includes("Заявки"));
    if (role === "owner") {
      assert(learningTabs.includes("Назначить"));
      assert(learningTabs.includes("Автоматизация"));
      assert(learningTabs.includes("Каталог профессий"));
    }
    await page.getByRole("button", { name: "Практика" }).click();
    await page.getByRole("heading", { name: "Выберите формат тренировки" }).waitFor();
    assert.equal(await page.locator(".practice-catalog article").count(), 6);
    await page.waitForFunction(() => !document.body.innerText.includes("Проверяем доступ"));
    if (role === "owner") await page.screenshot({ path: `${output}/owner-practice-desktop.png`, fullPage: true });
    for (const section of ["learning", "team", "growth"]) {
      await page.goto(`${base}/business/${company}/${section}`);
      await page.locator(".business-product-hub").waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role} ${section} overflows`);
    }
    await page.goto(`${base}/business/${company}/growth`);
    await page.locator(".business-product-tabs").waitFor();
    const growthTabs = await page.locator(".business-product-tabs button").allTextContents();
    assert(growthTabs.includes("Моя аналитика"));
    assert(growthTabs.includes("Сертификаты"));
    assert(growthTabs.includes("Профессия и рост"));
    await page.getByRole("button", { name: "Профессия и рост" }).click();
    await page.getByRole("heading", { name: "Профессиональная траектория" }).waitFor();
    await page.screenshot({ path: `${output}/${role}-growth-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/business/${company}/overview`);
    await page.locator(".business-home").waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role} overview mobile overflows`);
    await page.screenshot({ path: `${output}/${role}-home-mobile.png`, fullPage: true });
    results.push({ role, company, navigation: labels });
  } finally {
    await context.close();
  }
}

try {
  await verifyRole("northstar_20", "employee");
  await verifyRole("hierarchy_owner", "owner");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, errors, output }, null, 2));
} finally {
  await browser.close();
}
