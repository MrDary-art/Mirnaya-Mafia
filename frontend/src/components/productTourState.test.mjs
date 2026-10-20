import assert from "node:assert/strict";
import test from "node:test";
import {
  arenaTourTriggerKey,
  clearTourPending,
  isTourPending,
  markTourPending,
} from "./productTourState.js";

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("arena tour pending state is scoped to the authenticated user", () => {
  const storage = fakeStorage();
  const alexKey = arenaTourTriggerKey("alex");
  const mariaKey = arenaTourTriggerKey("maria");

  markTourPending(alexKey, storage);

  assert.equal(isTourPending(alexKey, storage), true);
  assert.equal(isTourPending(mariaKey, storage), false);
});

test("arena tour pending state is cleared after the tour is dismissed", () => {
  const storage = fakeStorage();
  const key = arenaTourTriggerKey("alex");

  markTourPending(key, storage);
  clearTourPending(key, storage);

  assert.equal(isTourPending(key, storage), false);
});
