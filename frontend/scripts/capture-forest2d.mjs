import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/forest2d-qa");
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Логин").fill("demo");
    await page.getByLabel("Пароль", { exact: true }).fill("demo");
    await page.locator(".arena-auth-submit").click();
    await page.waitForURL(`${appUrl}/`, { timeout: 15000 });
    await page.locator(".forest-journey").waitFor({ state: "visible" });
    if (viewport.width < 768) {
      await page.getByRole("button", { name: "Ещё" }).click();
      await page.locator("#forest-motion-mode-mobile").selectOption("full");
      await page.getByRole("button", { name: "Закрыть" }).click();
    } else await page.locator("#forest-motion-mode").selectOption("full");
    const prefix = viewport.width < 768 ? "mobile" : "desktop";
    for (const id of ["hero", "ai", "rooms", "scenarios", "learning", "history", "friends", "profile", "finale"]) {
      await page.locator(`[data-home-section="${id}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(output, `${prefix}-${id}.png`), fullPage: false });
      const info = await page.evaluate((sceneId) => {
        const panel = document.querySelector(`.forest-panel[data-forest-scene="${sceneId}"]`);
        const image = panel?.querySelector("img.forest-panel-image");
        const section = document.querySelector(`[data-home-section="${sceneId}"]`);
        const panelRect = panel?.getBoundingClientRect();
        const sectionRect = section?.getBoundingClientRect();
        return {
          sceneId, scrollY: Math.round(scrollY),
          panel: panelRect && [Math.round(panelRect.top), Math.round(panelRect.bottom)],
          section: sectionRect && [Math.round(sectionRect.top), Math.round(sectionRect.bottom)],
          imageLoaded: image?.complete && image?.naturalWidth > 0,
          imageHidden: image?.hidden,
          imageUrl: image?.currentSrc,
          journey: getComputedStyle(document.querySelector(".forest-journey")).zIndex,
          shell: getComputedStyle(document.querySelector(".nova-shell")).backgroundColor,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          stats: window.__forestStats || null,
        };
      }, id);
      results.push({ viewport: prefix, ...info, errors: errors.splice(0) });
    }
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
