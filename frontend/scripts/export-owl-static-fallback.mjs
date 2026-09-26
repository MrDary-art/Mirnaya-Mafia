import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sourceDir = resolve("assets/living-v8-source");
const outputDir = resolve("public/assets");
await mkdir(sourceDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator(".arena-auth-submit").click();
    await page.waitForURL(`${appUrl}/app`, { timeout: 15000 });
    await page.goto(`${appUrl}/app?owl3d=1&owlLab=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__arenaOwlLab?.model), { timeout: 30000 });
    await page.waitForTimeout(3600);
    const canvas = page.locator(".nova-experience canvas");
    const data = await canvas.evaluate((element) => ({
      png: element.toDataURL("image/png").split(",")[1],
      webp: element.toDataURL("image/webp", .87).split(",")[1],
      size: [element.width, element.height],
    }));
    await writeFile(resolve(sourceDir, `owl-rig-static-${name}.png`), Buffer.from(data.png, "base64"));
    await writeFile(resolve(outputDir, `owl-rig-static-${name}.webp`), Buffer.from(data.webp, "base64"));
    console.log(name, data.size);
    await context.close();
  }
} finally {
  await browser.close();
}
