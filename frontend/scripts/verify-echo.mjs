import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = "http://127.0.0.1:5176";
const output = resolve("../.cache/game-lab/echo-qa");
await mkdir(output, { recursive: true });
const registration = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: `echo-qa-${Date.now()}`, password: "game-lab-local-only", avatar_code: "avatar_analyst" }),
});
const auth = await registration.json();
assert.equal(registration.status, 200, JSON.stringify(auth));
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
await context.addInitScript((token) => localStorage.setItem("arena_token", token), auth.access_token);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector(".nova-page-wrap"));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function shot(name, fullPage = false) {
  await settle();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage });
}

try {
  await page.goto(`${base}/lab`);
  await page.locator(".lab-feature").waitFor();
  assert.equal(await page.locator(".echo-home-entry").count(), 1, "Echo is discoverable from the Lab");
  await shot("01-lab-desktop", true);

  await page.locator(".echo-home-entry").click();
  await page.waitForURL("**/lab/echo");
  await page.locator(".echo-case-entry").waitFor();
  assert.equal(await page.getByRole("button", { name: /Исследовать последствия/ }).count(), 1);
  await shot("02-entry-desktop", true);

  await page.getByRole("button", { name: /Исследовать последствия/ }).click();
  await page.waitForURL(/\/lab\/echo\/play\//);
  await page.locator(".echo-cold-open").waitFor();
  assert.equal(await page.locator(".product-page-back:visible").count(), 0, "Player has no duplicate back control");
  assert.equal(await page.locator(".echo-future dl div").count(), 3);
  await shot("03-aftermath-desktop");

  await page.getByRole("button", { name: "Начать с архива" }).click();
  await page.locator(".echo-archive").waitFor();
  assert.equal(await page.locator(".echo-evidence").count(), 4);
  assert.equal(await page.locator(".echo-evidence:disabled").count(), 0);
  for (const [index, button] of (await page.locator(".echo-evidence").all()).entries()) {
    await button.click();
    await page.waitForFunction((count) => document.querySelectorAll(".echo-evidence.is-opened").length >= count, index + 1);
  }
  assert.equal(await page.locator(".echo-evidence:disabled").count(), 0);
  await page.locator(".echo-evidence").first().click();
  await page.waitForFunction(() => document.querySelector(".echo-document p")?.textContent.includes("Я сама разберу вещи"));
  await page.getByRole("button", { name: "Открыть причинную карту" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Открыть причинную карту" }).count(), 1);
  await shot("04-archive-desktop");

  await page.getByRole("button", { name: "Открыть причинную карту" }).click();
  await page.locator(".echo-trace").waitFor();
  assert.equal(await page.locator(".echo-cause").count(), 3);
  for (const [index, button] of (await page.locator(".echo-cause").all()).entries()) {
    await button.click();
    if (index < 2) {
      await page.waitForFunction((count) => document.querySelectorAll(".echo-cause.is-traced").length >= count, index + 1);
      if (index === 0) await shot("05-trace-desktop");
    }
  }
  await page.locator(".echo-intervention").waitFor();
  assert.equal(await page.locator(".echo-intervention-action").count(), 4);
  await shot("06-intervention-desktop");

  await page.locator(".echo-intervention-action").first().click();
  await page.locator(".echo-reveal").waitFor();
  assert.equal(await page.locator(".echo-future-compare .echo-future").count(), 2);
  assert.match(await page.locator(".echo-future-compare .is-rewritten h2").textContent(), /Срок сдвинулся/);
  await shot("07-comparison-desktop");

  await page.getByRole("button", { name: "Зафиксировать результат" }).click();
  await page.locator(".echo-result").waitFor();
  assert.equal(await page.locator(".echo-result .lab-metric").count(), 4);
  assert.equal(await page.getByText("Сначала договорённость, потом срок").count(), 1);
  await shot("08-result-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/lab/echo`);
  await page.locator(".echo-case-entry").waitFor();
  await shot("09-entry-mobile", true);
  await page.getByRole("button", { name: /Посмотреть траекторию/ }).click();
  await page.waitForURL(/\/lab\/echo\/play\//);
  await page.locator(".echo-result").waitFor();
  await shot("10-result-mobile", true);

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
