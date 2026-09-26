import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/forest2d-qa");
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 900 } } });
const login = await context.newPage();
try {
  await login.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await login.getByLabel("Логин").fill("demo");
  await login.getByLabel("Пароль", { exact: true }).fill("demo");
  await login.locator(".arena-auth-submit").click();
  await login.waitForURL(`${appUrl}/app`, { timeout: 15000 });
  await login.close();

  const page = await context.newPage();
  await page.goto(`${appUrl}/app`, { waitUntil: "domcontentloaded" });
  await page.locator(".forest-journey").waitFor({ state: "visible" });
  await page.locator(".forest-motion-control select").selectOption("full");
  await page.locator(".forest-panel-image").first().evaluate((image) => image.decode());
  await page.waitForTimeout(10500); // One complete leaf-droplet episode.

  async function travel(id, duration) {
    await page.evaluate(async ({ id, duration }) => {
      const section = document.querySelector(`[data-home-section="${id}"]`);
      const target = section.getBoundingClientRect().top + scrollY;
      const start = scrollY;
      const began = performance.now();
      await new Promise((resolveTravel) => {
        function step(now) {
          const t = Math.min(1, (now - began) / duration);
          const ease = t * t * (3 - 2 * t);
          scrollTo(0, start + (target - start) * ease);
          if (t < 1) requestAnimationFrame(step);
          else resolveTravel();
        }
        requestAnimationFrame(step);
      });
    }, { id, duration });
  }

  await travel("scenarios", 3000);
  await page.waitForTimeout(3500); // Waterfall and spray.
  await travel("hero", 3000); // Reverse scroll does not reverse water.
  await page.waitForTimeout(2400);
  await page.close();
  await rename(await page.video().path(), resolve(output, "ambient-forest-25s.webm"));
  console.log("Recorded ambient-forest-25s.webm");
} finally {
  await context.close();
  await browser.close();
}
