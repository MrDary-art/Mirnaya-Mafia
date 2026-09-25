import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const ranks = ["", "Новичок", "Практик", "Переговорщик", "Стратег", "Мастер переговоров", "Эксперт переговоров"];
const fields = ["", "HR", "Продажи", "Руководитель", "Предприниматель", "Закупщик", "PM"];

export default function PeopleSearch() {
  const [kind, setKind] = useState("people");
  const [q, setQ] = useState("");
  const [rank, setRank] = useState("");
  const [minXp, setMinXp] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const nav = useNavigate();

  async function search(event) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (kind === "companies") {
        setCompanies(await api(`/api/company/search?q=${encodeURIComponent(q.trim())}`));
        return;
      }
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (rank) params.set("rank", rank);
      if (minXp) params.set("min_xp", minXp);
      if (specialization) params.set("specialization", specialization);
      setPeople(await api(`/api/social/people?${params}`));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { search(); }, [kind]);

  async function friend(person) {
    setBusyId(person.id);
    setError("");
    try {
      await api(`/api/social/friends/${person.id}/request`, { method: "POST" });
      await search();
    } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }

  return <section className="people-search-page">
    <div className="eyebrow">ПОИСК</div><h2>{kind === "people" ? "Поиск переговорщиков" : "Поиск компаний"}</h2><p>{kind === "people" ? "Ищите по нику или имени. Фильтры уточняют результаты поиска, а не показывают присутствие в сети." : "Здесь отображаются компании, зарегистрированные в Arena."}</p>
    <div className="mt-4 flex gap-2"><button className={kind === "people" ? "primary-button" : "subtle-button"} onClick={() => setKind("people")}>Люди</button><button className={kind === "companies" ? "primary-button" : "subtle-button"} onClick={() => setKind("companies")}>Компании</button></div>
    <form onSubmit={search} className="people-search-form">
      <label>{kind === "people" ? "Имя или ник" : "Название компании"}<input value={q} onChange={(event) => setQ(event.target.value)} placeholder={kind === "people" ? "@ник или имя" : "Название компании"} /></label>
      {kind === "people" && <><label>Ранг<select value={rank} onChange={(event) => setRank(event.target.value)}><option value="">Любой ранг</option>{ranks.slice(1).map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label>Опыт обучения<select value={minXp} onChange={(event) => setMinXp(event.target.value)}><option value="">Любой опыт</option><option value="500">От 500</option><option value="1000">От 1000</option><option value="3000">От 3000</option></select></label><label>Специализация<select value={specialization} onChange={(event) => setSpecialization(event.target.value)}><option value="">Любая специализация</option>{fields.slice(1).map((name) => <option key={name}>{name}</option>)}</select></label></>}
      <button className="primary-button" disabled={loading}>{loading ? "Ищем…" : "Найти"}</button>
    </form>
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    {loading ? <p className="product-loading" role="status">Ищем…</p> : kind === "companies" ? (companies.length ? <div className="people-results">{companies.map((company) => <article key={company.id} className="people-card"><div className="people-card-head"><div className="profile-avatar !h-14 !w-14 !rounded-2xl !text-lg">🏢</div><div><h3>{company.name}</h3><p>{company.industry || "Отрасль не указана"}</p><small>{company.members} участников · {company.city || "Город не указан"}</small></div></div><p>{company.description || "Описание компании пока не добавлено."}</p></article>)}</div> : <div className="product-empty"><b>Компании не найдены</b><p>Попробуйте изменить запрос.</p></div>) : people.length ? <div className="people-results">{people.map((person) => <article key={person.id} className="people-card">
      <div className="people-card-head"><div className="profile-avatar !h-14 !w-14 !rounded-2xl !text-lg">{(person.display_name || person.username).slice(0, 2).toUpperCase()}<span>{person.rank}</span></div><div><h3>{person.display_name || person.username}</h3><p>@{person.username}</p><small>{person.title} · {person.rank_name}</small></div></div>
      <div className="people-card-metrics"><Metric value={person.xp} label="опыт обучения" /><Metric value={person.stars} label="★" /><Metric value={person.sessions_total} label="переговоров" /></div>
      <p>Специализация: {person.specialization || "не указана"}</p>
      <div className="people-card-actions"><button className="subtle-button" onClick={() => nav(`/people/${person.username}`)}>Профиль</button>{person.relationship === "NONE" && <button className="primary-button" disabled={busyId === person.id} onClick={() => friend(person)}>{busyId === person.id ? "Отправляем…" : "Добавить друга"}</button>}{person.relationship === "REQUEST_RECEIVED" && <button className="primary-button" disabled={busyId === person.id} onClick={() => friend(person)}>{busyId === person.id ? "Подтверждаем…" : "Принять заявку"}</button>}{person.relationship === "REQUEST_SENT" && <span>Заявка отправлена</span>}{person.relationship === "FRIENDS" && <span>Вы друзья</span>}</div>
    </article>)}</div> : <div className="product-empty"><b>Никого не найдено</b><p>Попробуйте изменить запрос или снять часть фильтров.</p></div>}
  </section>;
}

function Metric({ value, label }) { return <div><b>{value}</b><small>{label}</small></div>; }
