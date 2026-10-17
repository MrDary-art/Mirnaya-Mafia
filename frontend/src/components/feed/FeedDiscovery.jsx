import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import FollowButton from "./FollowButton.jsx";
import { FeedAvatar, FeedError, FeedIcon, nameOf } from "./FeedPrimitives.jsx";
import { feedApi } from "./feedApi.js";

const EMPTY_RESULTS = { posts: [], people: [], companies: [], topics: [] };
const STARTER_TOPICS = ["#переговоры", "#обратнаясвязь", "#сложныйразговор"];

function topicsFrom(posts, limit = 6) {
  const counts = new Map();
  posts.forEach((post) => {
    for (const match of String(post.body || "").matchAll(/#[\p{L}\p{N}_]{2,80}/gu)) {
      const topic = match[0].toLocaleLowerCase("ru-RU");
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")).slice(0, limit).map(([topic]) => topic);
}

export function FeedSearch({ value, query, onChange, onClear, onChooseTopic }) {
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("all");
  const version = useRef(0);
  const root = useRef(null);
  const normalized = query.trim();

  useEffect(() => {
    if (normalized.length < 2) {
      version.current += 1;
      setResults(EMPTY_RESULTS); setLoading(false); setError("");
      return undefined;
    }
    const current = ++version.current;
    setLoading(true); setError("");
    Promise.allSettled([
      feedApi.list({ q: normalized, limit: 4 }),
      api(`/api/social/people?q=${encodeURIComponent(normalized)}`),
      api(`/api/company/search?q=${encodeURIComponent(normalized)}`),
    ]).then(([posts, people, companies]) => {
      if (current !== version.current) return;
      const postItems = posts.status === "fulfilled" ? posts.value.items || [] : [];
      const directTopic = normalized.startsWith("#") ? normalized.split(/\s/, 1)[0] : "";
      setResults({
        posts: postItems.slice(0, 4),
        people: people.status === "fulfilled" ? people.value.slice(0, 4) : [],
        companies: companies.status === "fulfilled" ? companies.value.slice(0, 4) : [],
        topics: [...new Set([directTopic, ...topicsFrom(postItems, 4)].filter(Boolean))],
      });
      if ([posts, people, companies].every((result) => result.status === "rejected")) setError("Поиск временно недоступен. Попробуйте ещё раз.");
    }).finally(() => { if (current === version.current) setLoading(false); });
    return () => { version.current += 1; };
  }, [normalized]);

  const counts = { posts: results.posts.length, people: results.people.length, companies: results.companies.length, topics: results.topics.length };
  const resultCount = kind === "all" ? Object.values(counts).reduce((sum, value) => sum + value, 0) : counts[kind];
  const showPanel = open && normalized.length >= 2;
  return <div className="arena-feed-search-shell" ref={root} role="search" onFocus={() => setOpen(true)} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="arena-feed-search-wrap">
      <label className="arena-feed-search"><FeedIcon name="search" size={19} /><span className="arena-feed-sr-only">Поиск в сообществе</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.currentTarget.blur(); } }} onFocus={() => setOpen(true)} placeholder="Публикации, люди, темы" maxLength={100} aria-expanded={showPanel} aria-controls="arena-feed-search-results" /></label>
      {value && <button type="button" className="arena-feed-search-clear" aria-label="Очистить поиск" onClick={() => { onClear(); setOpen(false); }}><FeedIcon name="close" size={18} /></button>}
    </div>
    {showPanel && <section className="arena-feed-search-results" id="arena-feed-search-results" aria-label="Результаты поиска">
      <header><b>{loading ? "Ищем…" : `Найдено: ${resultCount}`}</b><span>{kind === "all" ? "по всем разделам" : "в выбранном разделе"}</span></header>
      <nav className="arena-feed-search-types" aria-label="Тип результатов">{[["all", "Все"], ["posts", "Публикации"], ["people", "Люди"], ["companies", "Компании"], ["topics", "Темы"]].map(([id, label]) => <button type="button" key={id} aria-pressed={kind === id} onClick={() => setKind(id)}>{label}</button>)}</nav>
      <FeedError error={error} />
      {!loading && !error && resultCount === 0 && <p className="arena-feed-search-empty">Ничего не найдено. Попробуйте имя, компанию или хештег.</p>}
      {(kind === "all" || kind === "topics") && results.topics.length > 0 && <div className="arena-feed-search-group"><h2>Темы</h2><div className="arena-feed-topic-list">{results.topics.map((topic) => <button type="button" key={topic} onClick={() => { onChooseTopic(topic); setOpen(false); }}>{topic}</button>)}</div></div>}
      {(kind === "all" || kind === "people") && results.people.length > 0 && <div className="arena-feed-search-group"><h2>Люди</h2>{results.people.map((person) => <Link key={person.id} to={person.path || `/people/${encodeURIComponent(person.username)}`} onClick={() => setOpen(false)}><FeedAvatar author={person} /><span><b>{nameOf(person)}</b><small>@{person.username}</small></span><FeedIcon name="right" size={16} /></Link>)}</div>}
      {(kind === "all" || kind === "companies") && results.companies.length > 0 && <div className="arena-feed-search-group"><h2>Компании</h2>{results.companies.map((company) => <Link key={company.id} to={`/feed?scope=companies&company_id=${company.id}`} onClick={() => setOpen(false)}><span className="arena-feed-company-avatar"><FeedIcon name="company" size={20} /></span><span><b>{company.name}</b><small>{company.industry || "Компания на Арене"}</small></span><FeedIcon name="right" size={16} /></Link>)}</div>}
      {(kind === "all" || kind === "posts") && results.posts.length > 0 && <div className="arena-feed-search-group"><h2>Публикации</h2>{results.posts.map((post) => <Link key={post.id} to={`/feed/post/${post.id}`} onClick={() => setOpen(false)}><span className="arena-feed-search-post-icon"><FeedIcon name="book" size={18} /></span><span><b>{post.company?.name || nameOf(post.author)}</b><small>{post.body?.trim().slice(0, 84) || "Публикация с материалом"}</small></span><FeedIcon name="right" size={16} /></Link>)}</div>}
    </section>}
  </div>;
}

function SuggestedAuthor({ item }) {
  const [following, setFollowing] = useState(item.following);
  return <div className="arena-feed-suggestion"><Link to={item.path} aria-label={`Профиль: ${item.name}`}><FeedAvatar author={item.author} /></Link><div><Link to={item.path}>{item.name}</Link><span>{item.reason}</span></div><FollowButton id={item.id} following={following} onChange={setFollowing} compact /></div>;
}

export function FeedDiscoveryRail({ scenario, onChooseTopic }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    feedApi.list({ scope: "popular", limit: 16 }).then((result) => { if (!cancelled) setPosts(result.items || []); }).catch(() => { if (!cancelled) setError("Не удалось обновить рекомендации."); });
    return () => { cancelled = true; };
  }, [retry]);
  const suggestions = useMemo(() => {
    const seen = new Set();
    return posts.filter((post) => !post.company && post.author?.id !== user?.id && !seen.has(post.author?.id) && seen.add(post.author.id)).slice(0, 3).map((post) => ({
      id: post.author.id,
      author: post.author,
      name: nameOf(post.author),
      path: post.author.path || `/people/${encodeURIComponent(post.author.username)}`,
      following: Boolean(post.viewer_state?.following_author),
      reason: post.counts?.comments ? `${post.counts.comments} ответов в обсуждении` : "Пишет о переговорах",
    }));
  }, [posts, user?.id]);
  const liveTopics = useMemo(() => topicsFrom(posts), [posts]);
  const topics = liveTopics.length ? liveTopics : STARTER_TOPICS;
  return <>
    <section className="arena-feed-recommendations"><header><h2>Кого читать</h2><Link to="/people">Все</Link></header>{suggestions.length ? suggestions.map((item) => <SuggestedAuthor key={item.id} item={item} />) : !error && <p>Рекомендации появятся после первых публикаций сообщества.</p>}<FeedError error={error} retry={() => setRetry((value) => value + 1)} /></section>
    <section className="arena-feed-trends"><h2>{liveTopics.length ? "Обсуждают сейчас" : "Темы для старта"}</h2><div className="arena-feed-topic-list">{topics.map((topic) => <button type="button" key={topic} onClick={() => onChooseTopic(topic)}>{topic}</button>)}</div></section>
    <section className="arena-feed-practice-card"><h2>Из обсуждения — в практику</h2><p>Проверьте идею в безопасном сценарии и вернитесь с результатом.</p>{scenario && <Link to={`/setup?preset=${encodeURIComponent(scenario.id)}`}><span><small>Сценарий</small><b>{scenario.title}</b></span><FeedIcon name="right" size={18} /></Link>}<Link to="/stories"><span><small>Истории</small><b>Выберите следующую развилку</b></span><FeedIcon name="right" size={18} /></Link></section>
  </>;
}
