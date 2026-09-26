import assert from "node:assert/strict";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/design-pass-v4/qa-browser");
const videoDir = resolve(output, "videos");
await mkdir(videoDir, { recursive: true });
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/app`);
  await page.goto(`${appUrl}/training/path/chapter/chapter-1`);
  await page.locator(".path-card:not(.locked) .primary-button").first().click();
  await page.waitForURL(/\/training\/path\/attempt\//);
  const attempt = page.url();
  let answered = 0;
  for (let index = 0; index < 10 && !page.url().includes("/report"); index += 1) {
    await page.locator(".answer-button").first().waitFor();
    await page.locator(".answer-button").first().click();
    await page.getByRole("button", { name: "Ответить", exact: true }).click();
    await page.locator(".choice-feedback").waitFor();
    answered += 1;
    if (index === 0) await page.screenshot({ path: resolve(output, "learning-answer-feedback.png") });
    await page.getByRole("button", { name: /Продолжить|Перейти к отчёту/ }).click();
  }
  await page.waitForURL(/\/report$/);
  await page.locator(".path-report").waitFor();
  await page.getByRole("heading", { name: /Эмоциональный сигнал/ }).waitFor();
  const reportScroll = await page.evaluate(() => window.scrollY);
  assert.ok(reportScroll <= 20, `Report opened at scrollY=${reportScroll}`);
  await page.screenshot({ path: resolve(output, "learning-report.png") });
  await page.getByRole("button", { name: "Разбор ответов" }).click();
  await page.waitForURL(/\/review$/);
  await page.locator(".path-review").waitFor();
  const reviewScroll = await page.evaluate(() => window.scrollY);
  assert.ok(reviewScroll <= 20, `Review opened at scrollY=${reviewScroll}`);
  await page.screenshot({ path: resolve(output, "learning-review.png") });
  assert.equal(answered, 4);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ attempt, answered, reportAndReview: true, reportScroll, reviewScroll, errors }, null, 2));
} finally {
  await page.close();
  const video = await page.video().path();
  await context.close();
  await browser.close();
  await rename(video, resolve(videoDir, "v4-learning-flow-final.webm"));
}
