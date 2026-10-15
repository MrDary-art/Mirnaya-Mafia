import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { feedApi } from "./feedApi.js";
import { AudienceSelect, FeedDialog, FeedError, FeedIcon, nameOf } from "./FeedPrimitives.jsx";
import "./stories-bar.css";

export const STORY_BACKGROUNDS = { forest: "Лес", mint: "Мята", gold: "Песок", night: "Ночь", rose: "Роза" };

export default function StoryComposer({ onClose, onCreated }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [background, setBackground] = useState("forest");
  const [audience, setAudience] = useState("FRIENDS");
  const [publisher, setPublisher] = useState(null);
  const [publishers, setPublishers] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const input = useRef(null), uploaded = useRef(null), lock = useRef(false), mounted = useRef(true);
  const dirty = Boolean(text.trim() || file);
  useEffect(() => {
    mounted.current = true;
    api("/api/social/media/capabilities").then((result) => { if (mounted.current) setCapabilities(result); }).catch((failure) => { if (mounted.current) setMediaError(failure.message); });
    feedApi.publishers().then((result) => { if (mounted.current) setPublishers(result.items || []); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!dirty) return undefined;
    const protect = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  function close() {
    if (lock.current || (dirty && !window.confirm("Закрыть историю без публикации? Текст и вложение не сохранятся."))) return;
    if (uploaded.current) api(`/api/social/media/${uploaded.current.id}`, { method: "DELETE" }).catch(() => {});
    onClose();
  }
  function chooseFile(value) {
    if (!value || !capabilities) return;
    setError("");
    const video = value.type.startsWith("video/");
    const allowed = [...capabilities.image_types, ...(capabilities.video_enabled ? capabilities.video_types : [])];
    if (!allowed.includes(value.type)) { setError("Этот формат не поддерживается. Выберите JPEG, PNG, WebP или доступный формат видео."); return; }
    if (value.size > (video ? capabilities.max_video_bytes : capabilities.max_image_bytes)) { setError(`Файл слишком большой: максимум ${Math.round((video ? capabilities.max_video_bytes : capabilities.max_image_bytes) / 1000000)} МБ.`); return; }
    if (uploaded.current) api(`/api/social/media/${uploaded.current.id}`, { method: "DELETE" }).catch(() => {});
    uploaded.current = null; setFile(value);
  }
  async function publish(event) {
    event.preventDefault();
    if (lock.current || (!text.trim() && !file)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (file && !uploaded.current) { setPhase("Проверяем и загружаем файл…"); uploaded.current = await feedApi.upload(file, alt.trim()); }
      setPhase("Публикуем историю…");
      const result = await feedApi.createStory({ text: text.trim(), background, audience, as_company_id: publisher, media_id: uploaded.current?.id || null });
      uploaded.current = null;
      window.dispatchEvent(new Event("arena:social-stories-changed"));
      if (mounted.current) { onCreated?.(result); onClose(); }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setPhase(""); } }
  }
  const video = file?.type.startsWith("video/");
  return <FeedDialog title="Новая история" subtitle="Момент с вашей Арены — на 24 часа" onClose={close}>
    <form className="arena-social-story-composer" onSubmit={publish}>
      <div className={`arena-social-story-preview arena-social-story-bg-${background}${file ? " has-media" : ""}`}>
        {preview && (video ? <video src={preview} controls playsInline preload="metadata" onLoadedMetadata={(event) => { if (event.currentTarget.duration > capabilities.max_story_video_seconds) { setError(`Для истории нужно видео до ${capabilities.max_story_video_seconds} секунд. Выберите более короткий ролик.`); setFile(null); } }} /> : <img src={preview} alt={alt || "Предпросмотр истории"} />)}
        <p>{text || (!file ? "Один момент. Ваша история." : "")}</p>
      </div>
      <label className="arena-social-story-field">Текст истории<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={3} disabled={busy} placeholder="Поделитесь мыслью или моментом…" /></label>
      <span className="arena-social-story-helper">{text.length} / 1000</span>
      <fieldset className="arena-social-story-backgrounds" disabled={busy}><legend>Фон</legend>{Object.entries(STORY_BACKGROUNDS).map(([key, title]) => <label key={key} className={`arena-social-story-bg-${key}`} title={title}><input type="radio" name="story-background" value={key} checked={background === key} onChange={() => setBackground(key)} /><span className="arena-feed-sr-only">{title}</span>{background === key && <FeedIcon name="check" size={18} />}</label>)}</fieldset>
      <div className="arena-social-story-file-actions"><input ref={input} type="file" hidden accept={[...(capabilities?.image_types || []), ...(capabilities?.video_enabled ? capabilities.video_types : [])].join(",")} onChange={(event) => { chooseFile(event.target.files[0]); event.target.value = ""; }} /><button type="button" className="arena-feed-button" disabled={busy || !capabilities} onClick={() => input.current?.click()}><FeedIcon name="image" />{file ? "Заменить файл" : capabilities?.video_enabled ? "Фото или видео" : "Добавить фото"}</button>{file && <button type="button" className="arena-feed-text-button" disabled={busy} onClick={() => { if (uploaded.current) api(`/api/social/media/${uploaded.current.id}`, { method: "DELETE" }).catch(() => {}); uploaded.current = null; setFile(null); }}>Убрать файл</button>}</div>
      {capabilities && <p className="arena-social-story-helper">Фото до {Math.round(capabilities.max_image_bytes / 1000000)} МБ.{capabilities.video_enabled ? ` Видео до ${capabilities.max_story_video_seconds} секунд, ${Math.round(capabilities.max_video_bytes / 1000000)} МБ.` : " Видео пока недоступно на этом сервере."}</p>}
      <FeedError error={mediaError} />
      {file && <label className="arena-social-story-field">Описание медиа<input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} disabled={busy || Boolean(uploaded.current)} placeholder="Что изображено?" /></label>}
      {publishers.length > 0 && <label className="arena-social-story-field">От чьего имени<select value={publisher || ""} disabled={busy} onChange={(event) => { const id = Number(event.target.value) || null; setPublisher(id); if (id && audience === "FRIENDS") setAudience("COMPANY_INTERNAL"); if (!id && audience === "COMPANY_INTERNAL") setAudience("FRIENDS"); }}><option value="">{nameOf(user)}</option>{publishers.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      <AudienceSelect value={audience} onChange={setAudience} company={Boolean(publisher)} disabled={busy} />
      <p className="arena-social-story-helper">Доступ дополнительно ограничен приватностью профиля. Историю можно закрепить в «Актуальном» до истечения 24 часов.</p>
      <FeedError error={error} />
      <footer className="arena-social-story-form-footer"><button type="button" className="arena-feed-text-button" onClick={close} disabled={busy}>Отмена</button><button type="submit" className="arena-feed-button is-primary" disabled={busy || (!text.trim() && !file)}>{busy ? phase : "Опубликовать на 24 часа"}<FeedIcon name="send" size={18} /></button></footer>
    </form>
  </FeedDialog>;
}
