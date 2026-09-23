import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appearanceForDesign, appearanceKey, designPresets, defaultAppearance, normalizeAppearance, readableInk, readAppearance } from "../apps/web/src/appearancePreferences.ts";
import { readTheme } from "../apps/web/src/preferences.ts";

test("invalid stored appearance cannot inject CSS or break the background", () => {
  assert.deepEqual(normalizeAppearance(null), defaultAppearance);
  const result = normalizeAppearance({ background:"unknown", animation:"unknown", accentColor:"url(https://invalid.test)", iconColor:"red;display:none", spiralColor:"#aAbb12", speed:Infinity, opacity:-20 });
  assert.equal(result.background,"signature");
  assert.equal(result.animation,"rotate");
  assert.equal(result.accentColor,defaultAppearance.accentColor);
  assert.equal(result.iconColor,defaultAppearance.iconColor);
  assert.equal(result.spiralColor,"#aAbb12");
  assert.equal(result.speed,1);
  assert.equal(result.opacity,0.1);
  assert.equal(readableInk("#000000"),"#ffffff");
  assert.equal(readableInk("#ffffff"),"#17231c");
});

test("presets restore a complete visual system and keep the spiral optional", () => {
  assert.equal(new Set(designPresets.map(preset => preset.accentColor)).size,3);
  for (const preset of designPresets) {
    const appearance = appearanceForDesign(preset.id);
    assert.equal(appearance.design,preset.id);
    assert.equal(appearance.background,"signature");
    assert.deepEqual(normalizeAppearance({design:preset.id}),appearance);
    assert.deepEqual(normalizeAppearance(appearance),appearance);
    assert.equal(normalizeAppearance({...appearance,background:"spiral"}).background,"spiral");
  }
  assert.equal(normalizeAppearance({design:"<script>"}).design,defaultAppearance.design);
});

test("v1 appearance stays intact while a fresh v2 opens the new default", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  try {
    const legacy = JSON.stringify({background:"spiral",accentColor:"#bbff72"});
    const storage = new Map([["arena-appearance-v1",legacy]]);
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:key=>storage.get(key)??null}});
    assert.deepEqual(readAppearance(),defaultAppearance);
    assert.equal(storage.get("arena-appearance-v1"),legacy);
    storage.set(appearanceKey,JSON.stringify(appearanceForDesign("solana")));
    assert.equal(readAppearance().design,"solana");
  } finally {
    if (descriptor) Object.defineProperty(globalThis,"localStorage",descriptor);
    else delete globalThis.localStorage;
  }
});

test("appearance restores from storage and tolerates blocked or damaged storage", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  try {
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:key=>key==="arena-theme"?"dark":JSON.stringify({...defaultAppearance,background:"grid",animation:"still",speed:0.5})}});
    assert.equal(readAppearance().background,"grid");
    assert.equal(readAppearance().animation,"still");
    assert.equal(readAppearance().speed,0.5);
    assert.equal(readTheme(),"dark");
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>"{broken"}});
    assert.deepEqual(readAppearance(),defaultAppearance);
    Object.defineProperty(globalThis,"localStorage",{configurable:true,get(){throw new Error("Storage blocked");}});
    assert.deepEqual(readAppearance(),defaultAppearance);
    assert.equal(readTheme(),"system");
  } finally {
    if (descriptor) Object.defineProperty(globalThis,"localStorage",descriptor);
    else delete globalThis.localStorage;
  }
});

test("locally shipped spiral decodes with web streams and has valid geometry",async () => {
  const bytes = readFileSync(new URL("../apps/web/public/backgrounds/vara/spiral.bin.gz",import.meta.url));
  const buffer = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const header = new DataView(buffer);
  assert.equal(header.getUint32(0,true),0x414e5241);
  assert.equal(header.getUint32(4,true),1);
  const vertices=header.getUint32(8,true),indices=header.getUint32(12,true);
  assert.equal(vertices,155297);
  assert.equal(indices,921600);
  assert.equal(buffer.byteLength,16+vertices*32+indices*4);
  for (const value of new Float32Array(buffer,16,vertices*8)) assert.ok(Number.isFinite(value));
  for (const index of new Uint32Array(buffer,16+vertices*32,indices)) assert.ok(index<vertices);
});
