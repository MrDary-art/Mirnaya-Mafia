import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/forest2d-qa");
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const findings = [];

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Логин").fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/`, { timeout: 15000 });
  await page.locator(".forest-journey").waitFor({ state: "visible" });
  return page;
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const loginPage = await signIn(context);
  await loginPage.close();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-motion-control select").selectOption("full");
  await page.locator(".forest-panel-image").first().evaluate((image) => image.decode());
  await page.waitForFunction(() => window.__forestClock >= 6.7);
  await page.screenshot({ path: resolve(output, "droplet-forming.png") });
  await page.waitForFunction(() => window.__forestClock >= 7.35);
  await page.screenshot({ path: resolve(output, "droplet-falling.png") });
  await page.waitForFunction(() => window.__forestClock >= 8.2);
  await page.screenshot({ path: resolve(output, "droplet-ripple.png") });
  await page.waitForFunction(() => window.__forestClock >= 10.5); // Entire leaf → drop → splash → ripple episode.
  await page.screenshot({ path: resolve(output, "desktop-hero-still.png") });
  for (const id of ["ai", "rooms", "scenarios", "learning", "profile"]) {
    await page.locator(`[data-home-section="${id}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(id === "scenarios" ? 3000 : 450);
  }
  await page.locator('[data-home-section="hero"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const sections = await page.evaluate(() => [...document.querySelectorAll("[data-home-section]")]
    .map((element) => ({ id: element.dataset.homeSection, top: element.getBoundingClientRect().top + scrollY })));
  for (const id of ["ai", "scenarios", "profile"]) {
    const section = sections.find((entry) => entry.id === id);
    await page.evaluate((top) => scrollTo(0, top - innerHeight / 2), section.top);
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(output, `boundary-${id}.png`) });
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(3500);
  findings.push({ check: "desktop-idle", stats: await page.evaluate(() => window.__forestStats), errors: errors.splice(0) });
  await page.locator(".forest-motion-control select").selectOption("static");
  await page.waitForTimeout(100);
  findings.push({ check: "static-mode", mode: await page.locator(".forest-journey").getAttribute("data-forest-motion"),
    canvasPixel: await page.evaluate(() => [...document.querySelector(".forest-ambient-canvas").getContext("2d").getImageData(750, 600, 1, 1).data]),
    errors: errors.splice(0) });
  await page.locator(".forest-motion-control select").selectOption("full");
  await page.goto(`${appUrl}/admin`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-route-backdrop").waitFor({ state: "visible" });
  findings.push({ check: "focused-work-route", mode: await page.locator(".forest-route-backdrop").getAttribute("data-forest-motion"),
    visibleControls: await page.locator(".forest-motion-control:visible").count(), errors: errors.splice(0) });
  await page.close();
  await context.close();

  for (const [name, viewport] of [["tablet", { width: 768, height: 1024 }], ["wide", { width: 1920, height: 1080 }], ["zoom-200-equivalent", { width: 720, height: 450 }]]) {
    const qaContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const qaPage = await signIn(qaContext);
    await qaPage.locator(".forest-panel-image").first().evaluate((image) => image.decode());
    await qaPage.waitForTimeout(3000);
    await qaPage.screenshot({ path: resolve(output, `${name}-hero.png`) });
    findings.push({ check: name, overflow: await qaPage.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    await qaContext.close();
  }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await signIn(mobile);
  await mobilePage.getByRole("button", { name: "Ещё" }).click();
  await mobilePage.locator("#forest-motion-mode-mobile").selectOption("static");
  findings.push({ check: "mobile-motion-menu", mode: await mobilePage.locator(".forest-journey").getAttribute("data-forest-motion"),
    controlVisible: await mobilePage.locator("#forest-motion-mode-mobile").isVisible() });
  await mobilePage.getByRole("button", { name: "Закрыть" }).click();
  await mobilePage.goto(`${appUrl}/#scenarios`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForTimeout(1200);
  findings.push({ check: "direct-hash", scrollY: await mobilePage.evaluate(() => scrollY),
    overflow: await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  await mobile.close();

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const reducedPage = await signIn(reduced);
  findings.push({ check: "reduced-motion", mode: await reducedPage.locator(".forest-journey").getAttribute("data-forest-motion") });
  await reduced.close();

  const failedAsset = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await failedAsset.route("**/assets/forest2d/*.webp", (route) => route.abort());
  const failedPage = await signIn(failedAsset);
  findings.push({ check: "missing-art", headingVisible: await failedPage.locator("h1").isVisible(),
    buttonVisible: await failedPage.getByRole("link", { name: /Начать практику/ }).isVisible() });
  await failedAsset.close();

  const noCanvas = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await noCanvas.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(kind, ...args) {
      return kind === "2d" ? null : original.call(this, kind, ...args);
    };
  });
  const noCanvasPage = await signIn(noCanvas);
  findings.push({ check: "missing-canvas2d", headingVisible: await noCanvasPage.locator("h1").isVisible(),
    buttonVisible: await noCanvasPage.getByRole("link", { name: /Начать практику/ }).isVisible() });
  await noCanvas.close();

  console.log(JSON.stringify(findings, null, 2));
} finally {
  await browser.close();
}
