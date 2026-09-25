import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const ranks = ["", "Новичок", "Практик", "Переговорщик", "Стратег", "Мастер переговоров", "Эксперт переговоров"];
const fields = ["", "HR", "Продажи", "Руководитель", "Предприниматель", "Закупщик", "PM"];

export default function PeopleSearch() {
  const [q, setQ] = useState("");
  const [rank, setRank] = useState("");
  const [minXp, setMinXp] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const nav = useNavigate();

  async function search(event) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (rank) params.set("rank", rank);
      if (minXp) params.set("min_xp", minXp);
      if (specialization) params.set("specialization", specialization);
      setPeople(await api(`/api/social/people?${params}`));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { search(); }, []);

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
    <div className="eyebrow">ПОИСК ПАРТНЁРА</div><h2>Поиск переговорщиков</h2><p>Ищите по нику или имени. Фильтры уточняют результаты поиска, а не показывают присутствие в сети.</p>
    <form onSubmit={search} className="people-search-form">
      <label>Имя или ник<input value={q} onChange={(event) => setQ(event.target.value)} placeholder="@ник или имя" /></label>
      <label>Ранг<select value={rank} onChange={(event) => setRank(event.target.value)}><option value="">Любой ранг</option>{ranks.slice(1).map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Опыт обучения<select value={minXp} onChange={(event) => setMinXp(event.target.value)}><option value="">Любой опыт</option><option value="500">От 500</option><option value="1000">От 1000</option><option value="3000">От 3000</option></select></label>
      <label>Специализация<select value={specialization} onChange={(event) => setSpecialization(event.target.value)}><option value="">Любая специализация</option>{fields.slice(1).map((name) => <option key={name}>{name}</option>)}</select></label>
      <button className="primary-button" disabled={loading}>{loading ? "Ищем…" : "Найти партнёра"}</button>
    </form>
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    {loading ? <p className="product-loading" role="status">Ищем переговорщиков…</p> : people.length ? <div className="people-results">{people.map((person) => <article key={person.id} className="people-card">
      <div className="people-card-head"><div className="profile-avatar !h-14 !w-14 !rounded-2xl !text-lg">{(person.display_name || person.username).slice(0, 2).toUpperCase()}<span>{person.rank}</span></div><div><h3>{person.display_name || person.username}</h3><p>@{person.username}</p><small>{person.title} · {person.rank_name}</small></div></div>
      <div className="people-card-metrics"><Metric value={person.xp} label="опыт обучения" /><Metric value={person.stars} label="★" /><Metric value={person.sessions_total} label="переговоров" /></div>
      <p>Специализация: {person.specialization || "не указана"}</p>
      <div className="people-card-actions"><button className="subtle-button" onClick={() => nav(`/people/${person.username}`)}>Профиль</button>{person.relationship === "NONE" && <button className="primary-button" disabled={busyId === person.id} onClick={() => friend(person)}>{busyId === person.id ? "Отправляем…" : "Добавить друга"}</button>}{person.relationship === "REQUEST_RECEIVED" && <button className="primary-button" disabled={busyId === person.id} onClick={() => friend(person)}>{busyId === person.id ? "Подтверждаем…" : "Принять заявку"}</button>}{person.relationship === "REQUEST_SENT" && <span>Заявка отправлена</span>}{person.relationship === "FRIENDS" && <span>Вы друзья</span>}</div>
    </article>)}</div> : <div className="product-empty"><b>Никого не найдено</b><p>Попробуйте изменить запрос или снять часть фильтров.</p></div>}
  </section>;
}

function Metric({ value, label }) { return <div><b>{value}</b><small>{label}</small></div>; }
