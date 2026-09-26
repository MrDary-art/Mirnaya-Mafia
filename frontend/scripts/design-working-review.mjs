import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('../.cache/design-working-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const base = 'http://127.0.0.1:5173';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
async function capture(name) {
  await page.waitForTimeout(600);
  const selects = await page.locator('select:not([multiple]):not([size])').evaluateAll(list => list.map(el => getComputedStyle(el).appearance));
  assert.ok(selects.every(value => value === 'base-select'), `${name}: select appearance`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${name}: horizontal overflow`);
  assert.deepEqual(errors, [], name);
  await page.screenshot({ path: resolve(output, `${name}.png`) });
  console.log(JSON.stringify({ name, selects: selects.length, errors }));
}
try {
  await page.goto(`${base}/login`);
  await page.getByLabel('Логин', { exact: true }).fill('demo');
  await page.getByLabel('Пароль', { exact: true }).fill('demo');
  await page.locator('.arena-auth-submit').click();
  await page.waitForURL(`${base}/app`);
  await page.locator('.nova-home-world').waitFor();
  for (const [state, selector] of [['report', '.history-row:has(.history-row-verdict)'], ['play', '.history-row:has-text("Переговоры · В процессе")']]) {
    await page.goto(`${base}/history`);
    await page.locator(selector).first().click();
    await page.locator(state === 'report' ? '.report-document' : '.scenario-transcript').waitFor();
    await capture(`${state}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(`${state}-mobile`);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  for (const [name, route] of [['profile-editor', '/profile/edit'], ['analytics', '/analytics'], ['interview', '/ai/prepare?kind=job']]) {
    await page.goto(`${base}${route}`);
    await page.locator('.product-page-body').waitFor();
    await capture(`${name}-desktop`);
    const select = page.locator('select').first();
    if (await select.count()) {
      await select.click();
      await capture(`${name}-picker`);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(`${name}-mobile`);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.goto(`${base}/company`);
  await page.locator('nav[aria-label="Разделы компании"]').getByRole('button', { name: 'Обучение', exact: true }).click();
  await page.getByRole('button', { name: 'Создать задание', exact: true }).click();
  await page.locator('form select').first().click();
  await capture('assignment-picker');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('assignment-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.company-subnav').getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.locator('form select').nth(1).click();
  await capture('material-picker');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('material-mobile');
} finally { await browser.close(); }
