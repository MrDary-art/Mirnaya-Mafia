import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('../.cache/owl-repair'); await mkdir(output, { recursive: true });
const label = process.argv[2] || 'current';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 650 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => console.error(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.goto('http://127.0.0.1:5173/login?next=%2Fapp%3Fowl3d%3D1%26owlLab%3D1');
  await page.getByLabel('Логин', { exact: true }).fill('demo');
  await page.getByLabel('Пароль', { exact: true }).fill('demo');
  await page.locator('.arena-auth-submit').click(); await page.waitForURL('**/app?owl3d=1&owlLab=1');
  await page.waitForFunction(() => window.__arenaOwlLab || window.__arenaOwlError, null, { timeout: 60000 }).catch(async error => {
    console.error(await page.evaluate(() => ({ url: location.href, status: document.querySelector('[data-owl-status]')?.dataset, text: document.body.innerText.slice(0, 1200) })));
    await page.screenshot({ path: resolve(output, 'capture-error.png') }); throw error;
  });
  const error = await page.evaluate(() => window.__arenaOwlError); if (error) throw new Error(error);
  for (const [clip, times] of [['FlyLoop', [0,.1,.2,.3,.4,.5,.6,.7]], ['Takeoff',[0,.35,.7,1,1.3,1.6,2,2.39]], ['Landing',[0,.4,.8,1.2,1.6,2,2.3,2.59]], ['Idle',[0,1,2,3]]]) {
    const base64 = await page.evaluate(({ clip, times }) => {
      const owl = window.__arenaOwlLab, camera = owl.camera;
      owl.inspectClip(clip); owl.setPaused(true);
      const sheet = document.createElement('canvas'); sheet.width = 1600; sheet.height = times.length * 325;
      const ctx = sheet.getContext('2d'); ctx.fillStyle = '#dce3e4'; ctx.fillRect(0,0,sheet.width,sheet.height);
      // Front, three-quarter, side, back at each phase, fixed physical scale.
      for (let i = 0; i < times.length; i++) for (let j = 0; j < 4; j++) {
        owl.seek(times[i]); owl.root.position.set(0,0,0); owl.root.scale.setScalar(1); owl.root.rotation.set(0,j * Math.PI / 4,0);
        camera.position.set(0,1.8,6.8); camera.lookAt(0,1.8,0); camera.updateMatrixWorld();
        owl.root.parent.children.forEach(child => { if (child.isGroup && child !== owl.root) child.visible = false; });
        owl.render();
        ctx.drawImage(document.querySelector('.nova-experience canvas'), j * 400,i * 325,400,325);
        ctx.fillStyle = '#172a24'; ctx.font = '13px sans-serif'; ctx.fillText(`${clip}  ${times[i].toFixed(2)} s · ${j*45}°`, j*400+10,i*325+18);
      }
      return sheet.toDataURL('image/png').split(',')[1];
    }, { clip, times });
    await writeFile(resolve(output, `${label}-${clip}.png`), Buffer.from(base64, 'base64'));
  }
} finally { await browser.close(); }
