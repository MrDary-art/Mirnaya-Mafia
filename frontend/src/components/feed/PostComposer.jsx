import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { feedApi, postChanged } from "./feedApi.js";
import { AudienceSelect, FeedAvatar, FeedError, FeedIcon, LinkedContent, nameOf } from "./FeedPrimitives.jsx";
import { PrivateMedia } from "./PostMedia.jsx";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";
const LINK_LABELS = { SCENARIO: "Сценарии", ACHIEVEMENT: "Достижения", RESULT: "Мои результаты", LESSON: "Обучение", CERTIFICATE: "Сертификаты" };
const localFiles = new Map();
const audienceIds = new Set(["PUBLIC", "FRIENDS", "FOLLOWERS", "ONLY_ME", "COMPANY_INTERNAL"]);

function readDraft(key, legacyKey) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) { const value = JSON.parse(raw); return value?.version === 2 ? value : null; }
    const legacy = legacyKey ? sessionStorage.getItem(legacyKey) : null;
    return legacy ? { version: 2, body: legacy } : null;
  } catch { return null; }
}

export default function PostComposer(props) {
  const { user } = useAuth();
  const identity = `${user?.id || user?.username}:${props.editing ? `edit:${props.editing.id}` : props.companyId ? `company:${props.companyId}` : "new"}`;
  return <ComposerForm key={identity} {...props} user={user} draftKey={`arena:feed-composer:v2:${identity}`} />;
}

function ComposerForm({ onCreated, editing = null, onCancel, companyId = null, prefill = null, initiallyOpen = false, user, draftKey }) {
  const legacyKey = `arena:feed-composer:${user?.username}:${editing?.id || companyId || "new"}`;
  const [restored] = useState(() => readDraft(draftKey, editing ? null : legacyKey));
  const isRepost = editing?.kind === "REPOST";
  const [expanded, setExpanded] = useState(initiallyOpen || Boolean(editing || prefill || restored));
  const [body, setBody] = useState(typeof restored?.body === "string" ? restored.body.slice(0, 10000) : editing?.body || "");
  const [audience, setAudience] = useState(audienceIds.has(restored?.audience) ? restored.audience : editing?.audience || (companyId ? "COMPANY_INTERNAL" : "PUBLIC"));
  const [publisher, setPublisher] = useState(editing?.company?.id || companyId || restored?.publisher || null);
  const [publishers, setPublishers] = useState([]);
  const [capabilities, setCapabilities] = useState({ video_enabled: false });
  const [commentsEnabled, setCommentsEnabled] = useState(typeof restored?.commentsEnabled === "boolean" ? restored.commentsEnabled : editing?.comments_enabled ?? true);
  const [media, setMedia] = useState(() => {
    if (isRepost) return [];
    const cached = localFiles.get(draftKey);
    if (cached) return cached.map(item => ({ ...item, preview: item.file && !item.media ? URL.createObjectURL(item.file) : undefined }));
    return (Array.isArray(restored?.media) ? restored.media : (editing?.media || []).map(item => ({ media: item, alt: item.alt || "" }))).filter(item => item.media?.id);
  });
  const [linked, setLinked] = useState(isRepost ? null : restored && Object.hasOwn(restored, "linked") && (!editing || restored.linkedTouched) ? restored.linked : editing?.linked_content || null);
  const [linkedTouched, setLinkedTouched] = useState(Boolean(restored?.linkedTouched));
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [linkKind, setLinkKind] = useState("");
  const [poll, setPoll] = useState(!editing && Array.isArray(restored?.poll) ? restored.poll.slice(0, 6).map(value => String(value).slice(0, 200)) : null);
  const [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(restored ? restored.pendingFiles && !localFiles.has(draftKey) ? "Текст и настройки восстановлены. Незагруженные файлы нужно выбрать заново." : "Незавершённая запись восстановлена в этом браузере." : "");
  const fileRef = useRef(null); const lock = useRef(false); const mediaRef = useRef(media); mediaRef.current = media;
  const mounted = useRef(true);
  const hasContent = Boolean(body.trim() || media.length || linked || poll || editing?.poll || isRepost);
  const discarded = useRef(false);
  function clearDraft() { localFiles.delete(draftKey); try { sessionStorage.removeItem(draftKey); sessionStorage.removeItem(legacyKey); } catch {} }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; mediaRef.current.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); }); };
  }, []);
  useEffect(() => {
    if (discarded.current) { discarded.current = false; return; }
    const sameMedia = !media.some(item => item.file && !item.media) && JSON.stringify(media.map(item => item.media?.id)) === JSON.stringify((editing?.media || []).map(item => item.id));
    const sameLink = linked?.kind === editing?.linked_content?.kind && linked?.id === editing?.linked_content?.id;
    if (body === (editing?.body || "") && audience === (editing?.audience || (companyId ? "COMPANY_INTERNAL" : "PUBLIC")) && publisher === (editing?.company?.id || companyId || null) && commentsEnabled === (editing?.comments_enabled ?? true) && sameMedia && sameLink && !poll) { clearDraft(); return; }
    const value = { version: 2, body, audience, publisher, commentsEnabled, linked, linkedTouched, poll, media: media.filter(item => item.media).map(item => ({ media: item.media, alt: item.alt })), pendingFiles: media.filter(item => !item.media).length };
    localFiles.set(draftKey, media.map(({ preview, ...item }) => item));
    try { sessionStorage.setItem(draftKey, JSON.stringify(value)); sessionStorage.removeItem(legacyKey); } catch {}
  }, [body, audience, publisher, commentsEnabled, linked, linkedTouched, poll, media, draftKey]);
  useEffect(() => {
    const warn = event => { if (lock.current || mediaRef.current.some(item => item.file && !item.media)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => { if (!expanded || editing) return undefined; let cancelled = false; feedApi.publishers().then((result) => { if (!cancelled) setPublishers(result.items || []); }).catch(() => {}); return () => { cancelled = true; }; }, [expanded, editing]);
  useEffect(() => { let cancelled = false; api("/api/social/media/capabilities").then((result) => { if (!cancelled) setCapabilities(result); }).catch(() => {}); return () => { cancelled = true; }; }, []);
  async function loadCatalog() {
    setCatalogLoading(true); setCatalogError("");
    try { const result = await api("/api/social/attachments"); if (mounted.current) { setCatalog(result.items || []); return result.items || []; } }
    catch (failure) { if (mounted.current) setCatalogError(failure.message); }
    finally { if (mounted.current) setCatalogLoading(false); }
    return [];
  }
  useEffect(() => {
    if (!prefill?.kind || !prefill?.id) return undefined;
    let cancelled = false; setExpanded(true);
    loadCatalog().then((items) => { if (cancelled) return; const item = items.find((entry) => entry.kind === prefill.kind && String(entry.id) === String(prefill.id)); if (item) setLinked(item); else setCatalogError("Этот материал нельзя прикрепить: он недоступен или не разрешён для публикации."); });
    return () => { cancelled = true; };
  }, [prefill?.kind, prefill?.id]);
  function addFiles(files) {
    if (isRepost || lock.current) return;
    const available = 10 - media.length;
    const list = Array.from(files).slice(0, available);
    if (files.length > available) setError("К публикации можно прикрепить до 10 файлов.");
    const valid = list.filter((file) => ACCEPT.split(",").includes(file.type) && (!file.type.startsWith("video/") || capabilities.video_enabled));
    if (valid.length !== list.length) setError(capabilities.video_enabled ? "Поддерживаются JPEG, PNG, WebP, MP4 и WebM. Другие файлы не добавлены." : "Сейчас доступны фото JPEG, PNG и WebP. Загрузка видео недоступна на этом сервере.");
    const sized = valid.filter(file => !((file.type.startsWith("video/") ? capabilities.max_video_bytes : capabilities.max_image_bytes) < file.size));
    if (sized.length !== valid.length) setError("Некоторые файлы превышают допустимый размер и не добавлены. Выберите файл меньшего размера.");
    setMedia((previous) => [...previous, ...sized.map((file) => ({ file, preview: URL.createObjectURL(file), alt: "" }))]); setExpanded(true);
  }
  function removeFile(index) { setMedia((previous) => { const item = previous[index]; if (item.preview) URL.revokeObjectURL(item.preview); return previous.filter((_, position) => position !== index); }); }
  function moveFile(index, delta) { setMedia((previous) => { const result = [...previous]; const target = index + delta; [result[index], result[target]] = [result[target], result[index]]; return result; }); }
  async function submit(status) {
    if (lock.current || !hasContent) return;
    if (poll && (poll.some((option) => !option.trim()) || new Set(poll.map((option) => option.trim())).size !== poll.length)) { setError("Укажите от двух до шести разных ответов опроса."); return; }
    lock.current = true; setBusy(true); setSavingDraft(status === "DRAFT"); setError(""); setNotice("");
    try {
      const uploaded = [];
      for (let index = 0; index < media.length; index += 1) {
        const item = media[index];
        if (item.media) uploaded.push(item.media.id);
        else {
          const result = await feedApi.upload(item.file, item.alt.trim().slice(0, 300)); uploaded.push(result.id);
          setMedia((previous) => previous.map((entry, position) => position === index ? { ...entry, media: result } : entry));
        }
      }
      const payload = { body: body.trim(), audience, status, comments_enabled: commentsEnabled };
      if (!isRepost) {
        payload.media_ids = uploaded;
        if (!editing || linkedTouched) {
          if (linked && !linked.id) throw new Error("Прикреплённый материал недоступен. Уберите его или выберите другой материал.");
          payload.linked_content = linked ? { kind: linked.kind, id: String(linked.id) } : null;
        }
      }
      if (!editing) { payload.as_company_id = publisher; payload.poll = poll ? { options: poll.map((option) => option.trim()) } : null; }
      const result = editing ? await feedApi.update(editing.id, payload) : await feedApi.create(payload);
      discarded.current = true; clearDraft(); postChanged(result); onCreated?.(result);
      if (!editing) {
        mediaRef.current.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
        setBody(""); setMedia([]); setLinked(null); setLinkedTouched(false); setPoll(null); setLinkKind("");
        setNotice(status === "DRAFT" ? publisher ? "Черновик сохранён на странице компании. Пока он доступен только вам." : "Черновик сохранён. Он доступен только вам на вашей стене." : publisher ? "Публикация появилась на странице компании." : "Публикация появилась на вашей стене.");
        setExpanded(false);
      }
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setSavingDraft(false); } }
  }
  function cancel() { discarded.current = true; clearDraft(); onCancel?.(); }
  return <section className={`arena-feed-composer${expanded ? " is-expanded" : ""}`} aria-label={editing ? "Редактировать публикацию" : "Создать публикацию"} onDragOver={(event) => { if (!busy && !isRepost && event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => { if (busy) return; event.preventDefault(); addFiles(event.dataTransfer.files); }}>
    <div className="arena-feed-composer-main"><FeedAvatar author={user} /><label><span className="arena-feed-sr-only">Текст публикации</span><textarea aria-label="Текст публикации" value={body} onFocus={() => setExpanded(true)} onChange={(event) => setBody(event.target.value)} rows={expanded ? 4 : 1} maxLength={10000} disabled={busy} placeholder="Что нового на вашей Арене?" /></label></div>
    {expanded && <div className="arena-feed-composer-body">{editing?.poll && <p className="arena-feed-privacy-note">Варианты опубликованного опроса изменить нельзя. Можно изменить текст, аудиторию и комментарии.</p>}{isRepost && <p className="arena-feed-privacy-note">Вы редактируете подпись к репосту. Вложения и исходная публикация не изменятся.</p>}
      {publishers.length > 0 && !editing && <label className="arena-feed-publisher">Опубликовать от имени<select value={publisher || ""} onChange={(event) => { const id = Number(event.target.value) || null; setPublisher(id); if (id && audience === "FRIENDS") setAudience("COMPANY_INTERNAL"); if (!id && audience === "COMPANY_INTERNAL") setAudience("PUBLIC"); }} disabled={busy}><option value="">{nameOf(user)}</option>{publishers.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      <div className="arena-feed-composer-options"><AudienceSelect value={audience} onChange={setAudience} company={Boolean(publisher)} disabled={busy} /><span>{body.length} / 10000</span></div>
      {audience === "PUBLIC" && <p className="arena-feed-privacy-note">Публикацию увидят только те, кому доступен ваш профиль. Личные переписки и оценки не добавляются автоматически.</p>}
      {media.length > 0 && <div className="arena-feed-upload-list">{media.map((item, index) => <div key={item.media?.id || item.preview} className="arena-feed-upload-item"><div>{item.media ? <PrivateMedia media={item.media} /> : item.file.type.startsWith("video/") ? <video src={item.preview} controls preload="metadata" /> : <img src={item.preview} alt={item.alt || "Предпросмотр вложения"} />}</div><label>Описание изображения<input value={item.alt} onChange={(event) => setMedia((previous) => previous.map((entry, position) => position === index ? { ...entry, alt: event.target.value } : entry))} maxLength={300} disabled={busy || Boolean(item.media)} placeholder="Что изображено?" /></label><div className="arena-feed-upload-controls"><button className="arena-feed-icon-button" disabled={busy || index === 0} onClick={() => moveFile(index, -1)} aria-label="Переместить вложение раньше"><FeedIcon name="left" size={16} /></button><button className="arena-feed-icon-button" disabled={busy || index === media.length - 1} onClick={() => moveFile(index, 1)} aria-label="Переместить вложение позже"><FeedIcon name="right" size={16} /></button><button className="arena-feed-icon-button" disabled={busy} onClick={() => removeFile(index)} aria-label="Убрать вложение"><FeedIcon name="trash" size={16} /></button></div></div>)}</div>}
      {linked && <div className="arena-feed-composer-link"><LinkedContent content={linked} /><button className="arena-feed-icon-button" disabled={busy} onClick={() => { setLinked(null); setLinkedTouched(true); }} aria-label="Убрать прикреплённый материал"><FeedIcon name="close" size={16} /></button></div>}
      {linkKind && <div className="arena-feed-attachment-picker"><div><b>Материал Арены</b><button className="arena-feed-icon-button" onClick={() => setLinkKind("")} aria-label="Закрыть выбор материала"><FeedIcon name="close" size={16} /></button></div><label><span className="arena-feed-sr-only">Тип материала</span><select value={linkKind} onChange={(event) => setLinkKind(event.target.value)}>{Object.entries(LINK_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><FeedError error={catalogError} retry={loadCatalog} />{catalogLoading ? <p role="status">Загружаем доступные материалы…</p> : <div className="arena-feed-attachment-options">{catalog.filter((item) => item.kind === linkKind).map((item) => <button key={`${item.kind}-${item.id}`} onClick={() => { setLinked(item); setLinkedTouched(true); setLinkKind(""); }}><span>{item.title}</span><FeedIcon name="plus" size={17} /></button>)}{!catalog.some((item) => item.kind === linkKind) && !catalogError && <p>Пока нет доступных материалов этого типа. Здесь появятся только подтверждённые материалы, которыми можно поделиться.</p>}</div>}</div>}
      {poll && <fieldset className="arena-feed-poll-editor"><legend>Варианты ответа</legend>{poll.map((option, index) => <label key={index}><span>{index + 1}.</span><input value={option} onChange={(event) => setPoll((previous) => previous.map((entry, position) => position === index ? event.target.value : entry))} maxLength={200} disabled={busy} placeholder={`Вариант ${index + 1}`} /><button className="arena-feed-icon-button" disabled={busy || poll.length <= 2} onClick={() => setPoll((previous) => previous.filter((_, position) => position !== index))} aria-label={`Удалить вариант ${index + 1}`}><FeedIcon name="close" size={16} /></button></label>)}<div><button className="arena-feed-text-button" disabled={busy || poll.length >= 6} onClick={() => setPoll((previous) => [...previous, ""])}>Добавить вариант</button><button className="arena-feed-text-button" disabled={busy} onClick={() => setPoll(null)}>Убрать опрос</button></div></fieldset>}
      <label className="arena-feed-checkbox"><input type="checkbox" checked={commentsEnabled} onChange={(event) => setCommentsEnabled(event.target.checked)} disabled={busy} />Разрешить комментарии</label>
    </div>}
    <FeedError error={error || (!linkKind ? catalogError : "")} />{notice && <p className="arena-feed-notice" role="status"><FeedIcon name="check" size={17} />{notice}</p>}
    <footer className="arena-feed-composer-footer"><div>{!isRepost && <><input ref={fileRef} type="file" accept={capabilities.video_enabled ? ACCEPT : "image/jpeg,image/png,image/webp"} multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} /><button type="button" disabled={busy || media.length >= 10} onClick={() => fileRef.current?.click()} title={capabilities.video_enabled ? "Фото или видео" : "Добавить фото"}><FeedIcon name="image" /><span>{capabilities.video_enabled ? "Фото / видео" : "Фото"}</span></button><button type="button" disabled={busy} onClick={() => { setExpanded(true); setLinkKind("SCENARIO"); if (!catalog.length) loadCatalog(); }}><FeedIcon name="book" /><span>Материал</span></button></>}{!editing && <button type="button" disabled={busy} onClick={() => { setExpanded(true); setPoll((previous) => previous || ["", ""]); }}><FeedIcon name="poll" /><span>Опрос</span></button>}</div>{expanded && <div className="arena-feed-publish-actions">{!editing && <button type="button" className="arena-feed-text-button" disabled={busy} onClick={() => setExpanded(false)}>Свернуть</button>}{editing && onCancel && <button type="button" className="arena-feed-text-button" disabled={busy} onClick={cancel}>Отмена</button>}{(!editing || editing.status === "DRAFT") && <button type="button" className="arena-feed-text-button" disabled={busy || !hasContent} onClick={() => submit("DRAFT")}>{savingDraft ? "Сохраняем…" : "Черновик"}</button>}<button type="button" className="arena-feed-button is-primary" disabled={busy || !hasContent} onClick={() => submit("PUBLISHED")}>{busy && !savingDraft ? "Публикуем…" : editing && editing.status !== "DRAFT" ? "Сохранить" : "Опубликовать"}<FeedIcon name="send" size={17} /></button></div>}</footer>
  </section>;
}
