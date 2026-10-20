import test from "node:test";
import assert from "node:assert/strict";
import { browserSpeechAudioTrackSupported, browserSpeechRecognitionSupported, createBrowserSpeechRecognition, speechRecognitionError } from "./browserSpeechRecognition.js";

test("recognition uses the browser API and combines final and interim Russian speech", () => {
  const previousWindow = globalThis.window;
  let native;
  class MockRecognition {
    constructor() { native = this; }
    start(track) { this.track = track; this.onstart?.(); }
    stop() { this.onend?.(); }
    abort() {}
  }
  globalThis.window = { webkitSpeechRecognition: MockRecognition };
  try {
    const updates = [];
    let ended = false;
    const session = createBrowserSpeechRecognition({ onResult: (...parts) => updates.push(parts), onEnd: () => { ended = true; } });
    assert.equal(browserSpeechRecognitionSupported(), true);
    assert.equal(native.lang, "ru-RU");
    assert.equal(native.continuous, true);
    assert.equal(native.interimResults, true);
    session.start();
    assert.equal(native.track, undefined);
    const track = { kind: "audio", readyState: "live" };
    session.start(track);
    assert.equal(native.track, track);
    native.onresult({ results: { 0: { 0: { transcript: "Добрый день" }, isFinal: true }, 1: { 0: { transcript: "давайте обсудим" }, isFinal: false }, length: 2 } });
    assert.deepEqual(updates.at(-1), ["Добрый день", "давайте обсудим"]);
    assert.equal(session.text(), "Добрый день давайте обсудим");
    native.onresult({ results: { 0: { 0: { transcript: "Добрый день" }, isFinal: true }, 1: { 0: { transcript: "давайте обсудим сроки" }, isFinal: true }, length: 2 } });
    assert.equal(session.text(), "Добрый день давайте обсудим сроки");
    session.stop();
    assert.equal(ended, true);
  } finally { globalThis.window = previousWindow; }
});

test("unsupported browsers and recognition failures have readable messages", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.equal(browserSpeechRecognitionSupported(), false);
    assert.throws(() => createBrowserSpeechRecognition(), /не поддерживает голосовой ввод/);
    assert.match(speechRecognitionError("not-allowed"), /доступ к микрофону/);
    assert.match(speechRecognitionError("network"), /службе распознавания/);
  } finally { globalThis.window = previousWindow; }
});

test("explicit microphone tracks are limited to supported desktop Chrome", () => {
  const previousWindow = globalThis.window;
  class Recognition {}
  Recognition.prototype.processLocally = false;
  const browser = { userAgent: "Chrome/155.0.0.0", mediaDevices: { getUserMedia() {} } };
  globalThis.window = { SpeechRecognition: Recognition, navigator: browser };
  try {
    assert.equal(browserSpeechAudioTrackSupported(), true);
    for (const userAgent of ["Chrome/120.0.0.0", "Chrome/155.0.0.0 Edg/155.0", "Chrome/155.0.0.0 Android", "Version/18.0 Safari/605.1"]) {
      browser.userAgent = userAgent;
      assert.equal(browserSpeechAudioTrackSupported(), false);
    }
  } finally { globalThis.window = previousWindow; }
});
