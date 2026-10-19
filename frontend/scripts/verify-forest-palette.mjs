import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const phase = process.env.ARENA_PALETTE_PHASE || "initial";
const output = resolve(`../.cache/forest-palette/${phase}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ARENA_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-webgl"] });
const results = [];
const selected = process.env.ARENA_PALETTE_ROUTES?.split(",");

// Conservative text audit of solid CSS surfaces. Image and gradient compositions
// are recorded for visual review instead of guessing the pixels behind text.
async function inspect(page, label, width) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.locator("h1, h2, [role=alert], .scenario-card h2, .arena-auth").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v); };
    const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
    const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const findings = new Map(); let checked = 0, imageText = 0;
    function check(element, style, text, suffix = "") {
      if (!text.trim() || element.closest("[disabled], [aria-disabled=true], [hidden], [inert]")) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1 || style.visibility !== "visible" || style.display === "none") return;
      const chain = []; let opacity = 1;
      for (let node = element; node; node = node.parentElement) { const s = getComputedStyle(node); opacity *= Number(s.opacity); chain.unshift(s); }
      if (opacity < .65) return;
      let bg = [231, 241, 236, 1], image = false;
      const darkWorld = document.querySelector(".forest-route-backdrop");
      const forestOpacity = darkWorld ? Number(getComputedStyle(darkWorld).opacity) : 1;
      const nodes = []; for (let node = element; node; node = node.parentElement) nodes.unshift(node);
      for (const [index, s] of chain.entries()) {
        if (darkWorld && nodes[index].classList.contains("product-page")) {
          // A translucent forest on paper stays a light surface. Use its darkest
          // possible palette-backed pixel rather than treating it as a dark photo.
          bg = forestOpacity <= .3 ? over([2, 46, 36, forestOpacity], [231, 241, 236, 1]) : [2, 46, 36, 1];
          image = forestOpacity > .3;
        }
        const color = rgba(s.backgroundColor);
        if (color[3] >= .99) image = false;
        bg = over(color, bg);
        if (s.backgroundImage !== "none") image = true;
        const pseudo = getComputedStyle(nodes[index], "::before");
        if (pseudo.content !== "none" && pseudo.position === "absolute" && [pseudo.top, pseudo.right, pseudo.bottom, pseudo.left].every(v => v === "0px")) {
          const p = rgba(pseudo.backgroundColor); p[3] *= Number(pseudo.opacity); bg = over(p, bg);
          if (pseudo.backgroundImage !== "none") image = true;
        }
      }
      if (image || element.closest(".gateway-hero, .gateway-how, .business-stage-hero, .lab-scene, .nova-home-hub-intro")) { imageText++; return; }
      const fgRaw = rgba(element instanceof SVGElement && !suffix ? style.fill : style.color);
      if (fgRaw[3] < .15) return;
      const fg = over(fgRaw, bg);
      const minimum = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      const value = ratio(fg, bg); checked++;
      if (value + .05 >= minimum) return;
      const selector = element.tagName.toLowerCase() + (element.id ? `#${element.id}` : [...element.classList].slice(0, 4).map(c => `.${c}`).join("")) + suffix;
      const key = `${selector}|${style.color}|${bg.slice(0, 3).map(Math.round).join(",")}`;
      if (!findings.has(key)) findings.set(key, { selector, text: text.trim().slice(0, 95), color: style.color, background: bg.slice(0, 3).map(Math.round), ratio: Number(value.toFixed(2)), minimum });
    }
    for (const element of document.querySelectorAll("body *")) {
      const text = [...element.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join("");
      const style = getComputedStyle(element);
      check(element, style, text);
      if (element.matches("input, textarea") && !element.value && element.placeholder) check(element, getComputedStyle(element, "::placeholder"), element.placeholder, "::placeholder");
    }
    return { overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), checked, imageText, findings: [...findings.values()] };
  });
  await page.screenshot({ path: resolve(output, `${label}-${width}.png`), fullPage: false });
  results.push({ label, width, url: new URL(page.url()).pathname, ...result });
  console.log(JSON.stringify({ label, width, checked: result.checked, contrast: result.findings.length, overflow: result.overflow }));
}
async function visit(page, label, path, width) {
  if (selected && !selected.includes(label)) return;
  try { await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 }); await inspect(page, label, width); }
  catch (error) { results.push({ label, width, error: error.message }); console.log(JSON.stringify({ label, width, error: error.message.slice(0, 150) })); }
}
const personal = ["app", "feed", "saved", "stories", "stories/new", "scenarios", "setup", "ai", "ai/prepare", "ai/guide", "training/path", "training/errors", "theory", "theory/batna", "rooms", "council", "analytics", "profile", "people", "people/demo", "shop", "support", "lab", "lab/red-zone", "lab/echo", "serials", "report/example", "report/1", "play/1", "not-a-real-page"];
const publicPaths = ["/", "/business", "/business/login", "/business/register", "/forgot-password", "/demo/council", "/demo/rooms", "/report/example", "/council-call/index.html"];
const admin = ["/admin", "/admin/analytics", "/admin/settings", "/admin/companies", "/admin/operations", "/admin/council"];
const business = ["overview", "episodes", "learning", "meetings", "team", "analytics", "calendar", "profile", "settings", "learning/scenarios", "learning/ai", "learning/serials"];
try {
  for (const width of [1440, 390]) {
    const publicContext = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const publicPage = await publicContext.newPage();
    for (const path of publicPaths) await visit(publicPage, `public-${path.replaceAll("/", "-") || "home"}`, path, width);
    if (!selected || selected.includes("entry-dialog")) {
      await publicPage.goto(base);
      await publicPage.locator(".gateway-header .gateway-start").click();
      await inspect(publicPage, "entry-dialog", width);
    }
    await publicContext.close();
    for (const [role, username, password, paths] of [["personal", "demo", "demo", personal.map(p => `/${p}`)], ["admin", "admin", "admin", admin], ["business", "hierarchy_owner", "company-demo", business]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const login = await context.request.post(`${base}/api/auth/login`, { data: { username, password } });
      if (!login.ok()) { results.push({ role, width, error: `Login HTTP ${login.status()}` }); await context.close(); continue; }
      const { access_token } = await login.json();
      await context.addInitScript(token => localStorage.setItem("arena_token", token), access_token);
      const page = await context.newPage();
      page.on("pageerror", error => results.push({ role, width, runtimeError: error.message }));
      let companyId;
      if (role === "business") {
        await page.goto(`${base}/business/continue`);
        await page.waitForURL(/\/business\/\d+/, { timeout: 10000 });
        companyId = new URL(page.url()).pathname.split("/")[2];
      }
      for (const path of paths) await visit(page, `${role}-${path.replaceAll("/", "-")}`, companyId ? `/business/${companyId}/${path}` : path, width);
      await context.close();
    }
  }
} finally { await browser.close(); await writeFile(resolve(output, "audit.json"), JSON.stringify(results, null, 2)); }
console.log(JSON.stringify({ captures: results.length, contrastFindings: results.reduce((n, r) => n + (r.findings?.length || 0), 0), errors: results.filter(r => r.error || r.runtimeError).length, report: resolve(output, "audit.json") }));
process.exitCode = results.some(r => r.error || r.runtimeError || r.overflow > 1 || r.findings?.length) ? 1 : 0;
