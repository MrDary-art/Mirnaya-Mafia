import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { storyApi } from "../../../api.js";
import { useAuth } from "../../../auth.jsx";
import { StoryArtwork, StoryAuthor, StoryAvatar, StoryDialog, StoryError, StoryIcon, StoryMetrics, STORY_STATUS, displayName, formatCount } from "./StoryPrimitives.jsx";

function Comments({ story, onClose, onCountChange }) {
  const [items, setItems] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const lock = useRef(false);
  const alive = useRef(true);
  async function load(offset = 0) {
    setLoading(true); setError("");
    try {
      const result = await storyApi.comments(story.id, { offset, limit: 20 });
      if (!alive.current) return;
      setItems((current) => offset ? [...current, ...result.items.filter((item) => !current.some((old) => old.id === item.id))] : result.items);
      setNextOffset(result.next_offset);
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [story.id]);
  async function send(event) {
    event.preventDefault();
    if (!text.trim() || lock.current || loading) return;
    lock.current = true; setSending(true); setError("");
    try {
      const result = await storyApi.comment(story.id, text.trim());
      setItems((current) => [result, ...current]); setText(""); onCountChange(1);
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setSending(false); }
  }
  async function remove(id) {
    if (lock.current || loading) return;
    lock.current = true; setDeleting(id); setError("");
    try { await storyApi.deleteComment(id); setItems((current) => current.filter((item) => item.id !== id)); onCountChange(-1); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setDeleting(null); }
  }
  return <StoryDialog title="Другая точка зрения" subtitle={story.title} onClose={onClose}>
    <div className="stories-dialog-body"><p className="stories-discussion-note">Как бы вы поступили? Обсуждаем решения, бережно относимся к людям.</p><StoryError error={error} onRetry={!sending && !deleting ? () => load() : undefined} />
      <div className="stories-comments" aria-live="polite">{loading && !items.length && <p className="stories-muted" role="status">Загружаем обсуждение…</p>}{!loading && !error && !items.length && <div className="stories-comments-empty"><StoryIcon name="comment" size={36} /><h3>У разговора ещё нет продолжения.</h3><p>Ваша точка зрения может стать первой.</p></div>}
        {items.map((comment) => <article className="stories-comment" key={comment.id}><StoryAvatar author={comment.author} /><div><header><b>{displayName(comment.author)}</b><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</time></header><p>{comment.text}</p>{comment.can_delete && <button type="button" disabled={loading || sending || deleting !== null} onClick={() => remove(comment.id)}>{deleting === comment.id ? "Удаляем…" : "Удалить"}</button>}</div></article>)}
        {nextOffset !== null && <button type="button" className="stories-button stories-button-secondary" onClick={() => load(nextOffset)} disabled={loading || sending || deleting !== null}>{loading ? "Загружаем…" : "Ещё комментарии"}</button>}
      </div>
      <form className="stories-comment-form" onSubmit={send}><label htmlFor={`comment-${story.id}`}>Ваша точка зрения</label><textarea id={`comment-${story.id}`} value={text} onChange={(event) => setText(event.target.value)} placeholder="Что в этой ситуации осталось за кадром?" maxLength={1000} rows={3} required /><div><span>{text.length} / 1000</span><button className="stories-button stories-button-primary" disabled={loading || sending || deleting !== null || !text.trim()}>{sending ? "Отправляем…" : "Ответить"}<StoryIcon name="arrow" size={18} /></button></div></form>
    </div>
  </StoryDialog>;
}

function ReportDialog({ story, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (lock.current || !reason.trim()) return;
    lock.current = true; setBusy(true); setError("");
    try { await storyApi.report(story.id, reason.trim()); setSent(true); }
    catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <StoryDialog title={sent ? "Редакция получила сигнал" : "Сообщить о проблеме"} onClose={onClose}><div className="stories-dialog-body">{sent ? <div className="stories-report-success"><StoryIcon name="check" size={38} /><p>Модератор проверит эту историю. Спасибо, что помогаете сохранять пространство для уважительного разговора.</p><button className="stories-button stories-button-primary" onClick={onClose}>Понятно</button></div> : <form className="stories-form" onSubmit={submit}><p className="stories-muted">Расскажите, что не так с историей «{story.title}».</p><label>Причина<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} minLength={3} required rows={4} placeholder="Например: личные данные, оскорбления, небезопасный совет" /></label><StoryError error={error} /><button className="stories-button stories-button-primary" disabled={busy || reason.trim().length < 3}>{busy ? "Отправляем…" : "Отправить модератору"}</button></form>}</div></StoryDialog>;
}

export default function StoryCard({ story, index, isActive, initialAttempt, hasDetails = false, onUpdate, onFollow, onCompleted, onStarted, onCommentsChange }) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(initialAttempt || null);
  const [roleId, setRoleId] = useState(initialAttempt?.role_id || story.roles?.[0]?.id || "");
  const [hydrated, setHydrated] = useState(hasDetails);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const locks = useRef(new Set());
  const mounted = useRef(true);
  const callback = useRef({ onUpdate }); callback.current = { onUpdate };
  const selectable = story.status === "published";
  const editable = ["draft", "rejected"].includes(story.status);
  const own = user?.id != null && story.author?.id === user.id;
  const latest = attempt?.history?.at(-1);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!isActive || hydrated || !selectable) return undefined;
    let cancelled = false;
    setLoading(true); setError("");
    storyApi.get(story.id).then((result) => {
      if (cancelled) return;
      setAttempt(result.attempt); if (result.attempt) setRoleId(result.attempt.role_id);
      callback.current.onUpdate(result.story); setHydrated(true);
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [story.id, isActive, hydrated, selectable]);

  async function action(key, task) {
    if (locks.current.has(key)) return;
    locks.current.add(key); setPending((value) => ({ ...value, [key]: true })); setError(""); setNotice("");
    try { await task(); }
    catch (failure) { if (mounted.current) setError(failure.message || "Не получилось выполнить действие. Попробуйте ещё раз."); }
    finally { locks.current.delete(key); if (mounted.current) setPending((value) => ({ ...value, [key]: false })); }
  }
  function start() {
    action("play", async () => {
      const result = await storyApi.start(story.id, roleId);
      setAttempt(result); setHydrated(true); onStarted?.();
    });
  }
  function choose(optionId) {
    if (!attempt?.node || attempt.status !== "active") return;
    action("play", async () => {
      try {
        const result = await storyApi.choose(attempt.id, { node_id: attempt.node.id, option_id: optionId, revision: attempt.revision });
        setAttempt(result);
        if (result.status === "finished") onCompleted?.();
      } catch (failure) {
        // Another tab may already have advanced this attempt. Restore the server state.
        try { setAttempt(await storyApi.attempt(attempt.id)); } catch {}
        throw failure;
      }
    });
  }
  function follow() {
    action("follow", async () => {
      const result = await storyApi.follow(story.author.id, !story.author.following);
      onFollow(story.author.id, result.following);
    });
  }
  function share() {
    action("share", async () => {
      const url = `${window.location.origin}/stories/${story.id}`;
      try { if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable"); await navigator.clipboard.writeText(url); setNotice("Ссылка на историю скопирована"); }
      catch { setModal("share"); }
    });
  }
  const currentRole = story.roles?.find((role) => role.id === (attempt?.role_id || roleId));
  return <article className={`stories-card${attempt ? " stories-card-playing" : ""}${isActive ? " stories-card-active" : ""}`} data-story-id={story.id} aria-label={story.title} tabIndex={-1}>
    <header className="stories-card-author"><StoryAuthor author={story.author}>{story.author?.id != null && !own && <button type="button" className={`stories-follow${story.author.following ? " is-following" : ""}`} onClick={follow} disabled={pending.follow || loading || !hydrated} aria-pressed={story.author.following}>{pending.follow ? "…" : story.author.following ? "Вы подписаны" : "Подписаться"}</button>}</StoryAuthor>{!selectable && <span className={`stories-status stories-status-${story.status}`}>{STORY_STATUS[story.status]}</span>}</header>
    <StoryArtwork story={story} compact={Boolean(attempt)} number={index + 1} />
    <div className="stories-card-content">
      {!attempt && <><p className="stories-hook">{story.hook}</p>{selectable ? <><fieldset className="stories-roles" disabled={Boolean(pending.play || loading)}><legend>{story.roles?.length > 1 ? "На чьей стороне вы сегодня?" : "Ваша роль в этой истории"}</legend><div>{story.roles?.map((role) => <label key={role.id} className={roleId === role.id ? "is-selected" : ""}><input type="radio" name={`role-${story.id}`} value={role.id} checked={roleId === role.id} onChange={() => setRoleId(role.id)} /><StoryIcon name={roleId === role.id ? "check" : "branch"} size={17} /><span>{role.label}</span></label>)}</div></fieldset><p className="stories-role-brief">{currentRole?.brief}</p><button type="button" className="stories-button stories-button-primary stories-enter" disabled={Boolean(pending.play || loading || !roleId)} onClick={start}><span>{loading ? "Восстанавливаем историю…" : pending.play ? "Открываем разговор…" : "Войти в историю"}</span><StoryIcon name="arrow" /></button></> : <div className="stories-draft-actions">{story.moderation_note && <p className="stories-review-note">Комментарий редакции: {story.moderation_note}</p>}<p className="stories-muted">{story.status === "pending" ? "Редакция проверяет историю. После публикации она появится в общей ленте." : story.status === "hidden" ? "История скрыта редакцией и недоступна в общей ленте." : "Дайте каждой реплике своё продолжение и отправьте историю на проверку."}</p>{editable && <Link className="stories-button stories-button-primary" to={`/stories/${story.id}/edit`}>Продолжить работу <StoryIcon name="edit" size={18} /></Link>}</div>}</>}
      {attempt && <div className="stories-play" aria-busy={Boolean(pending.play)}>
        <div className="stories-play-meta"><span><i /> {currentRole?.label || "Ваша роль"}</span><span>{attempt.status === "finished" ? "История прожита" : `Ход ${(attempt.history?.length || 0) + 1}`}</span></div>
        <StoryMetrics metrics={attempt.metrics} delta={latest?.delta} />
        {latest && <div className="stories-feedback" aria-live="polite"><span className="stories-eyebrow">ВАШ ВЫБОР ИМЕЕТ ЗНАЧЕНИЕ</span>{latest.choice && <p className="stories-your-choice">«{typeof latest.choice === "string" ? latest.choice : latest.choice.text}»</p>}{latest.explanation && <p>{latest.explanation}</p>}</div>}
        {attempt.status === "active" && attempt.node && <><div className="stories-dialogue"><span>{attempt.node.speaker}</span><p>{attempt.node.text}</p></div><div className="stories-options" aria-label="Выберите ответ">{attempt.node.options.map((option, optionIndex) => <button key={`${attempt.node.id}-${option.id}`} type="button" onClick={() => choose(option.id)} disabled={pending.play}><span className="stories-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option.text}</span><StoryIcon name="arrow" size={17} /></button>)}</div>{pending.play && <p className="stories-inline-loading" role="status">Собеседник отвечает…</p>}</>}
        {attempt.status === "finished" && attempt.ending && <section className="stories-ending" aria-live="polite"><span className="stories-eyebrow">ВАША ВЕТКА ИСТОРИИ</span><h3>{attempt.ending.title}</h3><p>{attempt.ending.text}</p><div className="stories-lesson"><StoryIcon name="branch" size={21} /><div><b>Что взять в следующий разговор</b><p>{attempt.ending.lesson}</p></div></div><p className="stories-session-note">Показатели описывают решения в этой попытке, а не личность.</p><div className="stories-replay"><label>Посмотреть с другой стороны<select value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={pending.play}>{story.roles?.map((role) => <option value={role.id} key={role.id}>{role.label}</option>)}</select></label><button type="button" className="stories-button stories-button-secondary" onClick={start} disabled={pending.play}><StoryIcon name="retry" size={17} />{pending.play ? "Начинаем…" : "Переиграть"}</button></div><button type="button" className="stories-discuss-link" onClick={() => setModal("comments")}>А что думают другие? Обсудить <StoryIcon name="comment" size={17} /></button></section>}
        {(attempt.history?.length || 0) > 1 && <details className="stories-history"><summary>Путь к этому решению · {attempt.history.length} хода</summary>{attempt.history.map((entry, entryIndex) => <div key={entryIndex}><b>{entry.speaker}</b><p>{entry.text}</p><p className="stories-your-choice">Вы: {typeof entry.choice === "string" ? entry.choice : entry.choice?.text}</p><small>{entry.explanation}</small></div>)}</details>}
      </div>}
      <StoryError error={error} onRetry={!hydrated && selectable && !loading ? () => action("reload", async () => { const data = await storyApi.get(story.id); setAttempt(data.attempt); onUpdate(data.story); setHydrated(true); }) : undefined} />
    </div>
    {selectable && <footer className="stories-social"><div><button type="button" aria-label={`${story.liked ? "Убрать отметку нравится" : "Нравится"}: ${story.counts?.likes || 0}`} aria-pressed={story.liked} disabled={pending.like || loading || !hydrated} className={story.liked ? "is-liked" : ""} onClick={() => action("like", async () => onUpdate(await storyApi.like(story.id, !story.liked), "like"))}><StoryIcon name="heart" filled={story.liked} /><span>{formatCount(story.counts?.likes)}</span></button><button type="button" aria-label={`Обсудить: ${story.counts?.comments || 0} комментариев`} onClick={() => setModal("comments")}><StoryIcon name="comment" /><span>{formatCount(story.counts?.comments)}</span></button><span className="stories-plays" title="Начатые прохождения"><StoryIcon name="play" size={15} /><span>{formatCount(story.counts?.plays)}</span></span></div><div><button type="button" aria-label={story.saved ? "Убрать из сохранённого" : "Сохранить историю"} title={story.saved ? "Сохранено" : "Сохранить"} aria-pressed={story.saved} disabled={pending.save || loading || !hydrated} className={story.saved ? "is-saved" : ""} onClick={() => action("save", async () => onUpdate(await storyApi.save(story.id, !story.saved), "save"))}><StoryIcon name="bookmark" filled={story.saved} /></button><button type="button" onClick={share} disabled={pending.share} aria-label="Поделиться историей" title="Поделиться"><StoryIcon name="share" /></button><button type="button" onClick={() => setModal("report")} aria-label="Сообщить о проблеме" title="Сообщить о проблеме"><StoryIcon name="flag" size={17} /></button></div></footer>}
    {notice && <div className="stories-toast" role="status"><StoryIcon name="check" size={16} />{notice}</div>}
    {modal === "comments" && <Comments story={story} onClose={() => setModal(null)} onCountChange={(delta) => onCommentsChange(story.id, delta)} />}
    {modal === "report" && <ReportDialog story={story} onClose={() => setModal(null)} />}
    {modal === "share" && <StoryDialog title="История, которой хочется поделиться" onClose={() => setModal(null)}><div className="stories-dialog-body stories-form"><p className="stories-muted">Скопируйте ссылку и предложите другу посмотреть на ситуацию со своей стороны.</p><label>Ссылка на историю<input readOnly value={`${window.location.origin}/stories/${story.id}`} onFocus={(event) => event.target.select()} /></label></div></StoryDialog>}
  </article>;
}
