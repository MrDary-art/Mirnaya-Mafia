const ARENA_TOUR_TRIGGER_VERSION = "arena-product-tour-after-auth-v1";

function browserSessionStorage() {
  try { return window.sessionStorage; }
  catch { return null; }
}

export function arenaTourTriggerKey(userIdentity) {
  return `${ARENA_TOUR_TRIGGER_VERSION}:${String(userIdentity || "unknown")}`;
}

export function isTourPending(key, storage = browserSessionStorage()) {
  if (!key || !storage) return false;
  try { return storage.getItem(key) === "pending"; }
  catch { return false; }
}

export function markTourPending(key, storage = browserSessionStorage()) {
  if (!key || !storage) return;
  try { storage.setItem(key, "pending"); }
  catch { /* Session storage is optional; the rest of authentication still works. */ }
}

export function clearTourPending(key, storage = browserSessionStorage()) {
  if (!key || !storage) return;
  try { storage.removeItem(key); }
  catch { /* Session storage is optional. */ }
}
