// Run against a local Vite server. All API replies and microphone input are synthetic.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5184";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "msedge", headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const errors = [];
try {
  const admin = await browser.newPage();
  admin.on("pageerror", error => errors.push(error.message));
  await admin.addInitScript(() => localStorage.setItem("arena_token", "test-only"));
  await admin.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === "/api/auth/me") data = { id: 1, username: "admin", is_admin: true, must_change_password: false };
    else if (path.endsWith("/companies")) data = [];
    else if (path.endsWith("/overview")) data = { daily: {}, modes: {}, reports: {}, finished_modes: {}, technical: {}, definitions: {} };
    else if (path.endsWith("/users")) data = { total: 1, items: [{ id: 2, username: "tester", modes: [], created_at: "2026-09-28T10:00:00", completed: 1, reports: 0 }] };
    else if (path.endsWith("/sessions")) data = { total: 1, items: [{ id: 123, username: "tester", mode: "online", created_at: "2026-09-28T10:00:00", report_status: "not_requested" }] };
    else if (path.endsWith("/sessions/123")) data = { id: 123, report: null, report_status: "not_requested", messages: [{ sender: "user", text: "Тестовая реплика" }] };
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({ json: data });
  });
  await admin.goto(base + "/admin");
  await admin.getByRole("heading", { name: "Активность по дням" }).waitFor();
  for (let i = 0; i < 2; i++) {
    await admin.getByRole("button", { name: "Пользователи", exact: true }).click();
    await admin.getByRole("button", { name: "Открыть аналитику" }).waitFor();
    await admin.getByRole("button", { name: "Сессии и отчёты", exact: true }).click();
    await admin.getByRole("button", { name: "Переписка", exact: true }).click();
    await admin.getByRole("heading", { name: "Сохранённый разбор #123" }).waitFor();
    await admin.getByRole("button", { name: "Обзор", exact: true }).click();
    await admin.getByRole("heading", { name: "Активность по дням" }).waitFor();
  }
  assert.equal(await admin.getByText("Сайт установлен", { exact: true }).count(), 0);
  console.log("Admin tab switching and saved conversation: OK");

  for (const mode of ["network", "unsupported", "normal", "cancel"]) {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const sent = [];
    await page.addInitScript(mode => {
      window.testStreams = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        const stream = await original(options); window.testStreams.push(stream); return stream;
      };
      if (mode === "unsupported") { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; return; }
      class Recognition {
        start() {
          setTimeout(() => {
            this.onstart?.();
            if (mode === "normal") {
              const item = [{ transcript: "Мой опыт работы" }]; item.isFinal = true;
              this.onresult?.({ results: [item] });
            } else this.onerror?.({ error: "network" });
          }, 30);
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = Recognition;
    }, mode);
    await page.route("**/api/sessions/123/*", async route => {
      sent.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataBuffer(), headers: route.request().headers() });
      await route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ type: "transcript_done", text: "Мой опыт работы" }) + "\n" + JSON.stringify({ type: "done", result: {} }) + "\n" });
    });
    await page.goto(base + "/tests/voice-harness.html");
    await page.getByRole("button", { name: "Ответить голосом" }).click();
    await page.getByRole("button", { name: "Отправить" }).waitFor();
    await page.waitForTimeout(700);
    assert.equal(sent.length, 0, "Audio must not leave the browser before Send");
    await page.getByRole("button", { name: mode === "cancel" ? "Отменить" : "Отправить", exact: mode === "cancel" }).click();
    await page.getByRole("button", { name: "Ответить голосом" }).waitFor();
    assert.equal(await page.evaluate(() => window.testStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended"))), true);
    if (mode === "cancel") assert.equal(sent.length, 0);
    else {
      assert.equal(sent.length, 1);
      assert.equal(sent[0].path.endsWith(mode === "normal" ? "/turn-stream" : "/voice-stream"), true);
      if (mode !== "normal") {
        assert.ok(sent[0].body.length >= 9600 && sent[0].body.length <= 1280000);
        assert.equal(sent[0].headers["x-audio-rate"], "16000");
      }
    }
    console.log(`Voice ${mode}: OK`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
