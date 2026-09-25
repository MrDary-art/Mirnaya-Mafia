import assert from "node:assert/strict";
import test from "node:test";
import { hasUsableWebGL, isLowPower, renderPixelRatio, shouldUseStaticOwl } from "./performanceTier.js";

test("weak devices choose an inexpensive environment before animation starts", () => {
  assert.equal(isLowPower({ cores: 4, memoryGb: null, saveData: false }), true);
  assert.equal(isLowPower({ cores: 8, memoryGb: 8, saveData: false }), false);
  assert.equal(shouldUseStaticOwl({ cores: 2, memoryGb: null, saveData: false }), true);
  assert.equal(shouldUseStaticOwl({ cores: 4, memoryGb: 4, saveData: false }), false);
  assert.equal(shouldUseStaticOwl({ cores: 8, memoryGb: 8, saveData: true }), true);
});

test("software WebGL is detected before loading Three.js", () => {
  assert.equal(hasUsableWebGL(() => ({ getContext: () => null })), false);
  const fake = (name) => () => ({ getContext: () => ({ RENDERER: 1, getParameter: () => name,
    getExtension: () => null }) });
  assert.equal(hasUsableWebGL(fake("WebKit WebGL")), true);
  assert.equal(hasUsableWebGL(fake("Google SwiftShader")), false);
});

test("render budget reduces the backing buffer on 4K and never enlarges it", () => {
  assert.ok(renderPixelRatio({ width: 3840, height: 2160, lowPower: true }) < .5);
  assert.ok(renderPixelRatio({ width: 1920, height: 1080, lowPower: false }) <= 1.5);
  assert.ok(renderPixelRatio({ width: 1920, height: 1080, lowPower: true, scale: .7 }) < 1);
});
