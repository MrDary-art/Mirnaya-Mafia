import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const phase = process.env.ARENA_QA_PHASE || "after";
const username = process.env.ARENA_QA_USERNAME || "demo";
const password = process.env.ARENA_QA_PASSWORD || "demo";
const output = resolve(`../.cache/unified-ui/${phase}`);
let failures = 0;
const routes = [
  ["home", "/app"], ["ai", "/ai"], ["prepare", "/ai/prepare"],
  ["rooms", "/rooms"], ["scenarios", "/scenarios"], ["setup", "/setup"],
  ["training", "/training"], ["theory", "/theory"], ["path", "/training/path"],
  ["company", "/company"], ["analytics", "/analytics"], ["history", "/history"],
  ["friends", "/people"], ["profile", "/profile"], ["profile-edit", "/profile/edit"],
  ["shop", "/shop"], ["unknown", "/not-a-real-page"],
  ["landing", "/"], ["rooms-demo", "/rooms/demo"],
  ["ai-demo", "/ai/demo"], ["scenario-demo", "/scenarios/demo"],
  ["training-demo", "/training/demo"], ["training-errors", "/training/errors"],
  ["report-example", "/report/example"],
  ["play", "/play/1"], ["report", "/report/1"],
  ["ideal-dialogue", "/report/1/ideal-dialogue"],
  ["room", "/room/2"], ["public-profile", "/people/demo"],
  ["theory-lesson", "/theory/batna"],
  ["login", "/login"], ["register", "/register"], ["admin", "/admin"],
];
const selectedRoutes = process.env.ARENA_QA_ROUTES
  ? routes.filter(([name]) => process.env.ARENA_QA_ROUTES.split(",").includes(name))
  : routes;
const sizes = process.env.ARENA_QA_WIDTH
  ? [[Number(process.env.ARENA_QA_WIDTH), Number(process.env.ARENA_QA_HEIGHT || 900)]]
  : process.env.ARENA_QA_SIZES === "all"
  ? [[360, 740], [375, 667], [390, 844], [412, 915], [430, 932], [432, 936], [768, 1024], [820, 1180], [1024, 768], [1280, 720], [1440, 900], [1920, 1080]]
  : [[390, 844], [1440, 900]];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-webgl"],
});
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const login = await context.request.post(`${base}/api/auth/login`, { data: { username, password } });
    if (!login.ok()) throw new Error(`Demo login: HTTP ${login.status()}`);
    const { access_token } = await login.json();
    await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const [name, path] of selectedRoutes) {
      try {
        await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.locator("main, h1").first().waitFor({ timeout: 15000 });
        await page.locator("h1, [role=alert]").first().waitFor({ timeout: 15000, state: "attached" });
        if (name === "friends") await page.locator(".social-contact").first().waitFor({ timeout: 20000 }).catch(() => {});
        if (name === "company") await page.locator(".company-identity-header, .ui-page-header, [role=alert]").first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: resolve(output, `${name}-${width}.png`), fullPage: false });
        const geometry = await page.evaluate(() => ({
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          heading: document.querySelector("h1")?.textContent?.trim() || "",
          invisibleControls: [...document.querySelectorAll("button, a")].filter(element => {
            if (element.disabled || !element.innerText?.trim() || !element.getClientRects().length) return false;
            const style = getComputedStyle(element);
            return style.backgroundColor.startsWith("rgb(") && style.color === style.backgroundColor;
          }).map(element => element.innerText.trim()),
        }));
        if (geometry.overflow > 1 || geometry.invisibleControls.length || errors.length) failures++;
        console.log(JSON.stringify({ phase, name, width, ...geometry, errors: errors.splice(0) }));
        if (name === "company" && phase === "stress") {
          await page.getByRole("button", { name: "Управление", exact: true }).click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: resolve(output, `company-employees-${width}.png`), fullPage: false });
          const employees = await page.evaluate(() => ({
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            heading: document.querySelector("h2")?.textContent?.trim() || "",
          }));
          if (employees.overflow > 1 || errors.length) failures++;
          console.log(JSON.stringify({ phase, name: "company-employees", width, ...employees, errors: errors.splice(0) }));
        }
        if (name === "friends" && phase === "stress") {
          await page.locator(".social-contact").first().click();
          await page.waitForFunction(() => document.querySelectorAll(".social-message, .chat-message, [data-message-id]").length >= 100, undefined, { timeout: 20000 });
          await page.screenshot({ path: resolve(output, `friend-chat-${width}.png`), fullPage: false });
          const chat = await page.evaluate(() => ({
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            messageCount: document.querySelectorAll(".social-message, .chat-message, [data-message-id]").length,
          }));
          if (chat.overflow > 1 || errors.length) failures++;
          console.log(JSON.stringify({ phase, name: "friend-chat", width, ...chat, errors: errors.splice(0) }));
        }
      } catch (error) {
        failures++;
        console.log(JSON.stringify({ phase, name, width, failed: error.message, errors: errors.splice(0) }));
      }
    }
    if (process.env.ARENA_QA_INTERACTIONS === "1") {
      await page.goto(`${base}/people`);
      await page.locator(".social-contact").first().click();
      const composer = page.getByRole("textbox", { name: "Сообщение", exact: true });
      await composer.fill("Проверка поля ввода");
      await page.waitForFunction(() => !document.querySelector(".social-composer button").disabled);
      const before = await composer.boundingBox();
      await page.locator(".social-messages").evaluate(element => { element.scrollTop = 0; });
      const after = await composer.boundingBox();
      if (!before || !after || Math.abs(before.y - after.y) > 1) throw new Error("Composer moved with messages");
      await composer.clear();
      await page.goto(`${base}/profile`);
      await page.getByRole("button", { name: "Редактировать", exact: true }).click();
      await page.getByRole("textbox", { name: "Никнейм", exact: true }).waitFor();
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await page.goto(`${base}/shop`);
      await page.getByRole("button", { name: "Рамки", exact: true }).click();
      if (await page.getByRole("button", { name: "Рамки", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("Shop filter did not activate");
      await page.goto(`${base}/history`);
      await page.getByRole("button", { name: "Встречи 1×1", exact: true }).click();
      if (await page.getByRole("button", { name: "Встречи 1×1", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("History filter did not activate");
      const cancellation = await page.evaluate(async () => {
        const original = window.fetch;
        const { apiStream } = await import("/src/api.js");
        window.fetch = () => Promise.reject(new DOMException("Cancelled", "AbortError"));
        try { await apiStream("/_qa_cancel", { body: {} }); return false; }
        catch (error) { return error.name === "AbortError"; }
        finally { window.fetch = original; }
      });
      if (!cancellation) throw new Error("Intentional cancellation lost its AbortError");
      if (errors.length) throw new Error(errors.join("; "));
      console.log(JSON.stringify({ phase, name: "interactions", width, passed: true, checks: ["chat-input", "fixed-composer", "profile-editor", "shop-tabs", "history-filters", "request-cancellation"] }));
    }
    if (process.env.ARENA_QA_ERROR_MATRIX === "1" && width === 390) {
      for (const code of [400, 403, 404, 409, 500, "network"]) {
        const handler = route => code === "network"
          ? route.abort("failed")
          : route.fulfill({ status: code, contentType: "application/json", body: "{}" });
        await page.route("**/api/company/context*", handler);
        await page.goto(`${base}/company`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Повторить загрузку" }).waitFor({ timeout: 12000 });
        const state = await page.evaluate(() => ({
          message: document.querySelector("[role=alert]")?.textContent?.trim(),
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        }));
        await page.screenshot({ path: resolve(output, `error-${code}-${width}.png`) });
        console.log(JSON.stringify({ phase, name: `error-${code}`, width, ...state, errors: errors.splice(0) }));
        await page.unroute("**/api/company/context*", handler);
      }
      await page.getByRole("button", { name: "Повторить загрузку" }).click();
      await page.getByRole("heading", { name: /Академия/ }).waitFor({ timeout: 12000 });
      console.log(JSON.stringify({ phase, name: "error-recovery", width, recovered: true, errors: errors.splice(0) }));
      await page.addInitScript(() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, options) => String(input).includes("/api/company/context")
          ? Promise.reject(new DOMException("timeout", "TimeoutError"))
          : originalFetch(input, options);
      });
      await page.goto(`${base}/company`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Повторить загрузку" }).waitFor({ timeout: 12000 });
      const timeoutText = await page.locator("[role=alert]").textContent();
      await page.screenshot({ path: resolve(output, `error-timeout-${width}.png`) });
      console.log(JSON.stringify({ phase, name: "error-timeout", width, message: timeoutText?.trim(), errors: errors.splice(0) }));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures) throw new Error(`${failures} page checks failed; inspect the screenshot report.`);
