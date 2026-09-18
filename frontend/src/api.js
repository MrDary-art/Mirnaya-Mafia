const TOKEN = "arena_token";
const BASE = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://127.0.0.1:8001" : "")).replace(/\/$/, "");

export function getToken() {
  return localStorage.getItem(TOKEN);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN, t);
  else localStorage.removeItem(TOKEN);
}

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.message || res.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}
