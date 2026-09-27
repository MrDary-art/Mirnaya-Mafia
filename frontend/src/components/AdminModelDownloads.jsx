import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function AdminModelDownloads() {
  const [state, setState] = useState(null), [error, setError] = useState(""), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, timer;
    async function load() {
      try {
        const value = await api("/api/admin/models");
        if (!active) return;
        setState(value);
        if (value.download.status === "downloading") timer = setTimeout(load, 2000);
      } catch (e) { if (active) setError(e.message); }
    }
    load(); return () => { active = false; clearTimeout(timer); };
  }, [revision]);
  async function download(name) {
    setError(""); setBusy(true);
    try { await api(`/api/admin/models/${name}/download`, { method: "POST" }); setRevision(n => n + 1); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="ia-panel"><h2>Файлы речи</h2><p>Загрузка не переключает модель. После проверки файлов выберите её в настройках распознавания.</p>{error && <p role="alert">{error}</p>}{state ? <><div className="ia-table"><table><thead><tr><th>Модель</th><th>Размер</th><th>Файлы</th><th /></tr></thead><tbody>{state.items.map(item => <tr key={item.name}><td>{item.name === "piper" ? "Дмитрий · Piper" : `Whisper ${item.name}`}</td><td>{Math.ceil(item.bytes / 1024 / 1024)} МБ</td><td>{item.present ? "Загружены" : "Нужно скачать"}{state.loaded === item.name ? " · используется" : ""}</td><td><button disabled={busy || state.download.status === "downloading"} onClick={() => download(item.name)}>{item.present ? "Проверить файлы" : "Скачать"}</button></td></tr>)}</tbody></table></div>{state.download.status !== "idle" && <p role="status">{state.download.error || state.download.progress}</p>}</> : <p>Загружаем список…</p>}</section>;
}
