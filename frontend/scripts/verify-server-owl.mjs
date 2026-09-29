import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.ARENA_PREVIEW_URL || 'http://127.0.0.1:5173';
const output = resolve('../.cache/owl-server');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome'),
  headless: true,
  args: ['--use-angle=swiftshader'],
});
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const requests = [], errors = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/login?next=%2Fapp`);
    await page.locator('input[name="username"]').fill('demo');
    await page.locator('input[name="password"]').fill('demo');
    await page.locator('.arena-auth-submit').click();
    await page.waitForURL(`${base}/app`, { timeout: 15000 });
    await page.locator('.nova-owl-media').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const image = document.querySelector('.nova-owl-media');
      return image?.complete && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1';
    });
    assert.equal(await page.locator('.nova-experience canvas').count(), 0);
    assert.equal(requests.some(url => url.endsWith('.glb')), false, 'GLB must not be requested by visitors');
    const idle = await page.locator('.nova-owl-media').evaluate(element => ({
      src: element.currentSrc, rect: element.getBoundingClientRect().toJSON(),
    }));
    assert.match(idle.src, /owl-idle-.*\.webp$/);
    assert.ok(idle.rect.width > 80 && idle.rect.height > 140, 'perched owl is visible');
    const stumpTransform = await page.locator('.nova-owl-stump').evaluate(element => element.style.transform);
    assert.ok(stumpTransform, 'stump has a fixed placement');
    await page.screenshot({ path: resolve(output, `${name}-idle.png`) });
    await page.locator('[data-home-section="ai"]').scrollIntoViewIfNeeded();
    if (name === 'desktop') {
      await page.waitForTimeout(800);
      await page.screenshot({ path: resolve(output, 'desktop-takeoff.png') });
    }
    await page.waitForFunction(() => document.querySelector('.nova-owl-media')?.currentSrc.includes('owl-flyloop-'),
      null, { timeout: 6000 });
    await page.screenshot({ path: resolve(output, `${name}-flight.png`) });
    assert.equal(await page.locator('.nova-owl-stump').evaluate(element => element.style.transform), stumpTransform,
      'stump stays on Hero while the owl flies');
    if (name === 'desktop') {
      await page.waitForFunction(() => document.querySelector('.nova-owl-media')?.currentSrc.includes('owl-glide-'),
        null, { timeout: 9000 });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => document.querySelector('.nova-owl-media')?.currentSrc.includes('owl-idle-'),
      null, { timeout: 6000 });
    if (name === 'desktop') {
      const box = await page.locator('.nova-owl-media').boundingBox();
      await page.mouse.move(0, 0);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * .3);
      await page.waitForFunction(() => document.querySelector('.nova-owl-media')?.currentSrc.includes('owl-headtilt-'),
        null, { timeout: 3000 });
    }
    assert.deepEqual(errors, []);
    console.log(`${name}: idle, flight, return; no GLB or WebGL canvas`);
    await page.close();
  }
  const fallback = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fallback.route('**/assets/owl/media/*.webp', route => route.abort());
  await fallback.goto(`${base}/login?next=%2Fapp`);
  await fallback.locator('input[name="username"]').fill('demo');
  await fallback.locator('input[name="password"]').fill('demo');
  await fallback.locator('.arena-auth-submit').click();
  await fallback.waitForURL(`${base}/app`, { timeout: 15000 });
  await fallback.locator('.nova-owl-v4-poster').waitFor({ state: 'visible' });
  await fallback.waitForFunction(() => document.querySelector('.nova-owl-v4-poster')?.naturalWidth > 0);
  assert.equal(await fallback.locator('.nova-owl-media').count(), 0);
  console.log('failed media: static poster remains visible');
  await fallback.close();
  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await reduced.goto(`${base}/login?next=%2Fapp`);
  await reduced.locator('input[name="username"]').fill('demo');
  await reduced.locator('input[name="password"]').fill('demo');
  await reduced.locator('.arena-auth-submit').click();
  await reduced.waitForURL(`${base}/app`, { timeout: 15000 });
  await reduced.locator('.nova-owl-v4-poster').waitFor({ state: 'visible' });
  assert.equal(await reduced.locator('.nova-owl-media').count(), 0);
  await reduced.locator('[data-home-section="ai"]').scrollIntoViewIfNeeded();
  await reduced.locator('.nova-owl-v4-poster').waitFor({ state: 'hidden' });
  console.log('reduced motion: poster on Hero, hidden after leaving Hero');
  await reduced.close();
} finally {
  await browser.close();
}
