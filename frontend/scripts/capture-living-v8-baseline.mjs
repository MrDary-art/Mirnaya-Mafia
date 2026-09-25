import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("../docs/design/living-world-v8/evidence/baseline");
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Логин").fill("demo");
  await page.getByLabel("Пароль", { exact: true }).fill("demo");
  await page.locator(".arena-auth-submit").click();
  await page.waitForURL(`${appUrl}/`, { timeout: 15000 });
  const results = [];
  for (const [name, section] of [["hero", "hero"], ["waterfall", "scenarios"], ["basin", "rooms"], ["lake", "profile"]]) {
    await page.locator(`[data-home-section="${section}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    results.push(await page.evaluate(({ name, section }) => {
      const panel = document.querySelector(`.forest-panel[data-forest-scene="${section}"]`);
      const image = panel?.querySelector(".forest-panel-image");
      const canvas = document.querySelector(".forest-ambient-canvas");
      const media = panel?.querySelector(".forest-panel-media");
      const rect = image?.getBoundingClientRect();
      const sourceRatio = image?.naturalWidth / image?.naturalHeight;
      const viewRatio = rect?.width / rect?.height;
      return {
        name, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
        source: image?.currentSrc, natural: [image?.naturalWidth, image?.naturalHeight],
        displayed: rect && [rect.width, rect.height],
        crop: sourceRatio && viewRatio ? sourceRatio > viewRatio ? "horizontal" : "vertical" : null,
        canvasBuffer: canvas && [canvas.width, canvas.height],
        transform: media && getComputedStyle(media).transform,
        motion: document.querySelector(".forest-journey")?.dataset.forestMotion,
        quality: "v6 fixed DPR cap; no user quality setting",
      };
    }, { name, section }));
  }
  await page.goto(`${appUrl}/practice`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(output, "work-chat.png") });
  results.push(await page.evaluate(() => {
    const image = document.querySelector(".forest-route-panel .forest-panel-image");
    const canvas = document.querySelector(".forest-ambient-canvas");
    const media = document.querySelector(".forest-route-panel .forest-panel-media");
    return {
      name: "work-chat", viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      source: image?.currentSrc, natural: [image?.naturalWidth, image?.naturalHeight],
      displayed: image && [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
      canvasBuffer: canvas && [canvas.width, canvas.height],
      transform: media && getComputedStyle(media).transform,
      motion: document.querySelector(".forest-route-backdrop")?.dataset.forestMotion,
      quality: "v6 fixed DPR cap; no user quality setting",
    };
  }));
  await writeFile(resolve(output, "measurements.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  await context.close();
} finally {
  await browser.close();
}
