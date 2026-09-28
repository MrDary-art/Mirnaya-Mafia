import test from "node:test";
import assert from "node:assert/strict";
import { browserSpeechRecognitionSupported, createBrowserSpeechRecognition, speechRecognitionError } from "./browserSpeechRecognition.js";

test("recognition uses the browser API and combines final and interim Russian speech", () => {
  const previousWindow = globalThis.window;
  let native;
  class MockRecognition {
    constructor() { native = this; }
    start() { this.onstart?.(); }
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
    assert.match(speechRecognitionError("network"), /подключение/);
  } finally { globalThis.window = previousWindow; }
});
