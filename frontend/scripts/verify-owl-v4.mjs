import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { OWL_CLIPS, OWL_SHA256, OWL_ASSET } from '../src/experience/owl/owlV4.js';

const bytes = await readFile(new URL(`../public/assets/owl/${OWL_ASSET}`, import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), OWL_SHA256);
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
assert.equal(gltf.skins[0].joints.length, 79);
assert.deepEqual(gltf.animations.map(clip => clip.name), OWL_CLIPS);
assert.equal(gltf.meshes.length, 8);
assert.ok(!gltf.images.some(image => image.uri));
console.log(JSON.stringify({ bytes: bytes.length, joints: 79, clips: gltf.animations.map(clip => clip.name) }));
const output = resolve('../.cache/owl-v4'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5173/login?next=%2Fapp%3Fowl3d%3D1%26owlLab%3D1');
  await page.getByLabel('Логин', { exact: true }).fill('demo');
  await page.getByLabel('Пароль', { exact: true }).fill('demo');
  await page.locator('.arena-auth-submit').click();
  await page.waitForURL('**/app?owl3d=1&owlLab=1');
  await page.waitForFunction(() => window.__arenaOwlLab || window.__arenaOwlError, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__arenaOwlError), undefined);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const owl=window.__arenaOwlLab; owl.resumeJourney(); owl.snapToPose(owl.homePose); owl.update(0,performance.now()); owl.setPaused(true); owl.render(); });
  console.log(JSON.stringify(await page.evaluate(() => ({ ...window.__arenaOwlLab.getDiagnostics(), calibration: window.__arenaOwlLab.calibration, stats: window.__arenaWorldStats }))));
  await page.locator('.owl-debug-panel').evaluate(element => element.open = false);
  await page.screenshot({ path: resolve(output, 'home-desktop.png') });
  // Export a transparent, tightly cropped render of THIS model as the fallback.
  const poster = await page.locator('.nova-experience canvas').evaluate(canvas => {
    const source = document.createElement('canvas'); source.width = canvas.width; source.height = canvas.height;
    const ctx = source.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, source.width, source.height);
    let left = source.width, top = source.height, right = 0, bottom = 0;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    const crop = document.createElement('canvas'); crop.width = right - left + 3; crop.height = bottom - top + 3;
    crop.getContext('2d').drawImage(source, left - 1, top - 1, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return crop.toDataURL('image/webp', .95).split(',')[1];
  });
  await writeFile(new URL('../public/assets/owl/owl-v4-poster.webp', import.meta.url), Buffer.from(poster, 'base64'));
  await page.evaluate(() => { const owl = window.__arenaOwlLab; owl.inspectClip('FlyLoop'); owl.seek(.55); owl.setPaused(true); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(output, 'flight-front.png') });
  await page.evaluate(() => { const owl = window.__arenaOwlLab; owl.resumeJourney(); owl.setPaused(true); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(output, 'home-mobile.png') });
  await writeFile(resolve(output, 'initial-check.json'), JSON.stringify({ errors, gltf: { joints: 79, bytes: bytes.length, clips: OWL_CLIPS } }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
