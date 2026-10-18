import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { storyApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import StoryCard from "../components/features/stories/StoryCard.jsx";
import { StoryError, StoryIcon, STORY_TOPICS, formatCount } from "../components/features/stories/StoryPrimitives.jsx";
import "./stories.css";

const TABS = [
  { id: "for_you", label: "Для вас" },
  { id: "following", label: "Подписки" },
  { id: "saved", label: "Сохранённое" },
  { id: "mine", label: "Мои истории" },
];
const EMPTY = {
  for_you: ["У этой ленты пока чистый лист", "Попробуйте другую тему или уберите слова из поиска."],
  following: ["Здесь будут ваши авторы", "Подпишитесь на автора в общей ленте — его новые истории появятся здесь."],
  saved: ["Соберите свою коллекцию разговоров", "Сохраняйте истории по значку закладки, чтобы вернуться к ним в подходящий момент."],
  mine: ["Ваша история может помочь кому-то", "Вспомните сложный разговор. Дайте читателю выбор — и покажите, к чему он приведёт."],
};

export default function Stories() {
  const { storyId } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const tab = TABS.some(({ id }) => id === params.get("tab")) ? params.get("tab") : "for_you";
  const topic = params.get("topic") || "";
  const [search, setSearch] = useState(params.get("q") || "");
  const [query, setQuery] = useState(search);
  const [items, setItems] = useState([]);
  const [topics, setTopics] = useState(STORY_TOPICS);
  const [stats, setStats] = useState({ completed: 0, saved: 0, following: 0 });
  const [detail, setDetail] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const feed = useRef(null);
  const requestVersion = useRef(0);
  const paginationLock = useRef(false);
  const scrollFrame = useRef(null);
  const currentParams = useRef(params); currentParams.current = params;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = search.trim(); setQuery(value);
      if ((currentParams.current.get("q") || "") !== value) {
        const updated = new URLSearchParams(currentParams.current);
        if (value) updated.set("q", value); else updated.delete("q");
        setParams(updated, { replace: true });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setSearch(params.get("q") || ""); }, [params.get("q")]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true); setError(""); setMoreError(""); setActiveIndex(0); setDetail(null);
    setItems([]); setNextOffset(null); paginationLock.current = false; setLoadingMore(false);
    const request = storyId ? storyApi.get(storyId) : storyApi.list({ tab, topic: topic || undefined, q: query || undefined, limit: 8, offset: 0 });
    request.then((result) => {
      if (version !== requestVersion.current) return;
      if (storyId) { setItems([result.story]); setDetail(result); }
      else { setItems(result.items); setNextOffset(result.next_offset); setStats(result.stats); if (result.topics?.length) setTopics(result.topics); }
      feed.current?.scrollTo({ top: 0, behavior: "instant" });
    }).catch((failure) => { if (version === requestVersion.current) setError(failure.message); }).finally(() => { if (version === requestVersion.current) setLoading(false); });
    return () => { requestVersion.current += 1; };
  }, [storyId, tab, topic, query, retry]);

  useEffect(() => () => { if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current); }, []);

  function filter(key, value) {
    const updated = new URLSearchParams(params);
    if (value) updated.set(key, value); else updated.delete(key);
    setParams(updated, { replace: true });
  }
  async function loadMore() {
    if (paginationLock.current || nextOffset === null || storyId) return;
    paginationLock.current = true; setLoadingMore(true); setMoreError("");
    const version = requestVersion.current;
    try {
      const result = await storyApi.list({ tab, topic: topic || undefined, q: query || undefined, limit: 8, offset: nextOffset });
      if (version !== requestVersion.current) return;
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((old) => old.id === item.id))]); setNextOffset(result.next_offset); setStats(result.stats);
    } catch (failure) { if (version === requestVersion.current) setMoreError(failure.message); }
    finally { if (version === requestVersion.current) { paginationLock.current = false; setLoadingMore(false); } }
  }
  const updateStory = useCallback((updated) => {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }, []);
  const refreshStats = useCallback(async () => {
    try {
      const result = await storyApi.list({ tab: "for_you", limit: 1 });
      setStats(result.stats);
    } catch { /* The feed remains usable when the optional overview cannot refresh. */ }
  }, []);
  function updateFromAction(updated, field) {
    const current = items.find((item) => item.id === updated.id);
    if (field === "like") setItems((previous) => previous.map((item) => item.id === updated.id ? { ...item, liked: updated.liked, counts: { ...item.counts, likes: updated.counts.likes } } : item));
    else if (field === "save") setItems((previous) => previous.map((item) => item.id === updated.id ? { ...item, saved: updated.saved } : item));
    else updateStory(updated);
    if (current && current.saved !== updated.saved) refreshStats();
  }
  function updateFollow(authorId, following) {
    setItems((current) => current.map((item) => item.author?.id === authorId ? { ...item, author: { ...item.author, following } } : item)); refreshStats();
  }
  function updateComments(id, delta) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, counts: { ...item.counts, comments: Math.max(0, (item.counts?.comments || 0) + delta) } } : item));
  }
  async function refreshSummary(id) {
    try { const result = await storyApi.get(id); setItems((previous) => previous.map((item) => item.id === id ? { ...item, counts: { ...item.counts, plays: result.story.counts.plays } } : item)); } catch {}
  }
  function onScroll() {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const element = feed.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const cards = [...element.querySelectorAll(":scope > .stories-card")];
      let nearest = 0, distance = Infinity;
      cards.forEach((card, index) => { const value = Math.abs(card.getBoundingClientRect().top - bounds.top); if (value < distance) { nearest = index; distance = value; } });
      setActiveIndex(nearest);
    });
  }
  function goTo(index) {
    const container = feed.current;
    const card = container?.querySelectorAll(":scope > .stories-card")[index];
    if (!container || !card) return;
    const top = card.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    card.focus({ preventScroll: true }); setActiveIndex(index);
  }
  function keyboard(event) {
    if (!event.target.matches(".stories-feed, .stories-card")) return;
    if (["ArrowDown", "PageDown"].includes(event.key)) { event.preventDefault(); goTo(Math.min(items.length - 1, activeIndex + 1)); }
    if (["ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); goTo(Math.max(0, activeIndex - 1)); }
  }
  const empty = (query || topic) ? EMPTY.for_you : EMPTY[tab];
  return <div className="stories-page">
    <header className="stories-page-header"><div><span className="stories-eyebrow"><i /> ЛЮДИ. ВЫБОРЫ. ПОСЛЕДСТВИЯ.</span><h1>У каждой истории<br /><em>есть ваша сторона.</em></h1><p>Не просто читайте чужие разговоры. Окажитесь внутри.</p></div><Link className="stories-button stories-button-primary stories-create-top" to="/stories/new"><StoryIcon name="plus" size={19} />Создать историю</Link></header>
    {storyId ? <div className="stories-single-back"><Link to="/stories"><StoryIcon name="arrow" size={17} />Вернуться в ленту</Link></div> : <div className="stories-feed-toolbar"><nav className="stories-tabs" aria-label="Подборки историй">{TABS.map(({ id, label }) => <button key={id} type="button" className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => filter("tab", id)}>{label}{id === "saved" && stats.saved > 0 && <span>{formatCount(stats.saved)}</span>}</button>)}</nav><label className="stories-search"><StoryIcon name="search" size={18} /><span className="stories-sr-only">Найти историю</span><input type="search" placeholder="Найти свою ситуацию" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} /></label></div>}
    <div className="stories-layout"><div className="stories-feed-column">
      {!storyId && <div className="stories-topics" aria-label="Темы историй"><button type="button" className={!topic ? "is-active" : ""} aria-pressed={!topic} onClick={() => filter("topic", "")}>Все истории</button>{topics.map((item) => <button key={item.id} type="button" className={topic === item.id ? "is-active" : ""} aria-pressed={topic === item.id} onClick={() => filter("topic", item.id)}>{item.label}</button>)}</div>}
      <div className="stories-feed" ref={feed} onScroll={onScroll} onKeyDown={keyboard} role="region" aria-label="Лента интерактивных историй" tabIndex={0} aria-busy={loading}>
        {loading && <div className="stories-skeleton" role="status"><div className="stories-skeleton-author" /><div className="stories-skeleton-art" /><div className="stories-skeleton-line" /><div className="stories-skeleton-line stories-skeleton-short" /><div className="stories-skeleton-choices" /><span className="stories-sr-only">Загружаем истории…</span></div>}
        {!loading && error && <div className="stories-state"><StoryIcon name="branch" size={44} /><h2>История пока не открылась</h2><StoryError error={error} onRetry={() => setRetry((value) => value + 1)} />{storyId && <Link className="stories-button stories-button-secondary" to="/stories">Открыть общую ленту</Link>}</div>}
        {!loading && !error && !items.length && <div className="stories-state"><div className="stories-empty-art" aria-hidden="true"><StoryIcon name={tab === "saved" ? "bookmark" : "branch"} size={48} /></div><span className="stories-eyebrow">ЭТО ТОЛЬКО НАЧАЛО</span><h2>{empty[0]}</h2><p>{empty[1]}</p>{tab === "mine" ? <Link className="stories-button stories-button-primary" to="/stories/new">Написать первую историю <StoryIcon name="plus" size={18} /></Link> : <button className="stories-button stories-button-secondary" onClick={() => { setSearch(""); setParams({}, { replace: true }); }}>Смотреть все истории <StoryIcon name="arrow" size={18} /></button>}</div>}
        {!loading && !error && items.map((story, index) => <StoryCard key={story.id} story={story} index={index} isActive={activeIndex === index} initialAttempt={detail?.attempt} hasDetails={Boolean(detail)} onUpdate={updateFromAction} onFollow={updateFollow} onCommentsChange={updateComments} onStarted={() => refreshSummary(story.id)} onCompleted={refreshStats} />)}
        {!loading && items.length > 0 && !storyId && <div className="stories-feed-end">{moreError && <StoryError error={moreError} onRetry={loadMore} />}{nextOffset !== null ? <button className="stories-button stories-button-secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Ищем продолжение…" : "Ещё истории"}<StoryIcon name="down" size={17} /></button> : <><StoryIcon name="check" size={24} /><p>Пока всё. Но разговор продолжается.</p><Link to="/stories/new">Добавить свою историю <StoryIcon name="arrow" size={16} /></Link></>}</div>}
      </div>
      {items.length > 1 && <nav className="stories-feed-controls" aria-label="Листать истории"><span><b>{String(activeIndex + 1).padStart(2, "0")}</b> / {String(items.length).padStart(2, "0")} <span>Листайте, чтобы сменить точку зрения</span></span><div><button type="button" className="stories-icon-button" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)} aria-label="Предыдущая история"><StoryIcon name="up" /></button><button type="button" className="stories-icon-button" disabled={activeIndex === items.length - 1} onClick={() => goTo(activeIndex + 1)} aria-label="Следующая история"><StoryIcon name="down" /></button></div></nav>}
    </div>
    <aside className="stories-context-rail" aria-label="О пространстве историй"><section className="stories-rail-intro"><div className="stories-rail-symbol" aria-hidden="true"><span>«</span><StoryIcon name="branch" size={34} /></div><span className="stories-eyebrow">ДРУГАЯ СТОРОНА РАЗГОВОРА</span><h2>Чужая ситуация.<br />Ваше решение.</h2><p>Здесь нет зрителей. Есть люди, которые пробуют понять друг друга.</p><ol><li><span>01</span><div><b>Выберите сторону</b><p>У каждого участника — свои интересы.</p></div></li><li><span>02</span><div><b>Скажите по-своему</b><p>Реплика меняет ход истории.</p></div></li><li><span>03</span><div><b>Посмотрите иначе</b><p>Переиграйте и обсудите развилку.</p></div></li></ol></section>
      {!storyId && <section className="stories-personal"><span className="stories-eyebrow">ВАШЕ ПРОСТРАНСТВО</span><div><span><b>{formatCount(stats.completed)}</b>пройдено</span><Link to="/stories?tab=saved"><b>{formatCount(stats.saved)}</b>сохранено</Link><Link to="/stories?tab=following"><b>{formatCount(stats.following)}</b>подписки</Link></div></section>}
      <Link className="stories-create-note" to="/stories/new"><span className="stories-create-note-icon"><StoryIcon name="edit" size={24} /></span><div><b>Знакомая ситуация?</b><p>Превратите свой опыт в историю с выбором.</p></div><StoryIcon name="arrow" size={18} /></Link><p className="stories-rail-footnote">Авторские истории проходят проверку. Берегите чужие границы и личные данные.</p>{user?.is_admin && <Link className="stories-admin-link" to="/admin/stories">Модерация историй <StoryIcon name="arrow" size={16} /></Link>}
    </aside></div>
  </div>;
}
