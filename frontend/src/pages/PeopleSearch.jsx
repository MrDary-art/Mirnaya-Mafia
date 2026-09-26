import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { BadgeArt, statusLabel, UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";

export default function PeopleSearch({ onOpenChat, onChange }) {
  const [kind, setKind] = useState("people");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const nav = useNavigate();

  const search = useCallback(async (term = query, target = kind) => {
    setLoading(true); setError("");
    try {
      if (target === "companies") setCompanies(await api(`/api/company/search?q=${encodeURIComponent(term.trim())}`));
      else setPeople(await api(`/api/social/people?q=${encodeURIComponent(term.trim())}`));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [kind, query]);

  useEffect(() => { search("", kind); }, [kind]);

  async function connect(person) {
    setBusyId(person.id); setError("");
    try {
      await api(`/api/social/friends/${person.id}/request`, { method: "POST" });
      await search();
      await onChange?.();
    } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }

  function openChat(person) {
    if (onOpenChat) onOpenChat(person);
    else nav(`/people?chat=${person.id}`);
  }

  return <section className="social-discover-page">
    <header><div className="eyebrow">НОВЫЕ СВЯЗИ</div><h2>Найти собеседника</h2><p>Начните с имени или ника. Профиль подскажет, чем человек занимается и как с ним связаться.</p></header>
    <div className="social-discover-kind" role="group" aria-label="Тип поиска"><button type="button" aria-pressed={kind === "people"} onClick={() => { setQuery(""); setKind("people"); }}>Люди</button><button type="button" aria-pressed={kind === "companies"} onClick={() => { setQuery(""); setKind("companies"); }}>Компании</button></div>
    <form className="social-discover-search" onSubmit={(event) => { event.preventDefault(); search(); }}><label><span className="sr-only">{kind === "people" ? "Имя или ник" : "Название компании"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "people" ? "Имя или ник…" : "Название компании…"} /></label><button type="submit" disabled={loading}>{loading ? "Ищем…" : "Найти"}</button></form>
    {error && <div className="product-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError("")}>Закрыть</button></div>}
    {loading ? <p className="social-empty-note" role="status">Ищем…</p> : kind === "companies" ? <div className="social-discover-grid">{companies.map((company) => <article key={company.id} className="social-result"><div className="social-company-icon" aria-hidden="true">⌂</div><div><h3>{company.name}</h3><p>{company.industry || "Отрасль не указана"} · {company.city || "Город не указан"}</p><small>{company.members} участников</small></div></article>)}{!companies.length && <p className="social-empty-note">Компании не найдены. Попробуйте другое название.</p>}</div> : <div className="social-discover-grid">{people.map((person) => {
      const name = person.display_name || person.username;
      return <article key={person.id} className="social-result"><UserAvatar avatarCode={person.avatar_code} frameCode={person.frame_code} userId={person.id} size="md" name={`Аватар ${name}`} /><div className="social-result-copy"><h3>{name}{person.badge_code && <BadgeArt code={person.badge_code} size={17} />}</h3><p>@{person.username} · Уровень {person.rank || 1}</p><small>{person.status_code ? statusLabel(person.status_code) : person.specialization || person.rank_name || "Участник Арены"}</small></div><div className="social-result-actions"><button type="button" className="social-result-profile" onClick={() => nav(`/people/${encodeURIComponent(person.username)}`)}>Профиль</button>{person.relationship === "FRIENDS" ? <button type="button" className="social-result-primary" onClick={() => openChat(person)}>Написать</button> : person.relationship === "REQUEST_SENT" ? <span>Заявка отправлена</span> : person.relationship === "REQUEST_RECEIVED" ? <button type="button" className="social-result-primary" disabled={busyId === person.id} onClick={() => connect(person)}>{busyId === person.id ? "Принимаем…" : "Принять заявку"}</button> : <button type="button" className="social-result-primary" disabled={busyId === person.id} onClick={() => connect(person)}>{busyId === person.id ? "Отправляем…" : "Добавить"}</button>}</div></article>;
    })}{!people.length && <p className="social-empty-note">Никого не нашли. Попробуйте другое имя или ник.</p>}</div>}
  </section>;
}
