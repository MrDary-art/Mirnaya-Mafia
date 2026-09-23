const TOKEN = "arena_token";
// In local development Vite proxies /api to the backend on port 8000.
// A deployed environment can still provide an explicit API origin.
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

export async function apiBinary(path, data, { method = "PUT", headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${getToken() || ""}`, "Content-Type": "application/octet-stream", ...headers },
    body: data,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || "Не удалось загрузить данные");
  return payload;
}

export function roomSocket(roomId) {
  const origin = BASE || window.location.origin;
  const url = `${origin.replace(/^http/, "ws")}/api/rooms/${roomId}/ws`;
  return new WebSocket(url, ["arena-room", getToken() || ""]);
}

export async function downloadPrivate(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken() || ""}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Не удалось скачать файл");
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export async function apiStream(path, { body, audio = false, onEvent, signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: audio ? {
      Authorization: `Bearer ${getToken() || ""}`,
      "Content-Type": "application/octet-stream",
      "X-Audio-Format": "pcm_s16le",
      "X-Audio-Rate": "16000",
    } : {
      Authorization: `Bearer ${getToken() || ""}`,
      "Content-Type": "application/json",
    },
    body: audio ? body : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Не удалось отправить сообщение");
  }
  if (!res.body) throw new Error("Браузер не поддерживает потоковый ответ");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  async function consume(line) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.message || "Не удалось получить ответ ИИ");
    if (event.type === "done" || event.type === "silence") completed = true;
    await onEvent?.(event);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) await consume(line);
      if (done) break;
    }
    if (pending) await consume(pending);
    if (!completed) throw new Error("Соединение с ИИ прервалось до завершения ответа");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
