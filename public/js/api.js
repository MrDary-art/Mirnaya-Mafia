const KEY = "arena.apiBase";

export function apiBase() {
  const saved = localStorage.getItem(KEY);
  if (saved) return saved.replace(/\/$/, "");
  return "";
}

export function setApiBase(url) {
  localStorage.setItem(KEY, url.trim());
}

export async function api(path, options = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.detail = data.detail;
    throw err;
  }
  return data;
}

export function wsUrl() {
  const base = apiBase();
  if (base) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    u.search = "";
    return u.toString();
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}
