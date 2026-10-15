import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { feedApi } from "./feedApi.js";
import { FeedDialog, FeedError, FeedIcon } from "./FeedPrimitives.jsx";
import { PrivateMedia } from "./PostMedia.jsx";

const titleOf = post => post.body.split("\n")[0].replace(/^\[ДЕМО\]\s*/, "");

export default function FeedVideos({ refresh = 0 }) {
  const [items, setItems] = useState([]), [error, setError] = useState("");
  const [selected, setSelected] = useState(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await feedApi.list({ q: "#видеопрактика", limit: 20 });
        if (cancelled) return;
        const videos = result.items.filter(post => post.body.startsWith("[ДЕМО]") && post.media.some(media => media.kind.toLowerCase() === "video")).slice(0, 3);
        setItems(videos); setError("");
        setSelected(current => current === null || videos.some(post => post.id === current) ? current : null);
      } catch (failure) { if (!cancelled) setError(failure.message); }
    };
    const update = () => { if (!document.hidden) load(); };
    load();
    window.addEventListener("focus", update);
    window.addEventListener("arena:feed-post-removed", update);
    window.addEventListener("arena:feed-post-changed", update);
    window.addEventListener("arena:feed-access-changed", update);
    return () => { cancelled = true; window.removeEventListener("focus", update); window.removeEventListener("arena:feed-post-removed", update); window.removeEventListener("arena:feed-post-changed", update); window.removeEventListener("arena:feed-access-changed", update); };
  }, [refresh, retry]);
  if (!items.length && !error) return null;
  const index = items.findIndex(post => post.id === selected);
  const active = items[index];
  return <section className="arena-feed-videos" aria-label="Видеопрактика">
    <header><div><h2>Видеопрактика</h2><p>Короткие разборы переговорных приёмов</p></div><span>Демо</span></header>
    <FeedError error={error} retry={() => setRetry(value => value + 1)} />
    <div className="arena-feed-video-shelf">{items.map(post => {
      const media = post.media.find(item => item.kind.toLowerCase() === "video");
      return <button key={post.id} type="button" className="arena-feed-video-preview" onClick={() => setSelected(post.id)} aria-label={`Смотреть видео: ${titleOf(post)}`}>
        <span className="arena-feed-video-cover">{media.thumbnail_url && <PrivateMedia media={{ ...media, kind: "IMAGE", url: media.thumbnail_url }} decorative />}<span className="arena-feed-video-preview-play"><FeedIcon name="play" size={22} /></span><span className="arena-feed-video-duration">{Math.round(media.duration_seconds || 0)} сек</span></span>
        <b>{titleOf(post)}</b><small>Учебный пример · с субтитрами</small>
      </button>;
    })}</div>
    {active && <FeedDialog title={titleOf(active)} subtitle="Демонстрационный ролик · без звука, с субтитрами" onClose={() => setSelected(null)}>
      <div className="arena-feed-short-player"><PrivateMedia key={active.id} media={active.media.find(media => media.kind.toLowerCase() === "video")} full eager />
        <nav aria-label="Другие видео"><button className="arena-feed-button" type="button" disabled={index === 0} onClick={() => setSelected(items[index - 1].id)}><FeedIcon name="left" size={18} />Назад</button><span>{index + 1} из {items.length}</span><button className="arena-feed-button" type="button" disabled={index === items.length - 1} onClick={() => setSelected(items[index + 1].id)}>Далее<FeedIcon name="right" size={18} /></button></nav>
        <Link className="arena-feed-button" to={`/feed/post/${active.id}`}><FeedIcon name="comment" size={18} />Обсудить и сохранить</Link>
      </div>
    </FeedDialog>}
  </section>;
}
