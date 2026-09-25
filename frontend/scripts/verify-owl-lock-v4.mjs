import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";

const root = resolve("..");
const lock = JSON.parse(await readFile(resolve(root, "docs/design/design-pass-v4/owl-lock.json"), "utf8"));
const changed = [];
for (const [name, expected] of Object.entries(lock.protected)) {
  const path = isAbsolute(name) ? name : resolve(root, name);
  const actual = createHash("sha256").update(await readFile(path)).digest("hex");
  if (actual !== expected) changed.push({ name, expected, actual, allowedBridge: name === "frontend/src/experience/ExperienceCanvas.jsx" });
}
const unexpected = changed.filter((item) => !item.allowedBridge);
console.log(JSON.stringify({ checked: Object.keys(lock.protected).length, changed, unexpected: unexpected.length }, null, 2));
if (unexpected.length) process.exitCode = 1;
