const TOKEN = "arena_token";
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

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

export async function apiAudio(path, pcm) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken() || ""}`,
      "Content-Type": "application/octet-stream",
      "X-Audio-Format": "pcm_s16le",
      "X-Audio-Rate": "16000",
    },
    body: pcm,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Не удалось отправить аудио");
  return data;
}

export async function apiSpeech(path, text) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() || ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Не удалось озвучить ответ");
  }
  return res.blob();
}
