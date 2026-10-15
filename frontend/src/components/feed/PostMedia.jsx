import { useEffect, useRef, useState } from "react";
import { apiBlob } from "../../api.js";
import { FeedDialog, FeedError, FeedIcon } from "./FeedPrimitives.jsx";

export function PrivateMedia({ media, full = false, eager = false, decorative = false, onOpen, onReady, onEnded }) {
  const container = useRef(null);
  const [near, setNear] = useState(eager || full);
  const [requested, setRequested] = useState(false);
  const [url, setUrl] = useState("");
  const [poster, setPoster] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);
  const video = String(media.kind).toLowerCase() === "video";
  const callback = useRef(onReady); callback.current = onReady;
  useEffect(() => {
    if (!video || !media.thumbnail_url || !near || !visible) return undefined;
    const controller = new AbortController(); let objectUrl = "", disposed = false;
    apiBlob(media.thumbnail_url, { signal: controller.signal }).then(blob => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob); setPoster(objectUrl);
    }).catch(() => { if (!disposed) setPoster(""); });
    return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setPoster(""); };
  }, [video, media.id, media.thumbnail_url, near, visible, retry]);
  useEffect(() => {
    if (near) return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "150px" });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [near]);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    const refresh = () => setRetry((value) => value + 1);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("arena:feed-access-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("arena:feed-access-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!video || !container.current) return undefined;
    const observer = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) container.current?.querySelector("video")?.pause(); });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [video]);
  useEffect(() => {
    if (!near || !visible || (video && !requested && !eager)) return undefined;
    const controller = new AbortController(); let objectUrl = ""; let disposed = false;
    setError(""); setUrl("");
    const source = full || video ? media.url : media.thumbnail_url || media.url;
    apiBlob(source || `/api/social/media/${media.id}`, { signal: controller.signal }).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); callback.current?.();
    }).catch((failure) => { if (!disposed && failure.name !== "AbortError") setError(failure.message); });
    return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(""); };
  }, [media.id, media.url, media.thumbnail_url, near, full, requested, eager, video, retry, visible]);
  return <div ref={container} className={`arena-feed-private-media${full ? " is-full" : ""}`} style={{ aspectRatio: media.width && media.height ? `${media.width}/${media.height}` : video ? "16/9" : "4/3" }}>
    {error ? decorative ? <span aria-hidden="true"><FeedIcon name="video" size={32} /></span> : <div className="arena-feed-media-error"><FeedError error={error} retry={() => setRetry((value) => value + 1)} /></div> : video ? url ? <video src={url} poster={poster || undefined} controls playsInline autoPlay={requested} preload="metadata" aria-label={media.alt || "Видео публикации"} onError={() => setError("Видео не удалось воспроизвести. Попробуйте загрузить его ещё раз.")} onEnded={onEnded} onPlay={(event) => { document.querySelectorAll(".arena-feed-private-media video").forEach((element) => { if (element !== event.currentTarget) element.pause(); }); }} /> : <button type="button" className={`arena-feed-video-load${poster ? " has-poster" : ""}`} onClick={() => setRequested(true)} disabled={requested && near}>{poster && <img src={poster} alt="" />}<span className="arena-feed-video-play-icon"><FeedIcon name="play" size={32} /></span><span>{requested ? "Загружаем видео…" : "Открыть видео"}</span>{media.duration_seconds && <small>{Math.round(media.duration_seconds)} сек</small>}</button> : url ? onOpen ? <button type="button" className="arena-feed-image-button" onClick={onOpen} aria-label={`Открыть изображение: ${media.alt || "фотография публикации"}`}><img src={url} alt={media.alt || "Фотография публикации"} width={media.width || undefined} height={media.height || undefined} loading="lazy" /></button> : <img src={url} alt={decorative ? "" : media.alt || "Фотография публикации"} width={media.width || undefined} height={media.height || undefined} /> : <span className="arena-feed-media-loading" role={decorative ? undefined : "status"} aria-hidden={decorative || undefined}><FeedIcon name="image" size={28} /><span className="arena-feed-sr-only">Загружаем изображение…</span></span>}
  </div>;
}

export default function PostMedia({ media = [] }) {
  const [selected, setSelected] = useState(null);
  if (!media.length) return null;
  return <><div className={`arena-feed-media-grid arena-feed-media-count-${Math.min(media.length, 4)}`}>{media.slice(0, 4).map((item, index) => <div key={item.id} className="arena-feed-media-tile"><PrivateMedia media={item} onOpen={() => setSelected(index)} />{index === 3 && media.length > 4 && <button className="arena-feed-media-more" onClick={() => setSelected(4)}>Ещё {media.length - 4}</button>}</div>)}</div>{selected !== null && <FeedDialog title={`Вложения · ${selected + 1} / ${media.length}`} onClose={() => setSelected(null)} wide><div className="arena-feed-gallery" onKeyDown={(event) => { if (event.key === "ArrowRight") setSelected((value) => Math.min(media.length - 1, value + 1)); if (event.key === "ArrowLeft") setSelected((value) => Math.max(0, value - 1)); }}><PrivateMedia key={media[selected].id} media={media[selected]} full eager /><div><button className="arena-feed-button" disabled={selected === 0} onClick={() => setSelected((value) => value - 1)}><FeedIcon name="left" />Предыдущее</button><button className="arena-feed-button" disabled={selected === media.length - 1} onClick={() => setSelected((value) => value + 1)}>Следующее<FeedIcon name="right" /></button></div></div></FeedDialog>}</>;
}
