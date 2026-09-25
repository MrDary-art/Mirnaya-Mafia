import assert from "node:assert/strict";
import test from "node:test";
import { motifForRoute, PRODUCT_MOTIFS } from "./productWorldState.js";

test("every product route resolves to its intended motif", () => {
  for (const [path, motif] of Object.entries({
    "/ai": "M01", "/ai/job": "M02", "/setup": "M02", "/practice": "M01",
    "/scenarios": "M04", "/play/1": "M04", "/report/1": "M05",
    "/rooms": "M03", "/rooms/demo": "M10", "/room/1": "M03",
    "/training": "M06", "/training/path": "M06", "/training/path/chapter/1": "M06",
    "/training/path/level/1": "M07", "/training/path/attempt/1": "M07",
    "/training/path/attempt/1/report": "M06", "/training/path/attempt/1/review": "M05",
    "/theory": "M07", "/theory/1": "M07", "/learn": "M07", "/learn/1/errors": "M07",
    "/people": "M09", "/people/demo": "M08", "/profile": "M08", "/shop": "M08",
    "/history": "M05", "/admin": "M12", "/missing": "M12",
  })) assert.equal(motifForRoute(path), motif, path);
  assert.equal(motifForRoute("/", "hero"), null);
  assert.equal(motifForRoute("/", "learning"), "M06");
  assert.equal(motifForRoute("/", "finale"), "M10");
  assert.equal(Object.keys(PRODUCT_MOTIFS).length, 12);
});
