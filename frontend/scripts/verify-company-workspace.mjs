import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(7_000);
const pageErrors = [];
const failedCompanyRequests = [];

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/company") && response.status() >= 400) {
    failedCompanyRequests.push(`${response.status()} ${response.url()}`);
  }
});

try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/company`);
  await page.getByText("КОРПОРАТИВНОЕ ПРОСТРАНСТВО").waitFor();

  const tabs = page.locator('nav[aria-label="Разделы компании"] button');
  await tabs.first().waitFor();
  const tabLabels = await tabs.allTextContents();
  for (let index = 0; index < await tabs.count(); index += 1) {
    const errorsBefore = pageErrors.length;
    await tabs.nth(index).click();
    await page.waitForTimeout(300);
    if (pageErrors.length > errorsBefore) console.log(JSON.stringify({ tab: tabLabels[index], errors: pageErrors.slice(errorsBefore) }));
  }

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedCompanyRequests, []);
  console.log(JSON.stringify({ companyLoaded: true, tabs: tabLabels, pageErrors, failedCompanyRequests }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
