import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = "http://127.0.0.1:5173";
const output = resolve("../.cache/design-audit-current");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Логин", { exact: true }).fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${base}/app`);
  await page.locator(".nova-home-world").waitFor({ timeout: 20000 });
  console.log(JSON.stringify({ afterLogin: page.url(), token: await page.evaluate(() => Boolean(localStorage.getItem("arena_token"))) }));
  const routes = [
    ["home", "/app"], ["ai", "/ai"], ["guide", "/ai/demo"],
    ["scenarios", "/scenarios"], ["rooms", "/rooms"], ["training", "/training"],
    ["friends", "/people"], ["profile", "/profile"], ["company", "/company"],
    ["setup", "/setup"], ["history", "/history"], ["analytics", "/analytics"],
    ["shop", "/shop"], ["theory", "/theory"], ["path", "/training/path"],
    ["practice", "/practice"], ["job", "/ai/job"], ["prepare", "/ai/prepare"],
    ["unknown", "/not-a-real-page"],
  ];
  for (const [width, height, suffix] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of routes) {
      await page.goto(`${base}${path}`);
      await page.locator(name === "home" ? ".nova-home-world" : ".product-page").waitFor({ timeout: 20000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(output, `${name}-${suffix}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${name}-${suffix}: horizontal overflow`);
      assert.deepEqual(errors, [], `${name}-${suffix}: browser errors`);
      console.log(JSON.stringify({ name, suffix, url: page.url(), heading: await page.locator("h1").first().textContent().catch(() => null), overflow, errors: errors.splice(0) }));
    }
  }
} finally {
  await browser.close();
}
