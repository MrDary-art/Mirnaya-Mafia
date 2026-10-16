import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FeedIcon } from "../components/feed/FeedPrimitives.jsx";
import PostStream from "../components/feed/PostStream.jsx";
import "../components/feed/feed.css";

export default function SavedPosts() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [query, setQuery] = useState(search);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  function change(value) { setSearch(value); const next = new URLSearchParams(params); if (value.trim()) next.set("q", value.trim()); else next.delete("q"); setParams(next, { replace: true }); }
  return <div className="arena-feed-page arena-feed-saved"><header className="arena-feed-page-header"><div><h1>Моя библиотека</h1><p>Сохранённые публикации и тематические подборки — в одном месте.</p></div><div className="arena-feed-library-actions"><label className="arena-feed-search"><FeedIcon name="search" size={18} /><span className="arena-feed-sr-only">Поиск в сохранённом</span><input type="search" value={search} onChange={(event) => change(event.target.value)} placeholder="Найти в сохранённом" /></label><Link className="arena-feed-button" to="/collections"><FeedIcon name="book" size={19} />Подборки</Link></div></header><div className="arena-feed-saved-body"><Link className="arena-feed-back" to="/feed"><FeedIcon name="left" size={18} />В ленту</Link>{query && <p className="arena-feed-search-context" role="status">Поиск в библиотеке: «{query}» <button type="button" onClick={() => change("")}>Сбросить</button></p>}<PostStream saved query={query} emptyTitle={query ? "В библиотеке ничего не найдено" : "Соберите свою библиотеку опыта"} emptyText={query ? "Попробуйте другое слово или откройте все сохранённые публикации." : "Нажмите на закладку под публикацией. Позже вы сможете добавить её в одну или несколько подборок."} emptyAction={query ? <button className="arena-feed-button" type="button" onClick={() => change("")}>Показать всё</button> : <Link className="arena-feed-button is-primary" to="/feed">Найти полезное <FeedIcon name="right" size={18} /></Link>} /></div></div>;
}
