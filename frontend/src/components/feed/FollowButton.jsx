import { useRef, useState } from "react";
import { feedApi, followChanged } from "./feedApi.js";
import { FeedIcon } from "./FeedPrimitives.jsx";

export default function FollowButton({ id, following = false, company = false, onChange, onError, compact = false }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function toggle() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await feedApi.follow(id, !following, company); followChanged(id, !following, company); onChange?.(!following); if (following) window.dispatchEvent(new Event("arena:feed-access-changed")); }
    catch (error) { onError?.(error.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <button type="button" className={`arena-feed-follow${following ? " is-following" : ""}${compact ? " is-compact" : ""}`} onClick={toggle} disabled={busy} aria-pressed={following} aria-label={following ? "Отписаться" : "Подписаться"}><FeedIcon name={following ? "check" : "plus"} size={16} /><span>{busy ? "…" : following ? "Вы подписаны" : "Подписаться"}</span></button>;
}
