import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { useAuth } from "../auth.jsx";
import { FeedIcon } from "../components/feed/FeedPrimitives.jsx";
import { FeedSearch } from "../components/feed/FeedDiscovery.jsx";
import PostComposer from "../components/feed/PostComposer.jsx";
import PostStream from "../components/feed/PostStream.jsx";
import StoriesBar from "../components/feed/StoriesBar.jsx";
import FeedVideos from "../components/feed/FeedVideos.jsx";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import CommunityContacts from "../components/social/CommunityContacts.jsx";
import "../components/feed/feed.css";

const FriendsWorkspace = lazy(() => import("../components/social/FriendsWorkspace.jsx"));
const SCOPE_LABELS = { for_you: "Публикации", following: "Подписки", friends: "Друзья", popular: "Популярное", companies: "Компании" };

export default function Feed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = ["friends", "messages"].includes(params.get("section")) ? params.get("section") : "posts";
  const requestedScope = params.get("scope") === "company" ? "companies" : params.get("scope");
  const scope = requestedScope in SCOPE_LABELS ? requestedScope : "for_you";
  const companyId = Number(params.get("company_id")) || null;
  const userId = Number(params.get("user_id")) || null;
  const [search, setSearch] = useState(params.get("q") || "");
  const [query, setQuery] = useState(search);
  const [refresh, setRefresh] = useState(0);
  const [created, setCreated] = useState(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const prefill = useMemo(() => params.get("attach") && params.get("id") ? { kind: params.get("attach"), id: params.get("id") } : null, [params.get("attach"), params.get("id")]);

  useEffect(() => { setSearch(params.get("q") || ""); }, [params.get("q")]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!contactsOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setContactsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [contactsOpen]);

  function writeQuery(nextValue, { replace = true } = {}) {
    setSearch(nextValue);
    const next = new URLSearchParams(params);
    if (nextValue.trim()) next.set("q", nextValue.trim()); else next.delete("q");
    setParams(next, { replace });
  }
  function publish(post) {
    setCreated(post);
    if (prefill) { const next = new URLSearchParams(params); next.delete("attach"); next.delete("id"); setParams(next, { replace: true }); }
  }
  function clearSearch() { setSearch(""); setQuery(""); const next = new URLSearchParams(params); next.delete("q"); setParams(next, { replace: true }); }
  function focusComposer() { document.querySelector(".arena-feed-center textarea[aria-label='Текст публикации']")?.focus(); }
  const streamTitle = userId ? userId === user?.id ? "Мои публикации" : "Публикации автора" : companyId ? "Новости компании" : SCOPE_LABELS[scope];

  return <div className="arena-feed-page">
    {section === "messages" ? <div className="product-stage arena-feed-workspace-stage"><button className="product-page-back" type="button" onClick={() => navigate("/feed")} aria-label="Назад"><ArrowLeftIcon size={17} weight="bold" aria-hidden="true" /><span>Назад</span></button></div> : <header className="arena-feed-page-header"><div><h1>{section === "friends" ? "Друзья" : "Сообщество"}</h1>{section !== "posts" && <p>Ваши люди и новые профессиональные связи.</p>}</div>{section === "posts" && <FeedSearch value={search} query={query} onChange={writeQuery} onClear={clearSearch} onChooseTopic={writeQuery} />}</header>}
    {section !== "posts" ? <>{section !== "messages" && <Link className="arena-feed-back" to="/feed"><FeedIcon name="left" size={18} />Вернуться в сообщество</Link>}<Suspense fallback={<p className="community-loading" role="status">Загружаем общение…</p>}><FriendsWorkspace section={section} /></Suspense></> : <>
      {user?.id && !query && !companyId && !userId && <ProfileWall userId={user.id} isSelf summaryOnly />}
      {query && <p className="arena-feed-search-context" role="status">Показываем публикации по запросу «{query}» <button type="button" onClick={clearSearch}>Сбросить</button></p>}
      <button type="button" className="arena-feed-community-trigger" aria-controls="feed-community-panel" aria-expanded={contactsOpen} onClick={() => setContactsOpen(true)}><FeedIcon name="users" size={20} /><span>Друзья и чаты</span></button>
      <div className="arena-feed-layout">
        <main className="arena-feed-center"><StoriesBar /><PostComposer onCreated={publish} prefill={prefill} />{!query && !companyId && !userId && scope === "for_you" && <FeedVideos refresh={refresh} />}<div className="arena-feed-stream-toolbar"><h2>{streamTitle}</h2><button type="button" className="arena-feed-text-button" onClick={() => setRefresh((value) => value + 1)}><FeedIcon name="refresh" size={16} />Обновить</button></div><PostStream scope={scope} userId={userId} companyId={companyId} query={query} refresh={refresh} created={created} emptyTitle={query ? "По этому запросу ничего не найдено" : scope === "following" ? "Найдите своих авторов" : scope === "friends" ? "Друзья ещё не опубликовали записи" : undefined} emptyText={query ? "Попробуйте другое слово, имя или хештег." : scope === "following" ? "Подпишитесь на интересных людей или компании. Их публикации будут появляться здесь." : undefined} emptyAction={query ? <button className="arena-feed-button" type="button" onClick={clearSearch}>Сбросить поиск</button> : scope === "following" || scope === "friends" ? <Link className="arena-feed-button" to="/people">Найти людей<FeedIcon name="users" size={17} /></Link> : <button className="arena-feed-button" type="button" onClick={focusComposer}>Написать публикацию</button>} /></main>
        <aside id="feed-community-panel" className={`arena-feed-side${contactsOpen ? " is-open" : ""}`} aria-label="Друзья и чаты"><button type="button" className="arena-feed-community-close" onClick={() => setContactsOpen(false)} aria-label="Закрыть друзей и чаты"><FeedIcon name="close" size={20} /></button><CommunityContacts /></aside>
      </div>
      {contactsOpen && <button type="button" className="arena-feed-community-backdrop" onClick={() => setContactsOpen(false)} aria-label="Закрыть панель друзей и чатов" />}
    </>}
  </div>;
}
