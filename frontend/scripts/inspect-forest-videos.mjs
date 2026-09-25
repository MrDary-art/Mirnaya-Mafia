import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const folder = resolve("../docs/design/forest2d-qa");
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  for (const name of ["ambient-forest-25s.webm", "navigation-and-reverse.webm"]) {
    await page.goto(pathToFileURL(resolve(folder, name)).href);
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
    console.log(`${name}: ${(await page.locator("video").evaluate((video) => video.duration)).toFixed(2)}s`);
  }
} finally {
  await browser.close();
}
