import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const audiences = { PUBLIC: "Открытая", FRIENDS: "Для друзей", FOLLOWERS: "Для подписчиков", ONLY_ME: "Личная", COMPANY_INTERNAL: "Для компании" };
export default function CommunityStories() {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false), live = useRef(true);
  async function load(more = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await api(`/api/admin/social/stories${more && cursor ? `?before_id=${cursor}` : ""}`);
      if (live.current) { setItems(old => more ? [...old, ...result.items] : result.items); setCursor(result.next_cursor); }
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, []);
  async function remove(item) {
    if (lock.current || !window.confirm(`Удалить историю №${item.id} автора «${item.author}»? Она исчезнет также из актуального.`)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api(`/api/admin/social/stories/${item.id}`, { method: "DELETE" });
      if (live.current) { setItems(old => old.filter(row => row.id !== item.id)); setNotice(`История №${item.id} удалена.`); }
      window.dispatchEvent(new Event("arena:social-stories-changed"));
      window.dispatchEvent(new Event("arena:social-highlights-changed"));
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  return <section className="ia-section"><header><h2>Истории сообщества</h2><p>Публикации на месяц (30 дней). Закрытое содержимое и медиа здесь не раскрываются. Удаление также убирает историю из «Актуального» и сохраняется в журнале модерации.</p><button type="button" disabled={busy} onClick={() => load()}>Обновить</button></header>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {items.map(item => <article className="ia-card" key={item.id}><h3>№{item.id} · {item.author}</h3><p>{audiences[item.audience]} · {item.has_media ? "С медиа" : "Текст"}</p><p>Доступна до {new Date(item.expires_at).toLocaleString("ru-RU")}</p><button type="button" disabled={busy} onClick={() => remove(item)}>Удалить историю</button></article>)}
    {!busy && !items.length && !error && <p>Активных историй пока нет.</p>}
    {busy && <p role="status">Загрузка…</p>}{cursor && <button type="button" disabled={busy} onClick={() => load(true)}>Показать ещё</button>}
  </section>;
}
