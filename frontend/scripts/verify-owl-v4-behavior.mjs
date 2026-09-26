import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { OWL_ASSET } from '../src/experience/owl/owlV4.js';

const output = resolve('../.cache/owl-v4'); await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader'] });
const report = { renderer: 'Chrome headless, forced SwiftShader; not a hardware/device FPS benchmark', checks: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    recordVideo: { dir: resolve(output, 'video'), size: { width: 1200, height: 750 } } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/login?next=%2Fapp%3Fowl3d%3D1%26owlLab%3D1`);
  await page.getByLabel('Логин', { exact: true }).fill('demo');
  await page.getByLabel('Пароль', { exact: true }).fill('demo');
  await page.locator('.arena-auth-submit').click(); await page.waitForURL('**/app?owl3d=1&owlLab=1');
  await page.waitForFunction(() => window.__arenaOwlLab, null, { timeout: 60000 });
  const storageState = await context.storageState();
  await page.waitForFunction(() => window.__arenaOwlLab, { timeout: 60000 });
  await page.locator('.owl-debug-panel').evaluate(el => el.open = false);
  const sampled = await page.evaluate(() => {
    const owl = window.__arenaOwlLab, THREE = owl.THREE, results = [];
    for (const { name, duration } of owl.getDiagnostics().clips) {
      owl.inspectClip(name);
      const points = [];
      for (const fraction of [0, .25, .5, .75, .999]) {
        owl.seek(duration * fraction);
        const finite = [];
        owl.model.traverse(node => { if (node.isBone) finite.push(...node.matrixWorld.elements); });
        if (!finite.every(Number.isFinite)) throw new Error(`${name}: non-finite joint`);
        const head = owl.model.getObjectByName('Head');
        const forward = new THREE.Vector3(0,0,1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
        points.push({ fraction, rootY: owl.model.getObjectByName('Root').position.y, headForward: forward.toArray() });
      }
      results.push({ name, duration, jointsFinite: true, points });
    }
    owl.resumeJourney(); return results;
  });
  report.clips = sampled;
  assert.equal(sampled.length, 14);
  report.checks.push('All 14 clips sampled at five times; finite joint matrices');
  for (const [name, time, yaw] of [['Idle',0,0], ['WaveLeftFoot',1.4,0], ['WaveRightFoot',1.4,Math.PI/2], ['Takeoff',1.2,0], ['FlyLoop',.22,0], ['FlyLoop',.6,Math.PI/2], ['Glide',1,0], ['Landing',2.2,0]]) {
    await page.evaluate(({name,time,yaw}) => { const owl = window.__arenaOwlLab; owl.inspectClip(name); owl.seek(time); owl.debugYaw = yaw; owl.update(0, performance.now()); owl.setPaused(true); owl.render(); }, {name,time,yaw});
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(output, `${name}-${yaw ? 'side' : 'front'}.png`) });
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.waitForTimeout(300);
    const bounds = await page.evaluate(() => {
      const owl = window.__arenaOwlLab, THREE = owl.THREE, samples = [];
      for (const time of [0, .2, .4, .6, .8]) {
        owl.inspectClip('FlyLoop'); owl.seek(time); owl.setPaused(true);
        owl.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(owl.model, true);
        const projected = [];
        for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
          projected.push(new THREE.Vector3(x,y,z).project(owl.camera).toArray());
        }
        samples.push({ time, left: Math.min(...projected.map(p=>p[0])), right: Math.max(...projected.map(p=>p[0])), bottom: Math.min(...projected.map(p=>p[1])), top: Math.max(...projected.map(p=>p[1])) });
      }
      owl.render(); return samples;
    });
    const placement = await page.evaluate(() => ({ home: window.__arenaOwlLab.homePose, flight: window.__arenaOwlLab.flightPose, actual: window.__arenaOwlLab.root.position.toArray() }));
    assert.ok(bounds.every(b => b.left > -1 && b.right < 1 && b.bottom > -1 && b.top < 1), `${width}: clipped flight: ${JSON.stringify({ bounds, placement })}`);
    report.checks.push(`Full wingspan inside ${width}px viewport at five flight poses`);
    await page.evaluate(() => { const owl = window.__arenaOwlLab; owl.inspectClip('Idle'); owl.setPaused(true); owl.render(); });
    await page.screenshot({ path: resolve(output, `responsive-${width}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  }
  // Deterministic mixer steps isolate transitions from slow software rendering.
  await page.evaluate(() => window.__arenaOwlLab.resumeJourney());
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Практика с ИИ', exact: true }).click();
  await page.waitForFunction(() => window.__arenaOwlLab.homeSnapshot?.heroProgress > .5, { timeout: 20000 });
  const flight = await page.evaluate(() => {
    const owl = window.__arenaOwlLab;
    for (let i=0;i<150;i++) owl.update(.02, performance.now());
    return owl.getDiagnostics();
  });
  assert.ok(['flying','gliding'].includes(flight.state), JSON.stringify(flight));
  assert.ok(flight.actions.length <= 2);
  await page.screenshot({ path: resolve(output, 'journey-ai.png') });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arena:navigate-home', { detail: { sectionId: 'profile' } })));
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('.nova-experience canvas').count(), 1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('arena:navigate-home', { detail: { sectionId: 'hero' } })));
  await page.waitForFunction(() => window.__arenaOwlLab.homeSnapshot?.heroProgress < .03, { timeout: 20000 });
  const landed = await page.evaluate(() => {
    const owl = window.__arenaOwlLab;
    for (let i=0;i<450;i++) owl.update(.02, performance.now());
    return owl.getDiagnostics();
  });
  assert.equal(landed.state, 'perched');
  report.checks.push('Sidebar navigation, lower sections, return/landing, single canvas');
  report.softwareRendererSample = await page.evaluate(() => window.__arenaWorldStats);
  await page.goto(`${base}/ai`); assert.equal(await page.locator('.nova-experience canvas').count(), 0);
  await page.goto(`${base}/app?owl3d=1&owlLab=1#scenarios`);
  await page.waitForFunction(() => window.__arenaOwlLab, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__arenaOwlLab.activeClip), 'FlyLoop');
  report.checks.push('Unmount/return and direct lower-section link');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.__arenaOwlLab.paused), true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  report.checks.push('Visibility handler pauses and resumes the mixer');
  assert.deepEqual(errors, []);
  const video = page.video(); await context.close();
  report.video = await video.path();

  for (const mode of ['reduced', 'weak', '404', 'context-loss']) {
    const ctx = await browser.newContext({ storageState, viewport: { width: 390, height: 844 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    if (mode === 'weak') await ctx.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
    const p = await ctx.newPage(); const requests = [];
    p.on('request', request => { if (request.url().includes(OWL_ASSET)) requests.push(request.url()); });
    if (mode === '404') await p.route(`**/${OWL_ASSET}`, route => route.fulfill({ status: 404, body: 'test: missing model' }));
    await p.goto(`${base}/app${['404','context-loss'].includes(mode) ? '?owl3d=1&owlLab=1' : ''}`);
    if (mode === 'context-loss') {
      await p.waitForFunction(() => window.__arenaOwlLab, { timeout: 60000 });
      await p.locator('.nova-experience canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    }
    await p.locator('[data-owl-status="fallback"]').waitFor({ timeout: 30000 });
    await p.waitForFunction(() => document.querySelector('.nova-owl-v4-poster')?.naturalWidth > 0);
    assert.equal(await p.locator('.nova-experience canvas').count(), 0);
    if (mode === 'reduced' || mode === 'weak') assert.equal(requests.length, 0);
    await p.screenshot({ path: resolve(output, `fallback-${mode}.png`) });
    await p.getByRole('link', { name: 'Начать практику', exact: true }).click();
    report.checks.push(`${mode}: current-model poster, no canvas, working CTA`);
    await ctx.close();
  }
  report.errors = errors; report.result = 'passed';
  await writeFile(resolve(output, 'behavior-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
