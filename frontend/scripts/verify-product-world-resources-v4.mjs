import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.ARENA_PREVIEW_URL || "http://127.0.0.1:5173";
const executablePath = process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-angle=swiftshader"] });
try {
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const { createProductWorld } = await import("/src/experience/product-world/createProductWorld.js");
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(640, 480);
    const world = createProductWorld(THREE, { placement: "export" });
    world.resize(640, 480);
    const routes = ["/ai", "/setup", "/rooms", "/scenarios", "/history", "/training", "/theory", "/profile", "/people", "/rooms/demo", "/admin"];
    const geometries = [];
    let now = 1000;
    for (let index = 0; index < 20; index += 1) {
      world.update(routes[index % routes.length], "hero", now, false, "full");
      world.render(renderer);
      now += 700;
      world.update(routes[index % routes.length], "hero", now, false, "full");
      world.render(renderer);
      geometries.push(renderer.info.memory.geometries);
    }
    const beforeDispose = renderer.info.memory.geometries;
    world.dispose();
    renderer.render(new THREE.Scene(), new THREE.OrthographicCamera());
    const afterDispose = renderer.info.memory.geometries;
    renderer.dispose();
    return { geometries, beforeDispose, afterDispose };
  });
  assert.ok(result.geometries.slice(10).every((value) => value <= 20), "Geometries should plateau across route changes");
  assert.equal(result.afterDispose, 0, "Product world geometry should be released on dispose");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
