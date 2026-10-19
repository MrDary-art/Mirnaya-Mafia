import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const palette = ["#022e24", "#1f4d3a", "#4f8f75", "#9fc3b2", "#e7f1ec"];
const allowed = new Set(palette);
const names = { white: "#ffffff", black: "#000000", gray: "#808080", grey: "#808080", red: "#ff0000", blue: "#0000ff", green: "#008000", orange: "#ffa500", yellow: "#ffff00", purple: "#800080", pink: "#ffc0cb", cyan: "#00ffff", navy: "#000080", silver: "#c0c0c0", gold: "#ffd700" };
const extensions = new Set([".css", ".js", ".jsx", ".svg", ".html", ".webmanifest", ".json", ".py"]);
export async function presentationFiles() {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (extensions.has(extname(path)) && !/\.(test|spec)\./.test(path)) files.push(path);
    }
  }
  await walk("frontend/src");
  await walk("frontend/public");
  await walk("backend/app/data/serials");
  return [...files, "frontend/index.html", "frontend/tailwind.config.js", "backend/app/certificate_pdf.py", "backend/app/report_pdf.py", "backend/app/detailed_report_pdf.py", "backend/app/company_models.py", "backend/app/routers/business_demo.py"];
}
export function normalizeHex(value) {
  let hex = value.replace(/^%23/i, "#").toLowerCase();
  if (hex.length === 4 || hex.length === 5) hex = `#${[...hex.slice(1)].map(c => c + c).join("")}`;
  return hex.slice(0, 7);
}
export function colorOccurrences(source) {
  // Preserve offsets and line numbers while ignoring explanatory comments.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\r\n]/g, " "))
    // SVG luminance masks encode visibility; these values never paint a surface.
    .replace(/<mask\b[\s\S]*?<\/mask>/g, mask => mask.replace(/\b(?:fill="white"|stroke="black")/g, value => " ".repeat(value.length)));
  const found = [];
  const add = (match, normalized, kind) => found.push({ value: match[0], normalized, kind, offset: match.index, line: text.slice(0, match.index).split("\n").length });
  for (const match of text.matchAll(/(?:#|%23)(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/gi)) {
    if (/url\([^)]*$/.test(text.slice(Math.max(0, match.index - 60), match.index)) && !match[0].startsWith("%")) continue;
    add(match, normalizeHex(match[0]), "hex");
  }
  for (const match of text.matchAll(/\b0x([\da-f]{6})(?![\da-f])/gi)) add(match, `#${match[1].toLowerCase()}`, "numeric");
  for (const match of text.matchAll(/rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/gi)) {
    const hex = `#${match.slice(1, 4).map(n => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
    add(match, hex, "rgb");
  }
  for (const match of text.matchAll(/--[\w-]*rgb\s*:\s*(\d+)\s+(\d+)\s+(\d+)/gi)) {
    add(match, `#${match.slice(1, 4).map(n => Number(n).toString(16).padStart(2, "0")).join("")}`, "channels");
  }
  for (const match of text.matchAll(/(?:(?:fill|stroke|color|background|fillStyle|strokeStyle)\s*[=:]\s*(?<quote>["'])(?<name>white|black|gray|grey|red|blue|green|orange|yellow|purple|pink|cyan|navy|silver|gold)\k<quote>|:\s*(?<cssName>white|black|gray|grey|red|blue|green|orange|yellow|purple|pink|cyan|navy|silver|gold)(?=[\s;}!])|colors\.(?<pythonName>white|black))/g)) {
    add(match, names[match.groups.name || match.groups.cssName || match.groups.pythonName], "named");
  }
  for (const match of text.matchAll(/\b(?:(?:hsla?|oklch|oklab|lab|lch)\(\s*[-+\d.]|color\(\s*(?:srgb|display-p3))[^;\n]+/g)) add(match, "unresolved", "function");
  return found;
}
export async function inventory({ before = false } = {}) {
  const files = await presentationFiles();
  const records = [];
  const utilities = new Map();
  for (const path of files) {
    const text = before ? await readFile(resolve(root, ".cache/forest-palette-before", path), "utf8").catch(() => readFile(resolve(root, path), "utf8")) : await readFile(resolve(root, path), "utf8");
    records.push(...colorOccurrences(text).map(record => ({ path, ...record })));
    for (const [value] of text.matchAll(/\b(?:text|bg|border|ring|outline|fill|stroke|from|via|to|divide|decoration|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?/g)) utilities.set(value, (utilities.get(value) || 0) + 1);
  }
  return { files: files.length, records, utilities: [...utilities].sort() };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inventory({ before: process.argv.includes("--before-snapshot") });
  const old = result.records.filter(record => !allowed.has(record.normalized));
  if (process.argv.includes("--inventory")) {
    const groups = new Map();
    for (const record of old) {
      const key = record.value;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    const entries = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const report = ["# Цвета до перехода на лесную палитру", "", `Снимок сделан до замены. Проверено файлов: ${result.files}. Вхождений вне новой палитры: ${old.length}. Различных записей цветов: ${entries.length}.`, "", "Включены CSS, inline-стили и графики React, Tailwind, SVG, эффекты canvas, отдельная страница звонка, метаданные браузера, PDF и цветовые настройки по умолчанию. Растровые фотографии, видео, иллюстрации и пользовательские загрузки не являются цветами интерфейса и в этот реестр не входят.", "", "Новая палитра: Deep Forest `#022E24`, Moss Shadow `#1F4D3A`, Eucalyptus `#4F8F75`, Sage Mist `#9FC3B2`, Pale Lichen `#E7F1EC`. Прозрачность этих цветов допустима для границ, теней и подложек.", "", "| Старая запись | Базовый цвет | Вхождений | Места использования |", "|---|---|---:|---|"];
    for (const [value, occurrences] of entries) report.push(`| \`${value.replaceAll("|", "\\|")}\` | \`${occurrences[0].normalized}\` | ${occurrences.length} | ${[...new Set(occurrences.map(r => `${r.path}:${r.line}`))].map(p => `\`${p}\``).join("<br>")} |`);
    report.push("", "## Имена совместимых утилит Tailwind", "", "Эти классы после замены получают только значения из новой палитры через единый конфиг.", "", "| Класс | Вхождений |", "|---|---:|", ...result.utilities.map(([name, count]) => `| \`${name}\` | ${count} |`), "");
    await mkdir(resolve(root, "docs"), { recursive: true });
    await writeFile(resolve(root, "docs/colors-before-forest.md"), report.join("\n"));
    await writeFile(resolve(root, "docs/colors-before-forest.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ files: result.files, oldOccurrences: old.length, uniqueValues: entries.length, report: "docs/colors-before-forest.md", topColors: entries.slice(0, 18).map(([value, list]) => ({ value, count: list.length })) }));
  } else {
    const built = [];
    if (process.argv.includes("--built")) {
      const assets = resolve(root, "frontend/dist/assets");
      for (const file of (await readdir(assets)).filter(name => name.endsWith(".css"))) {
        const source = await readFile(resolve(assets, file), "utf8");
        for (const record of colorOccurrences(source)) {
          if (allowed.has(record.normalized)) continue;
          const transparent = /^(?:#0000|#00000000)$/i.test(record.value) || /^rgba?\([^)]*[,/]\s*0(?:\.0+)?\s*\)/.test(source.slice(record.offset, record.offset + 100));
          if (!transparent) built.push({ path: `frontend/dist/assets/${file}`, ...record });
        }
      }
      const html = await readFile(resolve(root, "frontend/dist/index.html"), "utf8");
      built.push(...colorOccurrences(html).filter(record => !allowed.has(record.normalized)).map(record => ({ path: "frontend/dist/index.html", ...record })));
    }
    console.log(JSON.stringify({ files: result.files, occurrences: result.records.length, outsidePalette: old.length, builtOutsidePalette: built.length, findings: [...old, ...built].slice(0, 60) }, null, 2));
    process.exitCode = old.length || built.length ? 1 : 0;
  }
}
