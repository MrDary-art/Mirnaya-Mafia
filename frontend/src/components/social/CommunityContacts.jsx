import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { FeedAvatar, FeedError, FeedIcon, nameOf } from "../feed/FeedPrimitives.jsx";
import { communityHref } from "./communityNavigation.js";
import "./community.css";

export default function CommunityContacts() {
  const { user } = useAuth();
  const [overview, setOverview] = useState({ friends: [], dialogs: [], unread: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false, version = 0;
    setOverview({ friends: [], dialogs: [], unread: 0 }); setLoading(true); setError("");
    const load = async () => {
      if (document.hidden) return;
      const current = ++version;
      const [friends, dialogs, unread] = await Promise.allSettled([api("/api/social/friends"), api("/api/social/dialogs"), api("/api/social/unread-count")]);
      if (cancelled || current !== version) return;
      setOverview(previous => ({ friends: friends.status === "fulfilled" ? friends.value : previous.friends, dialogs: dialogs.status === "fulfilled" ? dialogs.value : previous.dialogs, unread: unread.status === "fulfilled" ? unread.value.count : previous.unread }));
      setError([friends, dialogs, unread].some(result => result.status === "rejected") ? "Не удалось обновить часть общения." : ""); setLoading(false);
    };
    load();
    window.addEventListener("focus", load); window.addEventListener("arena:friends-changed", load); window.addEventListener("arena:notifications-changed", load); document.addEventListener("visibilitychange", load);
    const timer = window.setInterval(load, 30000);
    return () => { cancelled = true; version++; clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("arena:friends-changed", load); window.removeEventListener("arena:notifications-changed", load); document.removeEventListener("visibilitychange", load); };
  }, [user?.id, retry]);
  const friends = overview.friends.filter(person => person.relationship === "FRIENDS");
  const incoming = overview.friends.filter(person => person.relationship === "REQUEST_RECEIVED").length;
  const contacts = overview.dialogs.length ? overview.dialogs.slice(0, 3) : friends.slice(0, 3);
  return <section className="community-contacts" aria-label="Ваше общение">
    <header><h2>Ваше общение</h2><FeedIcon name="comment" size={20} /></header>
    <nav className="community-contacts-links" aria-label="Друзья и сообщения"><Link to={communityHref("friends")}><span>Друзья</span><b>{loading ? "…" : friends.length}</b></Link><Link to={communityHref("messages")}><span>Сообщения</span>{!loading && overview.unread > 0 && <b className="is-unread">{overview.unread > 99 ? "99+" : overview.unread}</b>}<FeedIcon name="right" size={16} /></Link></nav>
    {!loading && incoming > 0 && <Link className="community-requests-link" to={communityHref("friends")}>Входящие заявки: {incoming}<FeedIcon name="right" size={16} /></Link>}
    <FeedError error={error} retry={() => setRetry(value => value + 1)} />
    {loading ? <p role="status">Загружаем общение…</p> : contacts.length ? <div className="community-contact-preview">{contacts.map(person => <Link key={person.id} to={communityHref("messages", { chatId: person.id })} aria-label={`Переписка с ${nameOf(person)}`}><FeedAvatar author={person} size="sm" /><span className="community-contact-copy"><b>{nameOf(person)}</b><small>{person.preview || "Начать разговор"}</small></span>{person.unread > 0 && <em>{person.unread > 99 ? "99+" : person.unread}</em>}</Link>)}</div> : <p>Здесь будут ваши друзья и последние разговоры.</p>}
    <Link className="arena-feed-side-link" to={communityHref("friends")}>Найти друзей<FeedIcon name="follow" size={16} /></Link>
  </section>;
}
