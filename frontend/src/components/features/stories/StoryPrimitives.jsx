import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

export const STORY_TOPICS = [
  { id: "career", label: "Карьера" },
  { id: "clients", label: "Клиенты и деньги" },
  { id: "team", label: "Команда" },
];
export const STORY_THEMES = ["mint", "amber", "violet", "sky", "rose", "copper"];
export const STORY_STATUS = { draft: "Черновик", pending: "На проверке", published: "Опубликовано", rejected: "Нужны изменения", hidden: "Скрыто" };
export const topicLabel = (topic) => STORY_TOPICS.find(({ id }) => id === topic)?.label || topic;
export const themeName = (theme) => STORY_THEMES.includes(theme) ? theme : "mint";
export const displayName = (author) => author?.display_name || author?.username || "Редакция Арены";
export const formatCount = (count) => new Intl.NumberFormat("ru-RU", { notation: count >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(count || 0);

const iconPaths = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  heart: <path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 6l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.3a5.5 5.5 0 0 0 0-7.8Z" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  comment: <path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-5a10 10 0 0 1-.9-4 8.8 8.8 0 0 1 9-9 9 9 0 0 1 8.5 8.5Z" />,
  share: <><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  play: <path d="m8 4 13 8-13 8V4Z" />,
  flag: <><path d="M5 21V3c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
  retry: <><path d="M3 11a9 9 0 1 1 2.8 7M3 4v7h7" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v3c0 3 6 1 6 7m6-10v3c0 3-6 1-6 7" /></>,
  edit: <><path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" /></>,
};

export function StoryIcon({ name, size = 20, filled = false, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{iconPaths[name] || iconPaths.branch}</svg>;
}

export function StoryAvatar({ author }) {
  return <span className={`stories-avatar${author?.id == null ? " stories-avatar-editorial" : ""}`} aria-hidden="true">{author?.id == null ? <StoryIcon name="branch" size={21} /> : displayName(author).slice(0, 2).toUpperCase()}</span>;
}

export function StoryAuthor({ author, children }) {
  return <div className="stories-author"><StoryAvatar author={author} /><div>{author?.username ? <Link to={`/people/${encodeURIComponent(author.username)}`}>{displayName(author)}</Link> : <b>{displayName(author)}</b>}<span>{author?.id == null ? "Интерактивная редакция" : "Автор истории"}</span></div>{children}</div>;
}

export function StoryError({ error, onRetry }) {
  if (!error) return null;
  return <div className="stories-error" role="alert"><span>{error}</span>{onRetry && <button type="button" onClick={onRetry}>Попробовать снова <StoryIcon name="retry" size={16} /></button>}</div>;
}

export function StoryDialog({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  function trapTab(event) {
    if (event.key !== "Tab") return;
    const elements = [...ref.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter((element) => element.getClientRects().length);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return createPortal(<dialog ref={ref} className={`stories-dialog${wide ? " stories-dialog-wide" : ""}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); closeRef.current(); }} onClick={(event) => { if (event.target === ref.current) closeRef.current(); }} onKeyDown={trapTab}>
    <div className="stories-dialog-panel"><header className="stories-dialog-header"><div><span className="stories-eyebrow">АРЕНА · ИСТОРИИ</span><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="stories-icon-button" type="button" onClick={onClose} aria-label="Закрыть окно"><StoryIcon name="close" /></button></header>{children}</div>
  </dialog>, document.body);
}

export function StoryArtwork({ story, compact = false, number }) {
  return <div className={`stories-art stories-art-${story.topic} stories-theme-${themeName(story.theme)}${compact ? " stories-art-compact" : ""}`}>
    <div className="stories-art-grid" aria-hidden="true" />
    <div className="stories-art-orbit" aria-hidden="true"><i /><i /><i /></div>
    <div className="stories-art-top"><span className="stories-topic">{topicLabel(story.topic)}</span><span className="stories-art-edition">{number ? String(number).padStart(2, "0") : "↗"} / ИСТОРИИ</span></div>
    <div className="stories-art-copy"><span className="stories-art-kicker">У КАЖДОЙ СТОРОНЫ СВОЯ ПРАВДА</span><h2>{story.title || "Здесь начинается ваша история"}</h2></div>
    <div className="stories-art-bottom"><span><StoryIcon name="clock" size={15} /> {Math.max(1, Math.round((story.duration_seconds || 60) / 60))} мин</span><span><StoryIcon name="branch" size={16} /> Решение за вами</span></div>
  </div>;
}

export function StoryMetrics({ metrics, delta }) {
  const labels = { trust: "Доверие", goal: "Цель", control: "Контроль", eq: "Эмпатия" };
  return <div className="stories-metrics" aria-label="Показатели этой попытки">{Object.entries(labels).map(([key, label]) => <div key={key}><span>{label}</span><strong>{metrics?.[key] ?? "—"}{Boolean(delta?.[key]) && <small className={delta[key] > 0 ? "stories-delta-positive" : "stories-delta-negative"}>{delta[key] > 0 ? "+" : ""}{delta[key]}</small>}</strong><div className="stories-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics?.[key] ?? 0}><i style={{ width: `${metrics?.[key] ?? 0}%` }} /></div></div>)}</div>;
}

export function StoryGraphPreview({ graph }) {
  if (!graph) return null;
  return <div className="stories-graph-preview">
    {(graph.roles || []).map((role) => <div className="stories-preview-role" key={role.id}><span className="stories-eyebrow">РОЛЬ</span><h3>{role.label}</h3><p>{role.brief}</p></div>)}
    {Object.entries(graph.nodes || {}).map(([id, node], index) => <section key={id} className="stories-preview-node"><span className="stories-eyebrow">ЭПИЗОД {index + 1} · {node.speaker}</span><p className="stories-preview-quote">{node.text}</p><div>{node.options?.map((option, optionIndex) => <details key={option.id} className="stories-preview-option"><summary><span>{String.fromCharCode(65 + optionIndex)}</span>{option.text}</summary><div><p><b>Почему так:</b> {option.explanation}</p>{graph.endings?.[option.next] ? <><h4>{graph.endings[option.next].title}</h4><p>{graph.endings[option.next].text}</p><p className="stories-preview-lesson">{graph.endings[option.next].lesson}</p></> : <p>Продолжение: {graph.nodes?.[option.next]?.speaker || "следующий эпизод"}</p>}</div></details>)}</div></section>)}
  </div>;
}
