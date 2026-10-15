import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FANTASY_FRAME_CODES, frameImageForCode } from "./frameAssets.js";

test("all thirteen shop frames use distinct supplied fantasy artwork", async () => {
  assert.equal(FANTASY_FRAME_CODES.length, 13);
  assert.equal(new Set(FANTASY_FRAME_CODES).size, 13);
  const paths = FANTASY_FRAME_CODES.map(frameImageForCode);
  assert.equal(new Set(paths).size, 13);
  const hashes = await Promise.all(paths.map(async (path) => {
    const image = await readFile(new URL(`../../../public/${path}`, import.meta.url));
    assert.equal(image.toString("ascii", 0, 4), "RIFF");
    assert.equal(image.toString("ascii", 8, 12), "WEBP");
    return createHash("sha256").update(image).digest("hex");
  }));
  assert.equal(new Set(hashes).size, 13);
});

test("unknown or missing frame codes fall back to the default frame", () => {
  assert.equal(frameImageForCode(), frameImageForCode("frame_classic"));
  assert.equal(frameImageForCode("old_unknown_frame"), frameImageForCode("frame_classic"));
});
