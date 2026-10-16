import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { FeedAvatar, FeedDialog, FeedError, FeedIcon, nameOf } from "./FeedPrimitives.jsx";

export function ScenarioChallengeButton({ content }) {
  const [open, setOpen] = useState(false);
  if (!content || content.kind !== "SCENARIO" || !content.available) return null;
  return <div className="arena-feed-challenge-entry"><button type="button" onClick={() => setOpen(true)}><FeedIcon name="follow" size={17} />Сможешь лучше?</button>{open && <ChallengeDialog scenario={content} onClose={() => setOpen(false)} />}</div>;
}

export default function ChallengeDialog({ scenario, onClose }) {
  const [friends, setFriends] = useState([]);
  const [recipient, setRecipient] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    api("/api/social/friends").then((items) => { if (!cancelled) setFriends(items.filter((person) => person.relationship === "FRIENDS")); }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !recipient) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api("/api/social/challenges", { method: "POST", body: { receiver_id: Number(recipient), scenario_id: String(scenario.id) } });
      setNotice("Вызов отправлен. Друг увидит его в сообщениях и уведомлениях.");
      window.dispatchEvent(new Event("arena:notifications-changed"));
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  const filtered = friends.filter((person) => `${nameOf(person)} ${person.username}`.toLocaleLowerCase("ru-RU").includes(search.toLocaleLowerCase("ru-RU")));
  return <FeedDialog title="Сможешь лучше?" subtitle={scenario.title} onClose={onClose}>
    <form className="arena-feed-form arena-feed-challenge-form" onSubmit={submit}>
      <p className="arena-feed-muted">Выберите друга. Он получит приглашение пройти тот же сценарий; сравнение будет доступно только для совместимых результатов.</p>
      <FeedError error={error} retry={!busy ? () => setRetry((value) => value + 1) : undefined} />
      {notice ? <><p className="arena-feed-notice" role="status"><FeedIcon name="check" size={18} />{notice}</p><button type="button" className="arena-feed-button is-primary" onClick={onClose}>Готово</button></> : <>
        <label>Найти друга<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или никнейм" /></label>
        {loading ? <p role="status">Загружаем друзей…</p> : <div className="arena-feed-recipient-list" role="radiogroup" aria-label="Друг для вызова">{filtered.map((person) => <label key={person.id} className={String(person.id) === recipient ? "is-selected" : ""}><input type="radio" name="challenge-recipient" value={person.id} checked={String(person.id) === recipient} onChange={(event) => setRecipient(event.target.value)} disabled={busy} required /><FeedAvatar author={person} /><span>{nameOf(person)}</span>{String(person.id) === recipient && <FeedIcon name="check" size={18} />}</label>)}{!filtered.length && <p className="arena-feed-muted">{friends.length ? "По этому имени никого не нашли." : "Сначала добавьте друга в разделе «Друзья»."}</p>}</div>}
        <button className="arena-feed-button is-primary" disabled={busy || loading || !recipient}>{busy ? "Отправляем…" : "Отправить вызов"}<FeedIcon name="send" size={18} /></button>
      </>}
    </form>
  </FeedDialog>;
}
