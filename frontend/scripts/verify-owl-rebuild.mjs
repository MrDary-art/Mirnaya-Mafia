import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { OWL_REBUILD_ASSET, OWL_REBUILD_SHA256 } from '../src/experience/owl/owlRebuild.js';

const output = resolve('../.cache/owl-rebuild-web');
await mkdir(output, { recursive: true });
const bytes = await readFile(new URL(`../public/assets/owl/${OWL_REBUILD_ASSET}`, import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), OWL_REBUILD_SHA256);
const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('arena_token', 'visual-qa'));
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(route.request().url().endsWith('/auth/me')
      ? { username: 'visual-qa', is_admin: false, level: 1, stars: 0, xp: 0 }
      : { daily_challenge: { minutes: 3, reward: 2 } }) }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/app?owl3d=1&owlLab=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__arenaOwlLab || window.__arenaOwlError, null, { timeout: 90000 });
  const state = await page.evaluate(() => ({ error: window.__arenaOwlError,
    status: document.querySelector('[data-owl-status]')?.dataset.owlStatus,
    clip: window.__arenaOwlLab?.activeClip,
    asset: window.__arenaOwlLab?.assetUrl,
    skins: (() => { let count = 0; window.__arenaOwlLab?.model.traverse(object => { if (object.isSkinnedMesh) count++; }); return count; })(),
  }));
  assert.equal(state.error, undefined);
  assert.equal(state.status, 'ready');
  assert.equal(state.clip, 'TEST_Perch');
  assert.ok(state.asset.endsWith(OWL_REBUILD_ASSET));
  assert.ok(state.skins > 100, `Expected rigged meshes, found ${state.skins}`);
  await page.locator('.owl-debug-panel').evaluate(element => { element.open = false; });
  await page.screenshot({ path: resolve(output, 'home-perched.png') });
  const motion = await page.evaluate(() => {
    const owl = window.__arenaOwlLab;
    owl.inspectClip('FlightLoop'); owl.setPaused(true);
    owl.seek(.15);
    const wing = owl.model.getObjectByName('Wing_L_Wrist');
    wing.updateMatrixWorld(true);
    const a = wing.matrixWorld.elements[13];
    owl.seek(.55); wing.updateMatrixWorld(true);
    return { a, b: wing.matrixWorld.elements[13], clip: owl.activeClip,
      flightPose: owl.flightPose, root: owl.root.position.toArray(), calibration: owl.calibration };
  });
  assert.equal(motion.clip, 'FlightLoop');
  assert.ok(Math.abs(motion.a - motion.b) > .2, `Wrist did not flap: ${JSON.stringify(motion)}`);
  await page.screenshot({ path: resolve(output, 'home-flight.png') });
  const journey = await page.evaluate(() => {
    const owl = window.__arenaOwlLab;
    owl.resumeJourney();
    owl.setHomeSnapshot({ heroProgress: 1, velocity: 300 });
    for (let i = 0; i < 60; i++) owl.update(1 / 60, i * 1000 / 60, false);
    const flying = owl.activeClip;
    owl.setHomeSnapshot({ heroProgress: 0, velocity: 0 });
    for (let i = 0; i < 120; i++) owl.update(1 / 60, 1000 + i * 1000 / 60, false);
    const perched = owl.activeClip;
    return { flying, perched };
  });
  assert.deepEqual(journey, { flying: 'FlightLoop', perched: 'TEST_Perch' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...state, motion, journey, screenshots: output }, null, 2));
} finally { await browser.close(); }
