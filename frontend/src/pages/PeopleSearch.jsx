import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { BadgeArt, statusLabel, UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import ProfileSocialActions from "../components/social/ProfileSocialActions.jsx";

export default function PeopleSearch({ onOpenChat, onChange }) {
  const [kind, setKind] = useState("people");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  const currentSearch = useRef({ query, kind }); currentSearch.current = { query, kind };
  const nav = useNavigate();

  const search = useCallback(async (term = query, target = kind) => {
    const current = ++version.current;
    setLoading(true); setError("");
    try {
      const result = await api(target === "companies" ? `/api/company/search?q=${encodeURIComponent(term.trim())}` : `/api/social/people?q=${encodeURIComponent(term.trim())}`);
      if (current === version.current) { if (target === "companies") setCompanies(result); else setPeople(result); }
      return result;
    } catch (failure) { if (current === version.current) setError(failure.message); throw failure; }
    finally { if (current === version.current) setLoading(false); }
  }, [kind, query]);

  useEffect(() => { setPeople([]); setCompanies([]); search("", kind).catch(() => {}); return () => { version.current += 1; }; }, [kind]);

  function openChat(person) {
    if (onOpenChat) onOpenChat(person);
    else nav(`/feed?section=messages&chat=${encodeURIComponent(person.id)}`);
  }

  return <section className="social-discover-page">
    <header><div className="eyebrow">НОВЫЕ СВЯЗИ</div><h2>Найти собеседника</h2></header>
    <div className="social-discover-kind" role="group" aria-label="Тип поиска"><button type="button" aria-pressed={kind === "people"} onClick={() => { setQuery(""); setKind("people"); }}>Люди</button><button type="button" aria-pressed={kind === "companies"} onClick={() => { setQuery(""); setKind("companies"); }}>Компании</button></div>
    <form className="social-discover-search" onSubmit={(event) => { event.preventDefault(); search().catch(() => {}); }}><label><span className="sr-only">{kind === "people" ? "Имя или ник" : "Название компании"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder={kind === "people" ? "Имя или ник…" : "Название компании…"} /></label><button type="submit" disabled={loading}>{loading ? "Ищем…" : "Найти"}</button></form>
    {error && <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>Закрыть</button></div>}
    {loading ? <p className="social-empty-note" role="status">Ищем…</p> : kind === "companies" ? <div className="social-discover-grid">{companies.map((company) => <article key={company.id} className="social-result"><div className="social-company-icon" aria-hidden="true">⌂</div><div><h3>{company.name}</h3><p>{company.industry || "Отрасль не указана"} · {company.city || "Город не указан"}</p><small>{company.members} участников</small></div></article>)}{!companies.length && <p className="social-empty-note">Компании не найдены. Попробуйте другое название.</p>}</div> : <div className="social-discover-grid">{people.map((person) => {
      const name = person.display_name || person.username;
      return <article key={person.id} className="social-result"><UserAvatar avatarCode={person.avatar_code} frameCode={person.frame_code} userId={person.id} size="md" name={`Аватар ${name}`} /><div className="social-result-copy"><h3>{name}{person.badge_code && <BadgeArt code={person.badge_code} size={17} />}</h3><p>@{person.username} · Уровень {person.rank || 1}</p><small>{person.status_code ? statusLabel(person.status_code) : person.specialization || person.rank_name || "Участник Арены"}</small></div><div className="social-result-actions"><button type="button" className="social-result-profile" onClick={() => nav(`/people/${encodeURIComponent(person.username)}`)}>Профиль</button><ProfileSocialActions person={person} compact onOpenChat={openChat} onRefresh={() => search(currentSearch.current.query, currentSearch.current.kind)} onChanged={onChange} /></div></article>;
    })}{!people.length && <p className="social-empty-note">Никого не нашли. Попробуйте другое имя или ник.</p>}</div>}
  </section>;
}
