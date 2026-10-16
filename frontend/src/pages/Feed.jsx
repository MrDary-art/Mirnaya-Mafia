import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { FeedIcon } from "../components/feed/FeedPrimitives.jsx";
import { FeedDiscoveryRail, FeedSearch } from "../components/feed/FeedDiscovery.jsx";
import PostComposer from "../components/feed/PostComposer.jsx";
import PostStream from "../components/feed/PostStream.jsx";
import StoriesBar from "../components/feed/StoriesBar.jsx";
import FeedVideos from "../components/feed/FeedVideos.jsx";
import CommunityTabs from "../components/social/CommunityTabs.jsx";
import CommunityContacts from "../components/social/CommunityContacts.jsx";
import "../components/feed/feed.css";

const FriendsWorkspace = lazy(() => import("../components/social/FriendsWorkspace.jsx"));
const PRIMARY_SCOPES = [["for_you", "Для вас"], ["following", "Подписки"], ["friends", "Друзья"]];
const EXTRA_SCOPES = [["popular", "Популярное", "heart"], ["companies", "Компании", "company"]];
const ALL_SCOPES = [...PRIMARY_SCOPES, ...EXTRA_SCOPES];

export default function Feed() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const section = ["friends", "messages"].includes(params.get("section")) ? params.get("section") : "posts";
  const requestedScope = params.get("scope") === "company" ? "companies" : params.get("scope");
  const scope = ALL_SCOPES.some(([id]) => id === requestedScope) ? requestedScope : "for_you";
  const companyId = Number(params.get("company_id")) || null;
  const userId = Number(params.get("user_id")) || null;
  const [search, setSearch] = useState(params.get("q") || "");
  const [query, setQuery] = useState(search);
  const [refresh, setRefresh] = useState(0);
  const [created, setCreated] = useState(null);
  const [scenario, setScenario] = useState(null);
  const prefill = useMemo(() => params.get("attach") && params.get("id") ? { kind: params.get("attach"), id: params.get("id") } : null, [params.get("attach"), params.get("id")]);

  useEffect(() => { setSearch(params.get("q") || ""); }, [params.get("q")]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (section !== "posts") return undefined;
    let cancelled = false;
    api("/api/scenarios").then((items) => { if (!cancelled) setScenario(items[0] || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [section]);

  function writeQuery(nextValue, { replace = true } = {}) {
    setSearch(nextValue);
    const next = new URLSearchParams(params);
    if (nextValue.trim()) next.set("q", nextValue.trim()); else next.delete("q");
    setParams(next, { replace });
  }
  function chooseScope(value) {
    const next = new URLSearchParams(params);
    next.set("scope", value); next.delete("company_id"); next.delete("user_id");
    if (search.trim()) next.set("q", search.trim()); else next.delete("q");
    setParams(next); setCreated(null);
  }
  function publish(post) {
    setCreated(post);
    if (prefill) { const next = new URLSearchParams(params); next.delete("attach"); next.delete("id"); setParams(next, { replace: true }); }
  }
  function clearSearch() { setSearch(""); setQuery(""); const next = new URLSearchParams(params); next.delete("q"); setParams(next, { replace: true }); }
  function focusComposer() { document.querySelector(".arena-feed-center textarea[aria-label='Текст публикации']")?.focus(); }
  const streamTitle = userId ? userId === user?.id ? "Мои публикации" : "Публикации автора" : companyId ? "Новости компании" : ALL_SCOPES.find(([id]) => id === scope)?.[1] || "Публикации";
  const extraActive = EXTRA_SCOPES.find(([id]) => id === scope)?.[1];

  return <div className="arena-feed-page">
    <header className="arena-feed-page-header"><div><h1>Лента</h1>{section !== "posts" && <p>{section === "friends" ? "Ваши люди и новые профессиональные связи." : "Продолжайте разговор, не покидая сообщество."}</p>}</div>{section === "posts" && <FeedSearch value={search} query={query} onChange={writeQuery} onClear={clearSearch} onChooseTopic={writeQuery} />}</header>
    <CommunityTabs />
    {section !== "posts" ? <Suspense fallback={<p className="community-loading" role="status">Загружаем общение…</p>}><FriendsWorkspace section={section} /></Suspense> : <>
      <div className="arena-feed-navigation">
        <nav className="arena-feed-filters" aria-label="Основные разделы ленты">{PRIMARY_SCOPES.map(([id, label]) => <button type="button" key={id} className={scope === id && !userId && !companyId ? "is-active" : ""} onClick={() => chooseScope(id)} aria-pressed={scope === id && !userId && !companyId}>{label}</button>)}</nav>
        <details className={`arena-feed-more-filter${extraActive ? " is-active" : ""}`}><summary><FeedIcon name="more" size={20} /><span>{extraActive || "Ещё"}</span></summary><div>{EXTRA_SCOPES.map(([id, label, icon]) => <button type="button" key={id} className={scope === id && !companyId ? "is-active" : ""} onClick={(event) => { chooseScope(id); event.currentTarget.closest("details")?.removeAttribute("open"); }}><FeedIcon name={icon} size={18} />{label}</button>)}</div></details>
        <nav className="arena-feed-quick-links" aria-label="Действия в ленте"><Link to="/saved"><FeedIcon name="bookmark" size={18} /><span>Моя библиотека</span></Link><Link to="/profile"><FeedIcon name="users" size={18} /><span>Моя стена</span></Link><button type="button" onClick={focusComposer}><FeedIcon name="plus" size={18} /><span>Написать</span></button></nav>
      </div>
      {query && <p className="arena-feed-search-context" role="status">Показываем публикации по запросу «{query}» <button type="button" onClick={clearSearch}>Сбросить</button></p>}
      <div className="arena-feed-layout">
        <main className="arena-feed-center"><StoriesBar /><PostComposer onCreated={publish} prefill={prefill} />{!query && !companyId && !userId && scope === "for_you" && <FeedVideos refresh={refresh} />}<div className="arena-feed-stream-toolbar"><h2>{streamTitle}</h2><button type="button" className="arena-feed-text-button" onClick={() => setRefresh((value) => value + 1)}><FeedIcon name="refresh" size={16} />Обновить</button></div><PostStream scope={scope} userId={userId} companyId={companyId} query={query} refresh={refresh} created={created} emptyTitle={query ? "По этому запросу ничего не найдено" : scope === "following" ? "Найдите своих авторов" : scope === "friends" ? "Друзья ещё не опубликовали записи" : undefined} emptyText={query ? "Попробуйте другое слово, имя или хештег." : scope === "following" ? "Подпишитесь на интересных людей или компании. Их публикации будут появляться здесь." : undefined} emptyAction={query ? <button className="arena-feed-button" type="button" onClick={clearSearch}>Сбросить поиск</button> : scope === "following" || scope === "friends" ? <Link className="arena-feed-button" to="/people">Найти людей<FeedIcon name="users" size={17} /></Link> : <button className="arena-feed-button" type="button" onClick={focusComposer}>Написать публикацию</button>} /></main>
        <aside className="arena-feed-side" aria-label="Рекомендации сообщества"><CommunityContacts /><FeedDiscoveryRail scenario={scenario} onChooseTopic={writeQuery} /><p className="arena-feed-side-footer">Арена переговоров · Сообщество</p></aside>
      </div>
    </>}
  </div>;
}
