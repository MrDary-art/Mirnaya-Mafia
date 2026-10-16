import CouncilUpcoming from "../components/CouncilUpcoming.jsx";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { FeedError, FeedIcon, LinkedContent } from "../components/feed/FeedPrimitives.jsx";
import PostComposer from "../components/feed/PostComposer.jsx";
import PostStream from "../components/feed/PostStream.jsx";
import StoriesBar from "../components/feed/StoriesBar.jsx";
import FeedVideos from "../components/feed/FeedVideos.jsx";
import CommunityTabs from "../components/social/CommunityTabs.jsx";
import CommunityContacts from "../components/social/CommunityContacts.jsx";
import { communityHref, communitySection } from "../components/social/communityNavigation.js";
import "../components/feed/feed.css";

const FriendsWorkspace = lazy(() => import("../components/social/FriendsWorkspace.jsx"));
const SCOPES = [["for_you", "Для вас", "globe"], ["following", "Подписки", "follow"], ["friends", "От друзей", "users"], ["companies", "Компании", "company"], ["popular", "Популярное", "heart"]];

export default function Feed() {
  const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const section = communitySection(params.toString());
  const scope = SCOPES.some(([id]) => id === params.get("scope")) ? params.get("scope") : params.get("scope") === "company" ? "company" : "for_you";
  const companyId = Number(params.get("company_id")) || null; const userId = Number(params.get("user_id")) || null;
  const [search, setSearch] = useState(params.get("q") || ""); const [query, setQuery] = useState(search); const [refresh, setRefresh] = useState(0); const [created, setCreated] = useState(null);
  const [resources, setResources] = useState({ scenario: null, collections: [] }); const [resourceError, setResourceError] = useState(""); const [resourceRetry, setResourceRetry] = useState(0);
  const prefill = useMemo(() => params.get("attach") && params.get("id") ? { kind: params.get("attach"), id: params.get("id") } : null, [params.get("attach"), params.get("id")]);
  useEffect(() => { setSearch(params.get("q") || ""); }, [params.get("q")]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (section !== "posts") return undefined;
    let cancelled = false; setResourceError("");
    Promise.allSettled([api("/api/scenarios"), api("/api/social/collections?scope=public")]).then(([scenarios, collections]) => {
      if (cancelled) return;
      setResources({ scenario: scenarios.status === "fulfilled" ? scenarios.value[0] : null, collections: collections.status === "fulfilled" ? (collections.value.items || []).filter((item) => item.audience === "PUBLIC").slice(0, 3) : [] });
      if (scenarios.status === "rejected" && collections.status === "rejected") setResourceError("Материалы временно недоступны.");
    }); return () => { cancelled = true; };
  }, [resourceRetry, section]);
  function chooseScope(value) { const next = new URLSearchParams(params); next.set("scope", value); next.delete("company_id"); next.delete("user_id"); if (search.trim()) next.set("q", search.trim()); else next.delete("q"); setParams(next); setCreated(null); }
  function publish(post) { setCreated(post); if (prefill) { const next = new URLSearchParams(params); next.delete("attach"); next.delete("id"); setParams(next, { replace: true }); } }
  function clearSearch() { setSearch(""); setQuery(""); const next = new URLSearchParams(params); next.delete("q"); setParams(next, { replace: true }); }
  function focusComposer() { const field = document.querySelector(".arena-feed-center textarea[aria-label='Текст публикации']"); field?.focus(); }
  const scenario = resources.scenario;
  return <div className="arena-feed-page"><header className="arena-feed-page-header"><div><h1>Лента</h1><p>{section === "posts" ? "Опыт, который становится общим." : section === "friends" ? "Ваши люди, новые знакомства и заявки." : "Продолжайте разговор, не уходя из сообщества."}</p></div>{section === "posts" && <div className="arena-feed-search-wrap"><label className="arena-feed-search"><FeedIcon name="search" size={19} /><span className="arena-feed-sr-only">Поиск публикаций</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); const next = new URLSearchParams(params); if (event.target.value) next.set("q", event.target.value); else next.delete("q"); setParams(next, { replace: true }); }} placeholder="Поиск по публикациям" maxLength={100} /></label>{search && <button type="button" className="arena-feed-search-clear" aria-label="Очистить поиск" onClick={clearSearch}><FeedIcon name="close" size={18} /></button>}</div>}</header>
    <CommunityTabs />
    {section !== "posts" ? <Suspense fallback={<p className="community-loading" role="status">Загружаем общение…</p>}><FriendsWorkspace section={section} /></Suspense> : <>
    <div className="arena-feed-navigation"><nav className="arena-feed-filters" aria-label="Разделы ленты">{SCOPES.map(([id, label, icon]) => <button type="button" key={id} className={scope === id && !userId && !companyId ? "is-active" : ""} onClick={() => chooseScope(id)} aria-pressed={scope === id && !userId && !companyId}><FeedIcon name={icon} size={18} />{label}</button>)}</nav><label className="arena-feed-mobile-filter"><span className="arena-feed-sr-only">Фильтр ленты</span><select value={userId || companyId ? "context" : scope} onChange={event => chooseScope(event.target.value)}>{(userId || companyId) && <option value="context">{companyId ? "Новости компании" : "Стена автора"}</option>}{SCOPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><nav className="arena-feed-quick-links" aria-label="Моя библиотека"><Link to="/saved" aria-label="Сохранённое" title="Сохранённое"><FeedIcon name="bookmark" size={18} /><span>Сохранённое</span></Link><Link to="/collections" aria-label="Мои подборки" title="Мои подборки"><FeedIcon name="book" size={18} /><span>Подборки</span></Link><Link to="/profile" aria-label="Моя стена" title="Моя стена"><FeedIcon name="users" size={18} /><span>Моя стена</span></Link><button type="button" onClick={focusComposer} aria-label="Написать публикацию" title="Написать публикацию"><FeedIcon name="plus" size={18} /><span>Написать</span></button></nav></div>
    {query && <p className="arena-feed-search-context" role="status">Поиск: «{query}»</p>}
    <div className="arena-feed-layout"><div className="arena-feed-center"><StoriesBar /><PostComposer onCreated={publish} prefill={prefill} />{!query && !companyId && !userId && scope === "for_you" && <FeedVideos refresh={refresh} />}<div className="arena-feed-stream-toolbar"><h2>{userId ? userId === user?.id ? "Мои публикации" : "Публикации автора" : companyId ? "Новости компании" : SCOPES.find(([id]) => id === scope)?.[1] || "Публикации"}</h2><button type="button" className="arena-feed-text-button" onClick={() => setRefresh((value) => value + 1)}><FeedIcon name="refresh" size={16} />Обновить ленту</button></div><PostStream scope={scope} userId={userId} companyId={companyId} query={query} refresh={refresh} created={created} emptyTitle={query ? "По этому запросу ничего не найдено" : scope === "following" ? "Найдите своих авторов" : scope === "friends" ? "Друзья ещё не опубликовали записи" : undefined} emptyText={query ? "Попробуйте другое слово или хештег." : scope === "following" ? "Подпишитесь на интересных людей или компании. Их публикации будут появляться здесь." : undefined} emptyAction={query ? <button className="arena-feed-button" type="button" onClick={clearSearch}>Сбросить поиск</button> : scope === "following" || scope === "friends" ? <Link className="arena-feed-button" to="/people">Найти людей<FeedIcon name="users" size={17} /></Link> : <button className="arena-feed-button" type="button" onClick={focusComposer}>Написать публикацию</button>} /></div>
    <aside className="arena-feed-side" aria-label="Материалы сообщества"><CouncilUpcoming /><CommunityContacts /><section><h2>Из разговора — в практику</h2><p>Обсудили приём? Попробуйте его в переговорах.</p>{scenario && <LinkedContent content={{ kind: "SCENARIO", id: scenario.id, title: scenario.title, path: `/setup?preset=${encodeURIComponent(scenario.id)}`, available: true }} />}<Link className="arena-feed-side-link" to="/scenarios">Все сценарии <FeedIcon name="right" size={16} /></Link><Link className="arena-feed-side-link" to="/stories">Интерактивные истории <FeedIcon name="right" size={16} /></Link></section>{resources.collections.length > 0 && <section><h2>Подборки сообщества</h2>{resources.collections.map((collection) => <Link className="arena-feed-collection-link" key={collection.id} to={`/collections/${collection.id}`}><FeedIcon name="book" size={18} /><span>{collection.title}</span><FeedIcon name="right" size={15} /></Link>)}</section>}<section className="arena-feed-community-note"><FeedIcon name="comment" size={26} /><h2>Сначала — понять.</h2><p>Обсуждайте идеи, уважайте людей и берегите чужие личные данные.</p><Link className="arena-feed-side-link" to={communityHref("friends")}>Найти собеседника <FeedIcon name="right" size={16} /></Link></section><FeedError error={resourceError} retry={() => setResourceRetry(value => value + 1)} /><p className="arena-feed-side-footer">Арена переговоров · Сообщество</p></aside></div>
    </>}
  </div>;
}
