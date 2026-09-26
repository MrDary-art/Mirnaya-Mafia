import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/living-world-v8/evidence/current");
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const results = [];
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Логин").fill("demo");
    await page.getByLabel("Пароль", { exact: true }).fill("demo");
    await page.locator(".arena-auth-submit").click();
    await page.waitForURL(`${appUrl}/app`, { timeout: 15000 });
    if (label === "mobile") await page.getByRole("button", { name: "Ещё" }).click();
    const prefix = label === "mobile" ? "forest-motion-mode-mobile" : "forest-motion-mode";
    await page.locator(`#${prefix}`).selectOption("full");
    await page.locator(`.forest-motion-control${label === "mobile" ? "-menu" : ":not(.forest-motion-control-menu)"} .forest-settings-extra summary`).click();
    await page.locator(`#${prefix}-time`).selectOption("manual");
    if (label === "mobile") await page.getByRole("button", { name: "Закрыть" }).click();
    for (const phase of ["dawn", "day", "sunset", "night"]) {
      if (label === "mobile") {
        await page.getByRole("button", { name: "Ещё" }).click();
        await page.locator(".forest-motion-control-menu .forest-settings-extra summary").click();
      } else if (!await page.locator(".forest-motion-control:not(.forest-motion-control-menu) .forest-settings-extra").evaluate((element) => element.open)) {
        await page.locator(".forest-motion-control:not(.forest-motion-control-menu) .forest-settings-extra summary").click();
      }
      await page.locator(`#${prefix}-phase`).selectOption(phase);
      if (label === "mobile") await page.getByRole("button", { name: "Закрыть" }).click();
      else await page.locator(".forest-motion-control:not(.forest-motion-control-menu) .forest-settings-extra summary").click();
      await page.locator('[data-home-section="hero"]').scrollIntoViewIfNeeded();
      await page.locator('.forest-panel[data-forest-scene="hero"] .forest-panel-image').evaluate((image) => image.decode());
      await page.waitForTimeout(950);
      await page.screenshot({ path: resolve(output, `${label}-hero-${phase}.png`) });
      results.push({ label, scene: "hero", phase, actual: await page.locator(".forest-journey").getAttribute("data-forest-phase"),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors: errors.splice(0) });
    }
    if (label === "desktop") {
      for (const [scene, phase] of [["scenarios", "day"], ["scenarios", "night"], ["profile", "day"], ["profile", "night"]]) {
        await page.locator(".forest-motion-control:not(.forest-motion-control-menu) .forest-settings-extra summary").click();
        await page.locator(`#${prefix}-phase`).selectOption(phase);
        await page.locator(".forest-motion-control:not(.forest-motion-control-menu) .forest-settings-extra summary").click();
        await page.locator(`[data-home-section="${scene}"]`).scrollIntoViewIfNeeded();
        await page.locator(`.forest-panel[data-forest-scene="${scene}"] .forest-panel-image`).evaluate((image) => image.decode());
        await page.waitForTimeout(900);
        await page.screenshot({ path: resolve(output, `${label}-${scene}-${phase}.png`) });
        results.push({ label, scene, phase, errors: errors.splice(0) });
      }
      await page.goto(`${appUrl}/practice`, { waitUntil: "domcontentloaded" });
      await page.screenshot({ path: resolve(output, "desktop-work-night.png") });
      results.push({ label, scene: "practice", phase: await page.locator(".forest-route-backdrop").getAttribute("data-forest-phase"),
        motion: await page.locator(".forest-route-backdrop").getAttribute("data-forest-motion"), errors: errors.splice(0) });
    }
    await context.close();
  }
  await writeFile(resolve(output, "checks.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
