import { useRef, useState } from "react";
import { feedApi } from "./feedApi.js";
import { FeedDialog, FeedError, FeedIcon } from "./FeedPrimitives.jsx";

export default function ReportDialog({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState(false); const lock = useRef(false);
  async function submit(event) { event.preventDefault(); if (lock.current || reason.trim().length < 3) return; lock.current = true; setBusy(true); setError(""); try { await feedApi.report(targetType, targetId, reason.trim()); setSent(true); } catch (failure) { setError(failure.message); } finally { lock.current = false; setBusy(false); } }
  return <FeedDialog title={sent ? "Жалоба отправлена" : "Сообщить о нарушении"} onClose={onClose}>{sent ? <div className="arena-feed-empty"><FeedIcon name="check" size={36} /><p>Модератор проверит материал. Спасибо, что помогаете заботиться о сообществе.</p><button className="arena-feed-button is-primary" onClick={onClose}>Понятно</button></div> : <form className="arena-feed-form" onSubmit={submit}><label>Что произошло?<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} required rows={4} placeholder="Опишите проблему: например, спам, оскорбления или чужие личные данные." /></label><FeedError error={error} /><button className="arena-feed-button is-primary" disabled={busy || reason.trim().length < 3}>{busy ? "Отправляем…" : "Отправить жалобу"}</button></form>}</FeedDialog>;
}
