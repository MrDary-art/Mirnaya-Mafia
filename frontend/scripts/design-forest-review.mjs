import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../.cache/design-forest-review");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const base = "http://127.0.0.1:5173";
async function capture(name, selector) {
  if (selector) await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(output, `${name}.png`) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${name}: horizontal overflow`);
  const controls = await page.locator('select:not([multiple]):not([size])').evaluateAll(elements => elements.map(element => getComputedStyle(element).appearance));
  assert.ok(controls.every(value => value === 'base-select'), `${name}: unstyled picker`);
  const capturedErrors = errors.splice(0);
  assert.deepEqual(capturedErrors, [], `${name}: browser errors`);
  console.log(JSON.stringify({ name, selects: controls.length, errors: capturedErrors }));
}
try {
  await page.goto(base);
  await page.locator(".landing-forest img").waitFor();
  assert.ok(await page.locator(".landing-forest img").evaluate(img => img.complete && img.naturalWidth > 0));
  await capture("landing-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("landing-mobile");
  await page.goto(`${base}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/app`);
  await page.locator(".nova-home-world").waitFor();
  await capture("home-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture("home-desktop");
  await page.goto(`${base}/ai/demo`);
  await page.locator('.mode-guide').waitFor();
  await capture('guide-reference');
  console.log(JSON.stringify({ customizablePicker: await page.evaluate(() => CSS.supports("appearance", "base-select")) }));
  for (const [name, route, selector] of [
    ["ai", "/ai", ".practice-options"],
    ["scenarios", "/scenarios", ".scenario-catalog-filters"],
    ["training", "/training", ".training-hub-options"],
    ["history", "/history", ".history-list"],
    ["prepare", "/ai/prepare", ".practice-setup-form"],
    ["company", "/company", ".company-stats"],
  ]) {
    await page.goto(`${base}${route}`);
    await page.locator(selector).first().waitFor();
    await capture(`${name}-desktop`, selector);
    if (name === "history") {
      const overlaps = await page.locator(".history-row").evaluateAll(rows => rows.filter(row => {
        const main = row.querySelector(".history-row-main").getBoundingClientRect();
        const action = row.querySelector(".history-row-action").getBoundingClientRect();
        return main.right > action.left && main.top < action.bottom && main.bottom > action.top;
      }).length);
      assert.equal(overlaps, 0, "History titles and actions must not overlap");
    }
    if (name === "scenarios") {
      const select = page.locator("select").first();
      await select.click();
      await capture("scenario-picker-desktop");
      await page.keyboard.press("Escape");
      await select.focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(`${name}-mobile`, selector);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.locator('nav[aria-label="Разделы компании"]').getByRole("button", { name: "Управление", exact: true }).click();
  await page.locator(".company-subnav").getByRole("button", { name: "Настройки компании", exact: true }).click();
  await capture("company-settings", 'form');
  const groups = await page.locator('nav[aria-label="Разделы компании"] button').allTextContents();
  for (const group of groups) {
    await page.locator('nav[aria-label="Разделы компании"]').getByRole('button', { name: group, exact: true }).click();
    const tabs = await page.locator('.company-subnav button').allTextContents();
    for (const tab of tabs) {
      await page.locator('.company-subnav').getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(250);
      const selectors = page.locator('select:not([multiple]):not([size])');
      for (const select of await selectors.all()) {
        assert.equal(await select.evaluate(el => getComputedStyle(el).appearance), 'base-select', `${tab}: select theme`);
        if (await select.isVisible() && await select.isEnabled()) {
          await select.click();
          await page.keyboard.press('Escape');
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(`company-${tab}`);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  }
  await page.goto(`${base}/rooms`);
  await page.getByRole("button", { name: "Запланировать", exact: true }).first().click();
  await capture("booking-desktop", ".booking-calendar");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("booking-mobile", ".booking-calendar");
  assert.deepEqual(errors, []);
  const comparison = await browser.newPage({ viewport: { width: 1440, height: 490 } });
  const images = await Promise.all(['guide-reference', 'ai-desktop'].map(async name => `data:image/png;base64,${(await readFile(resolve(output, `${name}.png`))).toString('base64')}`));
  await comparison.setContent(`<body style="margin:0;background:#101b15;color:#e9f3dd;font:14px sans-serif"><div style="display:flex">${images.map((src,index)=>`<section style="width:50%"><p style="margin:12px">${index ? 'Режим: после изменений' : 'Референс: Как это работает'}</p><img style="width:100%;display:block" src="${src}"></section>`).join('')}</div></body>`);
  await comparison.screenshot({ path: resolve(output, 'comparison.png') });
} finally { await browser.close(); }
