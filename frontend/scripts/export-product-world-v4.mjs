import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const output = resolve("public/assets/product-world");
await mkdir(output, { recursive: true });
const appUrl = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
const routes = [
  ["M01", "/ai"], ["M02", "/setup"], ["M03", "/rooms"], ["M04", "/scenarios"],
  ["M05", "/history"], ["M06", "/training"], ["M07", "/theory"], ["M08", "/profile"],
  ["M09", "/people"], ["M10", "/rooms/demo"], ["M11", "/room/export"], ["M12", "/admin"],
];

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  for (const [id, route] of routes) {
    const data = await page.evaluate(async ({ id, route }) => {
      const THREE = await import("/node_modules/.vite/deps/three.js");
      const { createProductWorld } = await import("/src/experience/product-world/createProductWorld.js");
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(900, 650);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const world = createProductWorld(THREE, { placement: "export" });
      world.resize(900, 650);
      const marker = document.createElement("div");
      if (id === "M11") { marker.dataset.roomTeamComplete = "true"; document.body.append(marker); }
      world.update(route, "hero", 1000, false, "full");
      world.update(route, "hero", 1800, false, "full");
      renderer.clear();
      world.render(renderer);
      const url = renderer.domElement.toDataURL("image/png");
      const stats = world.stats();
      marker.remove();
      world.dispose();
      renderer.dispose();
      return { url, stats };
    }, { id, route });
    await writeFile(resolve(output, `${id}.png`), Buffer.from(data.url.split(",")[1], "base64"));
    console.log(JSON.stringify(data.stats));
  }
} finally {
  await browser.close();
}
