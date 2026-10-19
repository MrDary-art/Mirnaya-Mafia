import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.CALL_TEST_URL || 'http://127.0.0.1:5173';
const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.context().grantPermissions(['microphone', 'camera'], { origin: base });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

await page.addInitScript(() => {
  const state = {
    me: { id: '1', name: 'Тестовый участник', access: 'owner', role: 0 },
    title: 'Тестовый созвон', started: new Date().toISOString(),
    reservedUntil: new Date(Date.now() + 3600000).toISOString(),
    canJoin: true, reservationEnded: false, phase: 'talk',
    members: [{ id: '1', name: 'Тестовый участник', role: 0, roleName: 'Руководитель', bot: false, inCall: false, audioOn: false, videoOn: false, screenOn: false }],
    permissions: { manage: true }, board: [], boardVersion: 0,
    signals: [], recordingAllowed: false, preparationCall: true,
    host: '1', allowStageRequests: true, iceServers: [],
  };
  const snapshot = () => structuredClone(state);
  window.__callTest = { state, failBoard: false };
  window.councilBridge = {
    request: async (action, body) => {
      if (action === 'call') {
        const member = state.members[0];
        member.inCall = Boolean(body.active);
        member.audioOn = Boolean(body.audio);
        member.videoOn = Boolean(body.video);
        member.screenOn = Boolean(body.screen);
        return snapshot();
      }
      if (action === 'board') {
        if (window.__callTest.failBoard) throw new Error('Сеть недоступна');
        if (body.operation === 'add') state.board.push({ ...body.item, id: String(state.board.length + 1), member: '1' });
        if (body.operation === 'undo') state.board.pop();
        if (body.operation === 'clear') state.board = [];
        state.boardVersion++;
        return snapshot();
      }
      return snapshot();
    },
    upload: async () => ({}),
  };
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
    configurable: true,
    value: async () => {
      const surface = document.createElement('canvas');
      surface.width = 100;
      surface.height = 100;
      return surface.captureStream(1);
    },
  });
});

try {
  await page.goto(`${base}/council-call/index.html?meeting=7`);
  await page.locator('#entry-mic').uncheck();
  await page.locator('#entry-camera').uncheck();
  await page.locator('#join-call').click();
  await page.locator('#meeting').waitFor({ state: 'visible' });
  if (process.env.CALL_TEST_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CALL_TEST_SCREENSHOT_DIR}/call-desktop.png`, fullPage: true });

  const canvas = page.locator('#board');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__callTest.state.board.length === 1);
  const ink = await canvas.evaluate(node => {
    const pixels = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - 231) + Math.abs(pixels[i + 1] - 241) + Math.abs(pixels[i + 2] - 236) > 20) count++;
    return count;
  });
  assert.ok(ink > 20, `Ожидался видимый рисунок, найдено ${ink} пикселей`);

  await page.locator('[data-tool="ellipse"]').click();
  await page.mouse.click(x, y);
  assert.match(await page.locator('#board-status').innerText(), /протяните/i);
  await page.locator('[data-tool="pen"]').click();
  await page.evaluate(() => { window.__callTest.failBoard = true; });
  await page.mouse.move(x + 100, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 20, { steps: 5 });
  await page.mouse.up();
  await page.locator('#retry-board').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.__callTest.state.board.length), 1);
  await page.evaluate(() => { window.__callTest.failBoard = false; });
  await page.locator('#retry-board').click();
  await page.waitForFunction(() => window.__callTest.state.board.length === 2);
  await page.locator('#retry-board').waitFor({ state: 'hidden' });

  await page.locator('#color').selectOption('#4f8f75');
  await page.locator('#width').fill('8');
  assert.equal(await page.locator('#width-value').innerText(), '8');
  for (const [index, selectedTool] of ['line', 'rect', 'ellipse', 'eraser'].entries()) {
    await page.locator(`[data-tool="${selectedTool}"]`).click();
    await canvas.scrollIntoViewIfNeeded();
    const area = await canvas.boundingBox();
    await page.mouse.move(area.x + 60 + index * 80, area.y + 60);
    await page.mouse.down();
    await page.mouse.move(area.x + 100 + index * 80, area.y + 100, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(expected => window.__callTest.state.board.length === expected, 3 + index);
  }
  await page.locator('[data-tool="text"]').click();
  await page.locator('#board-text').fill('Общее решение');
  await canvas.scrollIntoViewIfNeeded();
  const textArea = await canvas.boundingBox();
  await page.mouse.click(textArea.x + 250, textArea.y + 150);
  await page.waitForFunction(() => window.__callTest.state.board.length === 7);
  await page.locator('#undo').click();
  await page.waitForFunction(() => window.__callTest.state.board.length === 6);
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  assert.match((await download).suggestedFilename(), /\.png$/);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear').click();
  await page.waitForFunction(() => window.__callTest.state.board.length === 0);
  await page.locator('#show-gallery').click();
  assert.equal(await page.locator('#board-panel').isHidden(), true);
  await page.locator('#show-board').click();
  assert.equal(await page.locator('#board-panel').isVisible(), true);

  await page.locator('#share').click();
  await page.waitForFunction(() => window.__callTest.state.members[0].screenOn === true);
  assert.equal(await page.locator('#share').getAttribute('aria-pressed'), 'true');
  await page.locator('#share').click();
  await page.waitForFunction(() => window.__callTest.state.members[0].screenOn === false);
  await page.waitForFunction(() => !document.querySelector('#share').disabled);
  assert.equal(await page.locator('#share').getAttribute('aria-pressed'), 'false');

  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => { throw new DOMException('denied', 'NotAllowedError'); },
    });
  });
  await page.locator('#share').click();
  await page.waitForFunction(() => document.querySelector('#error').textContent.includes('Показ экрана'));
  assert.match(await page.locator('#error').innerText(), /выбор окна отменён|браузер запретил/i);

  await page.locator('#mic').click();
  await page.waitForFunction(() => window.__callTest.state.members[0].audioOn === true);
  await page.locator('#camera').click();
  await page.waitForFunction(() => window.__callTest.state.members[0].videoOn === true);
  await page.locator('#mic').click();
  await page.waitForFunction(() => window.__callTest.state.members[0].audioOn === false);
  await page.locator('#camera').click();
  await page.waitForFunction(() => window.__callTest.state.members[0].videoOn === false);

  await page.setViewportSize({ width: 375, height: 844 });
  await page.locator('#board').scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `Мобильная страница выходит за экран на ${overflow}px`);
  if (process.env.CALL_TEST_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CALL_TEST_SCREENSHOT_DIR}/call-mobile.png`, fullPage: true });

  await page.setViewportSize({ width: 844, height: 390 });
  const landscapeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(landscapeOverflow <= 1, `Горизонтальная ориентация выходит за экран на ${landscapeOverflow}px`);

  await page.evaluate(() => { window.__callTest.state.reservationEnded = true; window.__callTest.state.canJoin = false; });
  await page.locator('#meeting').waitFor({ state: 'hidden', timeout: 6000 });
  assert.equal(await page.locator('#controls').isHidden(), true);
  assert.equal(await page.locator('#join-call').isDisabled(), true);
  assert.equal(pageErrors.length, 0, `Ошибки страницы: ${pageErrors.join('; ')}`);
  console.log('Call smoke passed: all board tools and actions, retry, sharing, denial, microphone, camera, ended state');
} finally {
  await browser.close();
}
