import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = "http://127.0.0.1:5173";
const output = resolve("../.cache/design-audit-details");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(error.message));

async function capture(name, selector = "body") {
  const target = page.locator(selector);
  await target.waitFor({ timeout: 20000 });
  await page.waitForTimeout(450);
  if (selector === ".booking-calendar") await target.screenshot({ path: resolve(output, `${name}.png`) });
  else await page.screenshot({ path: resolve(output, `${name}.png`) });
  console.log(JSON.stringify({ name, heading: await page.locator("h1, h2").first().textContent().catch(() => null), overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), errors: errors.splice(0) }));
}

try {
  await page.goto(`${base}/`);
  await capture("landing-desktop");
  await page.goto(`${base}/login`);
  await capture("login-desktop");
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/app`);
  await page.locator(".nova-home-world").waitFor({ timeout: 20000 });
  await page.goto(`${base}/rooms`);
  await page.locator(".arena-room-hub").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Запланировать", exact: true }).first().click();
  await capture("booking-desktop", ".booking-calendar");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("booking-mobile", ".booking-calendar");
  const selectedDayVisible = await page.locator(".booking-day-list").evaluate((list) => {
    const selected = list.querySelector('[aria-pressed="true"]');
    if (!selected) return false;
    const bounds = list.getBoundingClientRect();
    const day = selected.getBoundingClientRect();
    return day.left >= bounds.left && day.right <= bounds.right;
  });
  assert.ok(selectedDayVisible, "Выбранная дата должна быть видна в мобильном календаре");
  await page.goto(`${base}/company`);
  await page.locator(".company-stats").waitFor();
  await capture("company-overview-mobile");
  const groups = ["Обучение", "Команды", "Результаты", "Совместная практика", "Управление"];
  for (const group of groups) {
    await page.locator('nav[aria-label="Разделы компании"]').getByRole("button", { name: group }).click();
    await capture(`company-${group.toLowerCase().replaceAll(" ", "-")}-mobile`);
    const subnav = page.locator(".company-subnav");
    if (await subnav.count()) {
      const labels = await subnav.getByRole("button").allTextContents();
      console.log(JSON.stringify({ group, subnav: labels }));
    }
  }
  await page.locator(".company-subnav").getByRole("button", { name: "Правила" }).click();
  await capture("company-rules-mobile");
} finally {
  await browser.close();
}
