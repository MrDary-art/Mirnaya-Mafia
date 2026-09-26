import assert from 'node:assert/strict';
import test from 'node:test';
import { HomeWorldScrollController } from './HomeWorldScrollController.js';

test('home controller is the sole easing owner, independent of CSS smooth scrolling', () => {
  const previous = globalThis.window;
  const calls = [];
  globalThis.window = { scrollY: 0, innerHeight: 900, innerWidth: 1440,
    scrollTo(options) { calls.push(options); this.scrollY = options.top; } };
  try {
    const controller = new HomeWorldScrollController({ root: {}, onActive() {}, onFrame() {} });
    controller.offsets = [0, 1000, 2000];
    controller.travel = { from: 0, target: 1000, started: 0, duration: 1000 };
    controller.sample(500);
    assert.equal(calls[0].behavior, 'instant');
    assert.equal(calls[0].top, 500);
    controller.sample(1000);
    assert.equal(calls[1].top, 1000);
    assert.equal(controller.travel, null);
  } finally { globalThis.window = previous; }
});
