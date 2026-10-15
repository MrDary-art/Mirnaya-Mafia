import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SHOP_OWL_CODES, owlImageForCode } from "./owlAvatars.js";

const legacyCodes = [
  "avatar_argument", "avatar_market", "avatar_alternative", "avatar_trust", "avatar_sales_leader",
  "avatar_master", "avatar_calm", "avatar_trust_master", "avatar_goal_master",
];

test("the shop has fifteen distinct images cropped from the supplied owl sheet", async () => {
  assert.equal(SHOP_OWL_CODES.length, 15);
  assert.equal(new Set(SHOP_OWL_CODES).size, 15);
  const paths = SHOP_OWL_CODES.map(owlImageForCode);
  assert.equal(new Set(paths).size, 15);
  const hashes = await Promise.all(paths.map(async (path) => {
    const image = await readFile(new URL(`../../../public/${path}`, import.meta.url));
    assert.equal(image.toString("ascii", 0, 4), "RIFF");
    assert.equal(image.toString("ascii", 8, 12), "WEBP");
    return createHash("sha256").update(image).digest("hex");
  }));
  assert.equal(new Set(hashes).size, 15);
});

test("every previous avatar code resolves to an owl, including owned legacy items", () => {
  for (const code of [...SHOP_OWL_CODES, ...legacyCodes]) {
    assert.match(owlImageForCode(code), /^avatars\/owls\/owl-(0[1-9]|1[0-5])\.webp$/);
  }
  assert.equal(owlImageForCode("avatar_custom"), owlImageForCode("avatar_analyst"));
});
