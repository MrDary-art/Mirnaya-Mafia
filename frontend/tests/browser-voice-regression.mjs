// Run with TEST_BASE_URL pointing at Vite. Native speech and API replies are controlled.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.recognizers = [];
    window.audioPlays = 0;
    window.testMicrophones = [];
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.delayMicrophone) await new Promise(resolve => { window.resolveMicrophone = resolve; });
      const track = { kind: "audio", readyState: "live", stop() { this.readyState = "ended"; } };
      const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
      window.testMicrophones.push(stream);
      return stream;
    };
    class Recognition {
      constructor() { window.recognizers.push(this); }
      start(track) { this.track = track; setTimeout(() => {
        this.onstart?.();
        if (window.networkFailures > 0) { window.networkFailures--; this.onerror?.({ error: "network" }); }
      }, 0); }
      stop() {
        if (window.dropInterimOnStop) this.onresult?.({ results: [] });
        if (!window.delayRecognitionEnd) setTimeout(() => this.onend?.(), 0);
      }
      abort() { this.onend?.(); }
    }
    Recognition.prototype.processLocally = false;
    window.SpeechRecognition = Recognition;
    window.webkitSpeechRecognition = undefined;
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.Audio = class {
      paused = true;
      ended = false;
      duration = 0.01;
      currentTime = 0;
      play() {
        window.audioPlays++;
        this.paused = false;
        if (!window.holdAudio) setTimeout(() => { this.ended = true; this.onended?.(); }, 20);
        return Promise.resolve();
      }
      pause() { this.paused = true; }
    };
  });
  await page.route("**/api/sessions/123/*", async route => {
    requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({ contentType: "application/x-ndjson", body: [
      { type: "accepted" }, { type: "reply_delta", text: "Давайте обсудим условия." },
      { type: "sentence_audio", text: "Давайте обсудим условия.", wav: "UklGRg==" },
      { type: "done", result: { finished: false } },
    ].map(event => JSON.stringify(event)).join("\n") + "\n" });
  });
  await page.goto(base + "/tests/voice-harness.html");
  const mic = page.getByRole("button", { name: "Ответить голосом", exact: true });
  await mic.click();
  await page.getByRole("button", { name: "Отправить", exact: true }).waitFor();
  await page.evaluate(() => {
    const item = [{ transcript: "Предлагаю обсудить условия продления" }]; item.isFinal = false;
    window.recognizers.at(-1).onresult({ results: [item] });
  });
  assert.equal(requests.length, 0, "Recognition stays in the browser until Send");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await mic.waitFor();
  assert.deepEqual(requests, [{ path: "/api/sessions/123/turn-stream", body: { text: "Предлагаю обсудить условия продления", speak: true } }]);
  assert.equal(await page.evaluate(() => window.audioPlays), 1, "StrictMode must not cancel the speech queue on mount");
  assert.deepEqual(await page.evaluate(() => window.voiceTestResult), { finished: false });
  const send = page.getByRole("button", { name: "Отправить", exact: true });
  async function recognize(text, final = false) {
    await page.evaluate(({text,final}) => {
      const item = [{ transcript: text }]; item.isFinal = final;
      window.recognizers.at(-1).onresult({ results: [item] });
    }, {text,final});
  }
  await mic.click(); await send.waitFor();
  await recognize("Остановим только звук ответа");
  await page.evaluate(() => { window.holdAudio = true; window.voiceTestResult = null; });
  await send.click();
  await page.getByRole("button",{name:"Остановить озвучку",exact:true}).click();
  await mic.waitFor();
  assert.deepEqual(await page.evaluate(() => window.voiceTestResult), { finished: false }, "Stopping speech must retain the accepted turn");
  await page.evaluate(() => { window.holdAudio = false; });
  const beforeRetry = await page.evaluate(() => { window.networkFailures = 1; return window.recognizers.length; });
  await mic.click();
  await page.waitForFunction(count => window.recognizers.length === count + 2, beforeRetry);
  await send.waitFor();
  await recognize("Продолжим после восстановления связи");
  await send.click(); await mic.waitFor();
  assert.equal(requests.at(-1).body.text, "Продолжим после восстановления связи");
  assert.equal(await page.evaluate(() => window.recognizers.at(-1).continuous), false);
  const beforeFailure = await page.evaluate(() => { window.networkFailures = 2; return window.recognizers.length; });
  const saved = requests.length;
  await mic.click();
  await page.getByRole("alert").filter({hasText:"службе распознавания"}).waitFor();
  await mic.waitFor();
  assert.equal(await page.evaluate(() => window.recognizers.length), beforeFailure + 2, "Network recovery must be bounded");
  assert.equal(requests.length, saved, "A failed browser service must not upload audio or create a turn");
  await page.evaluate(() => { window.delayMicrophone = true; });
  await mic.click();
  await page.waitForFunction(() => typeof window.resolveMicrophone === "function");
  await page.getByRole("button", {name:"Отменить",exact:true}).click();
  await page.evaluate(() => { window.delayMicrophone = false; window.resolveMicrophone(); });
  await mic.waitFor();
  await mic.click(); await send.waitFor();
  await recognize("Сохраним согласованные условия");
  await page.evaluate(() => { window.dropInterimOnStop = true; });
  await send.click(); await mic.waitFor();
  assert.equal(requests.at(-1).body.text, "Сохраним согласованные условия", "Stopping must retain the visible transcript");

  await mic.click(); await send.waitFor();
  await recognize("Обсудим бюджет", true);
  const segments = await page.evaluate(() => { const count = window.recognizers.length; window.recognizers.at(-1).onend(); return count; });
  await page.waitForFunction(count => window.recognizers.length > count, segments);
  await recognize("и сроки продления", true);
  await send.click(); await mic.waitFor();
  assert.equal(requests.at(-1).body.text, "Обсудим бюджет и сроки продления");

  await mic.click(); await send.waitFor();
  await recognize("Подтвердим договорённость письменно");
  await page.evaluate(() => { window.delayRecognitionEnd = true; });
  await send.click(); await mic.waitFor();
  const sent = requests.length;
  await page.evaluate(() => window.recognizers.at(-1).onend());
  assert.equal(requests.length, sent, "A late end event must not submit twice");

  await mic.click(); await send.waitFor();
  await recognize("Отменённая запись");
  await page.getByRole("button", {name:"Отменить",exact:true}).click();
  await mic.waitFor();
  assert.equal(requests.length, sent, "Cancel must not send a turn");
  await mic.click(); await send.waitFor();
  await page.evaluate(() => window.recognizers.at(-1).onerror({error:"not-allowed"}));
  await mic.waitFor();
  assert.match(await page.getByRole("alert").innerText(), /доступ к микрофону/);
  assert.equal(requests.length, sent);
  await page.evaluate(() => { window.SpeechRecognition = undefined; });
  await mic.click();
  await page.getByRole("alert").filter({hasText:"не поддерживает"}).waitFor();
  assert.equal(await page.evaluate(() => window.testMicrophones.every(stream => stream.getTracks().every(track => track.readyState === "ended"))), true);
  assert.equal(await page.evaluate(() => window.recognizers.every(item => item.track?.kind === "audio")), true);
  assert.deepEqual(errors, []);
  console.log("Browser voice: StrictMode audio, final text, segment restart, late end, cancel and permission errors: OK");
} finally { await browser.close(); }
