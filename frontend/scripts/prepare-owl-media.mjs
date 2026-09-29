import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { OWL_SHA256 } from '../src/experience/owl/owlV4.js';

const root = resolve(import.meta.dirname, '..');
const revision = OWL_SHA256.slice(0, 8);
const output = resolve(root, 'public/assets/owl/media');
const frames = await mkdtemp(resolve(tmpdir(), 'arena-owl-media-'));
const fps = 8;
const clips = ['Idle', 'HeadTilt', 'Takeoff', 'FlyLoop', 'Glide', 'Landing'];
const sourceHash = createHash('sha256')
  .update(await readFile(resolve(root, 'public/assets/owl/owl-v4-repaired.glb'))).digest('hex');
if (sourceHash !== OWL_SHA256) throw new Error('Owl GLB differs from the declared source hash');
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.ARENA_CHROME_PATH || (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome'),
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/scripts/owl-media-render.html`);
  await page.waitForFunction(() => Boolean(window.__owlMedia), null, { timeout: 90000 });
  const data = await page.evaluate(() => ({ clips: window.__owlMedia.clips,
    calibration: window.__owlMedia.calibration, anchor: window.__owlMedia.anchor }));
  for (const clip of clips) {
    const count = Math.round(data.clips[clip] * fps);
    for (let frame = 0; frame < count; frame++) {
      const png = await page.evaluate(({ name, time }) => window.__owlMedia.render(name, time),
        { name: clip, time: frame / fps });
      await writeFile(resolve(frames, `${clip}-${String(frame).padStart(3, '0')}.png`), Buffer.from(png, 'base64'));
    }
    console.log(`${clip}: ${count} frames`);
  }
  const stump = await page.evaluate(() => window.__owlMedia.renderStump());
  await writeFile(resolve(frames, 'Stump-000.png'), Buffer.from(stump, 'base64'));
  const python = process.env.ARENA_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
  const args = [...(process.platform === 'win32' && !process.env.ARENA_PYTHON ? ['-3'] : []),
    resolve(root, 'scripts/encode-owl-media.py'), frames, output, revision, String(fps)];
  const encoded = spawnSync(python, args, { stdio: 'inherit' });
  if (encoded.status !== 0) throw new Error(`Owl media encoder failed (${encoded.status})`);
  const dimensions = JSON.parse(await readFile(resolve(output, `owl-${revision}-dimensions.json`), 'utf8'));
  await writeFile(resolve(root, 'src/experience/owl/owlMedia.json'), JSON.stringify({
    sourceSha256: OWL_SHA256, fps, cameraZ: 8.2, sourceSize: 512,
    clips: data.clips, calibration: data.calibration, anchor: data.anchor, dimensions,
  }, null, 2) + '\n');
  await rm(resolve(output, `owl-${revision}-dimensions.json`));
} finally {
  await browser?.close();
  await server.close();
  await rm(frames, { recursive: true, force: true });
}
