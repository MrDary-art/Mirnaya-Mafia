import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
await context.addInitScript(() => localStorage.setItem("arena_token", "visual-qa"));
await context.route("**/api/**", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(route.request().url().endsWith("/auth/me")
    ? { username: "visual-qa", is_admin: false, level: 1, stars: 0, xp: 0 }
    : { daily_challenge: { minutes: 3, reward: 2 } }),
}));
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:5173/?owlLab=1", { waitUntil: "domcontentloaded" });
  await page.locator(".nova-owl-fallback").waitFor({ state: "detached", timeout: 20000 });
  const samples = await page.evaluate(() => new Promise((resolve) => {
    const output = [];
    const started = performance.now();
    const timer = setInterval(() => {
      const owl = window.__arenaOwlLab;
      output.push({
        t: Math.round(performance.now() - started),
        clip: owl.activeClip,
        clipTime: Number(owl.activeAction?.time.toFixed(3)),
        left: Number(owl.wings[0].upper.rotation.z.toFixed(3)),
        right: Number(owl.wings[1].upper.rotation.z.toFixed(3)),
        head: Number(owl.head.rotation.y.toFixed(3)),
        root: Number(owl.root.rotation.y.toFixed(3)),
        opacity: Number(owl.opacity.toFixed(3)),
        idle: owl.idle.active?.name || null,
      });
      if (performance.now() - started > 11000) {
        clearInterval(timer);
        resolve(output);
      }
    }, 80);
  }));
  const visible = samples.filter((sample) => sample.opacity > .9);
  const anomalies = visible.filter((sample) => sample.left > -1.2 || sample.right < 1.2);
  assert.ok(visible.length > 40, "Not enough rendered idle frames were observed");
  assert.deepEqual(anomalies, [], "Idle must never expose the spread-wing bind pose");
  console.log(JSON.stringify({
    count: samples.length,
    minWing: Math.min(...samples.map((sample) => sample.left)),
    maxWing: Math.max(...visible.map((sample) => sample.left)),
    anomalies,
    wraps: samples.filter((sample, index) => index > 0 && sample.clipTime < samples[index - 1].clipTime),
  }, null, 2));
} finally {
  await browser.close();
}
