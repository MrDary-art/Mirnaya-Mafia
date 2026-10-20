import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { BadgeArt, statusLabel, UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import ProfileSocialActions from "../components/social/ProfileSocialActions.jsx";

export default function PeopleSearch({ onOpenChat, onChange, searchQuery = null, hideSearch = false }) {
  const [typedQuery, setQuery] = useState("");
  const query = searchQuery ?? typedQuery;
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  const debounce = useRef(null);
  const currentSearch = useRef(query); currentSearch.current = query;
  const nav = useNavigate();

  const search = useCallback(async (term = "") => {
    window.clearTimeout(debounce.current);
    const current = ++version.current;
    setLoading(true); setError("");
    try {
      const result = await api(`/api/social/people?q=${encodeURIComponent(term.trim())}`);
      if (current === version.current) setPeople(result);
      return result;
    } catch (failure) { if (current === version.current) setError(failure.message); throw failure; }
    finally { if (current === version.current) setLoading(false); }
  }, []);

  useEffect(() => {
    version.current += 1;
    setLoading(true);
    setError("");
    debounce.current = window.setTimeout(() => search(query).catch(() => {}), query.trim() ? 300 : 0);
    return () => { window.clearTimeout(debounce.current); version.current += 1; };
  }, [query, search]);

  function openChat(person) {
    if (onOpenChat) onOpenChat(person);
    else nav(`/feed?section=messages&chat=${encodeURIComponent(person.id)}`);
  }

  return <section className="social-discover-page">
    <header><h2>Найти людей</h2></header>
    {!hideSearch && <form className="social-discover-search" onSubmit={(event) => { event.preventDefault(); search(query).catch(() => {}); }}><label><span className="sr-only">Имя или ник</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Имя или ник…" /></label><button type="submit" className="primary-button" disabled={loading}>{loading ? "Ищем…" : "Найти"}</button></form>}
    {error && <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>Закрыть</button></div>}
    {loading ? <p className="social-empty-note" role="status">Ищем…</p> : <div className="social-discover-grid">{people.map((person) => {
      const name = person.display_name || person.username;
      return <article key={person.id} className="social-result"><UserAvatar avatarCode={person.avatar_code} frameCode={person.frame_code} userId={person.id} size="md" name={`Аватар ${name}`} /><div className="social-result-copy"><h3>{name}{person.badge_code && <BadgeArt code={person.badge_code} size={17} />}</h3><p>@{person.username} · Уровень {person.rank || 1}</p><small>{person.status_code ? statusLabel(person.status_code) : person.specialization || person.rank_name || "Участник Арены"}</small></div><div className="social-result-actions"><button type="button" className="subtle-button social-result-profile" onClick={() => nav(`/people/${encodeURIComponent(person.username)}`)}>Профиль</button><ProfileSocialActions person={person} compact onOpenChat={openChat} onRefresh={() => search(currentSearch.current)} onChanged={onChange} /></div></article>;
    })}{!people.length && <p className="social-empty-note">Никого не нашли. Попробуйте другое имя или ник.</p>}</div>}
  </section>;
}
