import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { feedApi } from "./feedApi.js";
import { AudienceSelect, FeedDialog, FeedError, FeedIcon, nameOf } from "./FeedPrimitives.jsx";
import "./stories-bar.css";
import StoryCanvas from "./StoryCanvas.jsx";

export const STORY_BACKGROUNDS = { forest: "Лес", mint: "Мята", gold: "Песок", night: "Ночь", rose: "Роза" };

export default function StoryComposer({ onClose, onCreated }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [background, setBackground] = useState("mint");
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
  const [step, setStep] = useState("edit");
  const [reviewUrl, setReviewUrl] = useState("");
  const [textColor, setTextColor] = useState("#20372b");
  const [textPosition, setTextPosition] = useState("center");
  const [textSize, setTextSize] = useState(28);
  const prepared = useRef(null);
  const input = useRef(null), uploaded = useRef(null), lock = useRef(false), mounted = useRef(true);
  const canvas = useRef(null);
  const form = useRef(null);
  const [painted, setPainted] = useState(false);
  const dirty = Boolean(text.trim() || file || painted);
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }, [reviewUrl]);
  useEffect(() => {
    form.current?.closest("dialog")?.scrollTo({ top: 0 });
    form.current?.closest(".stories-dialog-body")?.scrollTo({ top: 0 });
    const heading = form.current?.querySelector(step === "review" ? ".story-studio-review h3" : step === "done" ? ".story-studio-success h3" : ".story-studio-section-heading h3");
    heading?.setAttribute("tabindex", "-1"); heading?.focus({ preventScroll: true });
  }, [step]);
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
    if (!dirty || step === "done") return undefined;
    const protect = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, step]);
  function close() {
    if (lock.current || (step !== "done" && dirty && !window.confirm("Закрыть историю без публикации? Рисунок, текст и вложение не сохранятся."))) return;
    if (uploaded.current) api(`/api/social/media/${uploaded.current.id}`, { method: "DELETE" }).catch(() => {});
    onClose();
  }
  async function prepare() {
    if (!dirty || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      prepared.current = file?.type.startsWith("video/") ? file : await canvas.current.exportFile();
      setReviewUrl(URL.createObjectURL(prepared.current)); setStep("review");
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
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
    if (lock.current || !dirty || step !== "review" || !prepared.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const isVideo = file?.type.startsWith("video/");
      if (!isVideo && uploaded.current) { await api(`/api/social/media/${uploaded.current.id}`, { method: "DELETE" }); uploaded.current = null; }
      if (!uploaded.current) { setPhase("Загружаем историю…"); uploaded.current = await feedApi.upload(prepared.current, (alt.trim() || text.trim()).slice(0, 300)); }
      setPhase("Публикуем историю…");
      const result = await feedApi.createStory({ text: isVideo ? text.trim() : "", background, audience, as_company_id: publisher, media_id: uploaded.current?.id || null });
      uploaded.current = null;
      window.dispatchEvent(new Event("arena:social-stories-changed"));
      if (mounted.current) { onCreated?.(result); setStep("done"); }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setPhase(""); } }
  }
  const video = file?.type.startsWith("video/");
  return <FeedDialog wide title={step === "done" ? "История опубликована" : "Мастерская историй"} subtitle={step === "done" ? "Ваш момент уже на Арене" : "Небольшой холст для большой мысли"} onClose={close}>
    <form ref={form} className={`arena-social-story-composer story-studio is-${step}`} onSubmit={publish}>
      <ol className="story-studio-steps" aria-label="Этапы создания"><li aria-current={step === "edit" ? "step" : undefined}><b>1</b> Создание</li><li aria-current={step === "review" ? "step" : undefined}><b>2</b> Предпросмотр</li><li aria-current={step === "done" ? "step" : undefined}><b>3</b> Публикация</li></ol>
      {step === "done" ? <section className="story-studio-success" role="status"><span className="story-studio-check">✓</span><h3>Готово. Теперь это часть вашей истории.</h3><p>История доступна выбранной аудитории в течение 30 дней. Откройте её в ленте историй, чтобы посмотреть просмотры или добавить в «Актуальное».</p>{video ? <video src={reviewUrl} controls playsInline /> : <img src={reviewUrl} alt="Опубликованная история" />}<button type="button" className="arena-feed-button is-primary" onClick={onClose}>Вернуться в сообщество</button></section> : <>
      <div className="story-studio-workspace" hidden={step !== "edit"}>
      <div className="story-studio-canvas"><div className="story-studio-section-heading"><h3>Ваш холст</h3><span>Квадрат · 1:1</span></div>
      {!video && <StoryCanvas ref={canvas} background={{forest:"#173b2c",mint:"#c1e9c1",gold:"#e7c890",night:"#172a35",rose:"#e4b5b3"}[background]} image={preview} text={text} textColor={textColor} textPosition={textPosition} textSize={textSize} disabled={busy} onDirty={setPainted} />}
      {video && <div className={`arena-social-story-preview arena-social-story-bg-${background}${file ? " has-media" : ""}`}>
        {preview && (video ? <video src={preview} controls playsInline preload="metadata" onLoadedMetadata={(event) => { if (event.currentTarget.duration > capabilities.max_story_video_seconds) { setError(`Для истории нужно видео до ${capabilities.max_story_video_seconds} секунд. Выберите более короткий ролик.`); setFile(null); } }} /> : <img src={preview} alt={alt || "Предпросмотр истории"} />)}
        <p>{text || (!file ? "Один момент. Ваша история." : "")}</p>
      </div>}
      </div><aside className="story-studio-settings"><h3>Оформление</h3>
      <label className="arena-social-story-field">Текст истории<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={3} disabled={busy} placeholder="Поделитесь мыслью или моментом…" /></label>
      <span className="arena-social-story-helper">{text.length} / 1000</span>
      <div className="story-studio-text-controls"><label>Положение<select value={textPosition} onChange={event => setTextPosition(event.target.value)} disabled={busy}><option value="top">Сверху</option><option value="center">По центру</option><option value="bottom">Снизу</option></select></label><label>Размер<select value={textSize} onChange={event => setTextSize(Number(event.target.value))} disabled={busy}><option value={20}>Маленький</option><option value={28}>Средний</option><option value={36}>Крупный</option></select></label></div>
      <div className="story-studio-ink"><span>Цвет текста</span>{["#20372b", "#ffffff", "#f1cd85"].map(color => <button type="button" key={color} aria-label={`Цвет текста ${color}`} aria-pressed={textColor === color} style={{background:color}} disabled={busy} onClick={() => setTextColor(color)} />)}</div>
      <fieldset className="arena-social-story-backgrounds" disabled={busy}><legend>Фон</legend>{Object.entries(STORY_BACKGROUNDS).map(([key, title]) => <label key={key} className={`arena-social-story-bg-${key}`} title={title}><input type="radio" name="story-background" value={key} checked={background === key} onChange={() => setBackground(key)} /><span className="arena-feed-sr-only">{title}</span>{background === key && <FeedIcon name="check" size={18} />}</label>)}</fieldset>
      <div className="arena-social-story-file-actions"><input ref={input} type="file" hidden accept={[...(capabilities?.image_types || []), ...(capabilities?.video_enabled ? capabilities.video_types : [])].join(",")} onChange={(event) => { chooseFile(event.target.files[0]); event.target.value = ""; }} /><button type="button" className="arena-feed-button" disabled={busy || !capabilities} onClick={() => input.current?.click()}><FeedIcon name="image" />{file ? "Заменить файл" : capabilities?.video_enabled ? "Фото или видео" : "Добавить фото"}</button>{file && <button type="button" className="arena-feed-text-button" disabled={busy} onClick={() => { if (uploaded.current) api(`/api/social/media/${uploaded.current.id}`, { method: "DELETE" }).catch(() => {}); uploaded.current = null; setFile(null); }}>Убрать файл</button>}</div>
      {capabilities && <p className="arena-social-story-helper">Фото до {Math.round(capabilities.max_image_bytes / 1000000)} МБ.{capabilities.video_enabled ? ` Видео до ${capabilities.max_story_video_seconds} секунд, ${Math.round(capabilities.max_video_bytes / 1000000)} МБ.` : " Видео пока недоступно на этом сервере."}</p>}
      <FeedError error={mediaError} />
      {file && <label className="arena-social-story-field">Описание медиа<input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} disabled={busy || Boolean(uploaded.current)} placeholder="Что изображено?" /></label>}
      </aside></div>
      {step === "review" && <div className="story-studio-review"><section><div className="story-studio-section-heading"><h3>Так увидят вашу историю</h3><span>Готово к публикации</span></div><div className="story-studio-review-author"><span>{nameOf(user).slice(0,1)}</span><div><b>{publishers.find(company => company.id === publisher)?.name || nameOf(user)}</b><small>Только что · 30 дней</small></div></div>{video ? <video src={reviewUrl} controls playsInline /> : <img src={reviewUrl} alt="Предпросмотр готовой истории" />}</section><aside className="story-studio-settings"><h3>Кому покажем?</h3><p>Проверьте холст и выберите аудиторию. После публикации история появится в сообществе.</p>
      {publishers.length > 0 && <label className="arena-social-story-field">От чьего имени<select value={publisher || ""} disabled={busy} onChange={(event) => { const id = Number(event.target.value) || null; setPublisher(id); if (id && audience === "FRIENDS") setAudience("COMPANY_INTERNAL"); if (!id && audience === "COMPANY_INTERNAL") setAudience("FRIENDS"); }}><option value="">{nameOf(user)}</option>{publishers.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      <AudienceSelect value={audience} onChange={setAudience} company={Boolean(publisher)} disabled={busy} />
      <p className="arena-social-story-helper">Доступ дополнительно ограничен приватностью профиля. Историю можно закрепить в «Актуальном» до истечения 30 дней.</p>
      <div className="story-studio-lifetime"><b>Месяц на Арене</b><span>Без обрезки: рисунок, фото и текст сохранятся именно так, как в предпросмотре.</span></div></aside></div>}
      <FeedError error={error} />
      <footer className="arena-social-story-form-footer story-studio-footer"><span>{busy ? phase || "Готовим предпросмотр…" : step === "edit" ? "Сначала творчество. Публикация — на следующем шаге." : "Всё готово? Поделитесь своим моментом."}</span><div><button type="button" className="arena-feed-text-button" onClick={step === "edit" ? close : () => setStep("edit")} disabled={busy}>{step === "edit" ? "Отмена" : "К редактированию"}</button>{step === "edit" ? <button type="button" className="arena-feed-button is-primary" disabled={busy || !dirty || !capabilities} onClick={prepare}>Предпросмотр <FeedIcon name="right" size={18} /></button> : <button type="submit" className="arena-feed-button is-primary" disabled={busy || !capabilities}>{busy ? "Публикуем…" : "Опубликовать на месяц"}<FeedIcon name="send" size={18} /></button>}</div></footer>
      </>}
    </form>
  </FeedDialog>;
}
