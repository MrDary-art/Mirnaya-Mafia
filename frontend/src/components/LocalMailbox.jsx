import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import "./local-mailbox.css";

function LetterBody({ text }) {
  return <div className="local-mail-body">{text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    try {
      const url = new URL(part);
      if (url.origin === window.location.origin) return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">{part}</a>;
    } catch { /* Keep the letter's plain text as text. */ }
    return part;
  })}</div>;
}

export default function LocalMailbox() {
  const [letters, setLetters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const data = await api("/api/admin/mail/inbox");
      setLetters(data.items);
      setSelected(current => data.items.some(letter => letter.id === current) ? current : data.items[0]?.id ?? null);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const letter = letters.find(item => item.id === selected);
  return <section className="ia-panel local-mailbox" aria-labelledby="local-mail-title">
    <h2 id="local-mail-title">Локальный почтовый ящик</h2>
    <p>Режим разработки. Письма сохраняются здесь и не отправляются на настоящие адреса. Можно проверить подтверждение почты, вход и восстановление пароля.</p>
    <div className="ia-toolbar"><button type="button" disabled={busy} onClick={load}>{busy ? "Обновляем…" : "Обновить письма"}</button><span role="status">Писем: {letters.length} · последние 100</span></div>
    {error && <p role="alert">{error}</p>}
    {!busy && !error && !letters.length && <p>Пока писем нет. Укажите почту при регистрации или запросите восстановление доступа, затем обновите ящик.</p>}
    {letters.length > 0 && <div className="local-mail-grid">
      <div className="local-mail-list" aria-label="Письма">{letters.map(item => <button key={item.id} type="button" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>
        <strong>{item.subject}</strong><span>{item.recipient}</span><small>{new Date(`${item.created_at}Z`).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</small>
      </button>)}</div>
      {letter && <article className="local-mail-letter"><h3>{letter.subject}</h3><p>Кому: {letter.recipient}</p><LetterBody text={letter.body} /></article>}
    </div>}
  </section>;
}
