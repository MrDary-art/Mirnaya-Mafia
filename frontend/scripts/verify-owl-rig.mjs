import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const high = await readFile(resolve("public/assets/owl/owl-rigged-high.glb"));
const length = high.readUInt32LE(12);
const gltf = JSON.parse(high.subarray(20, 20 + length).toString());
const low = await readFile(resolve("public/assets/owl/owl-rigged-low.glb"));
const lowLength = low.readUInt32LE(12);
const lowGltf = JSON.parse(low.subarray(20, 20 + lowLength).toString());
const sculpture = await readFile(resolve("public/assets/owl/owl-sculpture-high.glb"));
const sculptureLength = sculpture.readUInt32LE(12);
const sculptureGltf = JSON.parse(sculpture.subarray(20, 20 + sculptureLength).toString());
const bounds = Object.fromEntries(sculptureGltf.meshes.map((mesh) => [
  mesh.name, sculptureGltf.accessors[mesh.primitives[0].attributes.POSITION],
]));
assert.ok(bounds.OwlBody.min[1] < 0.85, "The owl must retain both feet below the former stump cut");
assert.ok(bounds.TreeStump.max[1] < 1.0, "The stump must not contain the talons");

function rotationSamples(clip, name) {
  const channel = clip.channels.find((item) => gltf.nodes[item.target.node].name === name && item.target.path === "rotation");
  assert.ok(channel, `${clip.name} must animate ${name}`);
  const accessor = gltf.accessors[clip.samplers[channel.sampler].output];
  const view = gltf.bufferViews[accessor.bufferView];
  const binary = new DataView(high.buffer, high.byteOffset);
  const offset = 20 + length + 8 + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({ length: accessor.count }, (_, index) =>
    Array.from({ length: 4 }, (_, axis) => binary.getFloat32(offset + index * 16 + axis * 4, true)));
}

function maximumPoseDifference(samples) {
  const first = samples[0];
  return Math.max(...samples.map((sample) => Math.sqrt(sample.reduce(
    (sum, value, index) => sum + (value - first[index]) ** 2, 0))));
}

assert.equal(gltf.skins?.length, 1);
assert.equal(gltf.skins[0].joints.length, 36);
const skinBones = new Set(gltf.skins[0].joints.map((index) => gltf.nodes[index].name));
for (const name of ["Neck01", "Neck02", "Neck03", "Head", "Eye.L", "Eye.R",
  "Chest", "TailBase", "TailCenter", "Hip.L", "Hip.R", "Knee.L", "Knee.R",
  "Ankle.L", "Ankle.R", "Toe.L", "Toe.R", "Clavicle.L", "Clavicle.R"]) {
  assert.ok(skinBones.has(name), `The exported rig needs ${name}`);
}
assert.ok(gltf.nodes.some((node) => node.name === "Pupil.L"));
assert.ok(gltf.nodes.some((node) => node.name === "Pupil.R"));
assert.deepEqual(gltf.animations.map((clip) => clip.name).sort(), ["Glide", "Idle", "Land", "Takeoff"].sort());
assert.ok(gltf.meshes.find((mesh) => mesh.name === "OwlBody")?.primitives[0].attributes.COLOR_0 !== undefined);
for (const name of ["LidUpper.L", "LidUpper.R", "LidLower.L", "LidLower.R"]) {
  assert.ok(gltf.nodes.some((node) => node.name === name), `Missing ${name}`);
  const node = gltf.nodes.find((item) => item.name === name);
  assert.ok(gltf.meshes[node.mesh]?.primitives[0].targets?.length, `${name} needs a blink morph`);
}
assert.equal(lowGltf.skins[0].joints.length, gltf.skins[0].joints.length);
assert.deepEqual(lowGltf.animations.map((clip) => clip.name), gltf.animations.map((clip) => clip.name));
for (const clip of gltf.animations) {
  const animated = new Set(clip.channels.map((channel) => gltf.nodes[channel.target.node].name));
  assert.ok(animated.has("Wing.L.Upper") && animated.has("Wing.R.Upper"));
  assert.ok(animated.has("Feather.L.01") && animated.has("Feather.R.04"));
}
const takeoff = gltf.animations.find((clip) => clip.name === "Takeoff");
assert.ok(maximumPoseDifference(rotationSamples(takeoff, "Wing.L.Upper")) > 0.3,
  "The exported left wing must complete a visible stroke");
assert.ok(maximumPoseDifference(rotationSamples(takeoff, "Wing.R.Upper")) > 0.3,
  "The exported right wing must complete a visible stroke");
assert.ok(maximumPoseDifference(rotationSamples(takeoff, "Head")) < 0.01,
  "The head must not flap with the wings");
assert.ok(gltf.animations.every((clip) => clip.channels.every(
  (channel) => gltf.nodes[channel.target.node].name !== "TreeStump")),
"The stump must not be animated");

const output = resolve("../docs/design/qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.ARENA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
await context.addInitScript(() => localStorage.setItem("arena_token", "visual-qa"));
await context.route("**/api/**", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(route.request().url().endsWith("/auth/me")
    ? { username: "visual-qa", is_admin: false, level: 1, stars: 0, xp: 0 }
    : { daily_challenge: { minutes: 3, reward: 2 } }),
}));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:5173/app?owlLab=1", { waitUntil: "domcontentloaded" });
  await page.locator(".nova-home-world").waitFor();
  await page.locator(".nova-owl-fallback").waitFor({ state: "detached", timeout: 20000 });
  await page.waitForTimeout(1900);
  await page.evaluate(() => { window.__arenaCanvas = document.querySelector(".nova-experience canvas"); });
  await page.screenshot({ path: resolve(output, "owl-rig-home.png") });
  await page.screenshot({ path: resolve(output, "owl-rig-eye-open.png"), clip: { x: 1120, y: 295, width: 280, height: 170 } });
  await page.evaluate(() => {
    const owl = window.__arenaOwlLab;
    assertOwlLab(owl);
    owl.blinkStarted = performance.now() / 1000 - 10;
    owl.blinkDuration = 20;
    owl.doubleBlinkAt = -Infinity;
    owl.nextBlink = performance.now() / 1000 + 30;
    owl.update(.016, performance.now(), false);
    function assertOwlLab(value) { if (!value) throw new Error("Owl Lab debug hook unavailable"); }
  });
  const lidTravel = await page.evaluate(() => {
    const owl = window.__arenaOwlLab;
    const rigNames = [];
    owl.model.traverse((object) => { if (/Lid|Wing|Feather|Eye|Pupil/.test(object.name)) rigNames.push(object.name); });
    return { lids: owl.lids.map((lid) => ({ name: lid?.name, closure: lid?.morphTargetInfluences?.[0] })), rigNames,
      blinkStarted: owl.blinkStarted, blinkDuration: owl.blinkDuration, now: performance.now() / 1000,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, visibility: document.visibilityState };
  });
  assert.ok(lidTravel.lids.every((lid) => lid.closure > .8), `Lids must close over both eyes: ${JSON.stringify(lidTravel)}`);
  await page.screenshot({ path: resolve(output, "owl-rig-eye-blink.png"), clip: { x: 1120, y: 295, width: 280, height: 170 } });
  await page.screenshot({ path: resolve(output, "owl-rig-blink.png") });
  await page.mouse.move(1400, 240);
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(output, "owl-rig-gaze.png") });
  await page.locator('.nova-rail-links a[href="/app#ai"]').click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: resolve(output, "owl-rig-takeoff-browser.png") });
  await page.waitForTimeout(340);
  await page.screenshot({ path: resolve(output, "owl-rig-flight.png") });
  await page.locator("#ai .nova-button").click();
  await page.locator(".mode-card").first().waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(output, "owl-rig-land.png") });
  const persisted = await page.evaluate(() => window.__arenaCanvas === document.querySelector(".nova-experience canvas"));
  assert.equal(persisted, true);
  const reducedPage = await context.newPage();
  await reducedPage.emulateMedia({ reducedMotion: "reduce" });
  await reducedPage.goto("http://127.0.0.1:5173/app?owlLab=1", { waitUntil: "domcontentloaded" });
  await reducedPage.locator(".nova-home-world").waitFor({ state: "visible", timeout: 20000 });
  await reducedPage.locator(".nova-owl-fallback").waitFor({ state: "detached", timeout: 20000 });
  const reducedWing = await reducedPage.evaluate(() => window.__arenaOwlLab.wings[0].upper.rotation.z);
  assert.ok(reducedWing < -1.2, `Reduced motion must show folded wings: ${reducedWing}`);
  await reducedPage.screenshot({ path: resolve(output, "owl-rig-reduced-motion.png") });
  await reducedPage.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ skinJoints: gltf.skins[0].joints.length, clips: gltf.animations.map((clip) => clip.name), canvasPersisted: persisted, errors }, null, 2));
} finally {
  await browser.close();
}
