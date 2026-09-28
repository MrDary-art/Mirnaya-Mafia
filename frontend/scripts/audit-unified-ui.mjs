import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "src";
const excluded = ["experience/", "environment2d/", "components/cosmetics/", "pages/cosmetics.css"];
const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = relative(root, path).replaceAll("\\", "/");
    if (excluded.some(prefix => name.startsWith(prefix))) continue;
    if (entry.isDirectory()) await walk(path);
    else if (/\.(css|jsx|html)$/.test(name)) await inspect(path, name);
  }
}

function isCool(hex) {
  const value = hex.length === 3 ? [...hex].map(char => char + char).join("") : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta < .14) return false;
  let hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue * 60) + 360) % 360;
  return hue >= 180 && hue <= 315;
}

async function inspect(path, name) {
  const source = await readFile(path, "utf8");
  if (name.endsWith(".jsx") || name.endsWith(".html")) {
    for (const label of ["ARENA NEGOTIATIONS", "INTELLIGENCE", "CONNECTION", "DECISIONS", "GROWTH", "MEMORY", "COMMUNITY", "IDENTITY", "AI TRAINING", "ERROR TRAINING", "FINAL SCENARIO", "LEVEL BRIEFING"]) {
      if (source.includes(label)) violations.push(`${name}: untranslated UI label ${label}`);
    }
  }
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (/\b(?:from|to|via|bg|text|border|ring|accent)-(?:cyan|sky|blue|teal|indigo|violet|purple)(?:-|\b)/.test(line)) {
      violations.push(`${name}:${index + 1}: legacy utility`);
    }
    if (name.endsWith(".css") || name.endsWith(".jsx")) {
      for (const match of line.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g)) {
        if (isCool(match[1])) violations.push(`${name}:${index + 1}: cool color #${match[1]}`);
      }
      for (const match of line.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/g)) {
        const hex = match.slice(1, 4).map(value => Number(value).toString(16).padStart(2, "0")).join("");
        if (isCool(hex)) violations.push(`${name}:${index + 1}: cool RGB color ${match[0]}`);
      }
    }
  }
}

await walk(root);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log("Core UI: no blue, cyan or violet utility classes, hex or RGB colors.");
