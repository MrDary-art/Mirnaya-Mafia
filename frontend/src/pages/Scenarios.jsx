import PageHeader from "../design/PageHeader.jsx";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import ModeGuideEntry from "../components/ModeGuideEntry.jsx";

const difficultyLabel = { easy: "Легко", medium: "Средне", hard: "Сложно", expert: "Эксперт", brutal: "Эксперт" };

export default function Scenarios() {
  const nav = useNavigate();
  const [scenarios, setScenarios] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("Все"); const [role, setRole] = useState("Все"); const [difficulty, setDifficulty] = useState("Все"); const [skill, setSkill] = useState("Все");
  const startScenario = (scenarioId) => nav(`/setup?preset=${scenarioId}`);
  async function load() { setLoading(true); setError(""); try { setScenarios(await api("/api/scenarios")); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const categories = ["Все", ...new Set(scenarios.map((s) => s.category).filter(Boolean))]; const roles = ["Все", ...new Set(scenarios.map((s) => s.roles?.player).filter(Boolean))]; const skills = ["Все", ...new Set(scenarios.flatMap((s) => s.skills || []))];
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return scenarios.filter((s) => { const text = [s.title, s.description, s.context, s.roles?.player, s.opponent, ...(s.skills || [])].join(" ").toLowerCase(); return (!q || text.includes(q)) && (category === "Все" || s.category === category) && (role === "Все" || s.roles?.player === role) && (difficulty === "Все" || s.difficulty === difficulty) && (skill === "Все" || (s.skills || []).includes(skill)); }); }, [scenarios, query, category, role, difficulty, skill]);
  const reset = () => { setQuery(""); setCategory("Все"); setRole("Все"); setDifficulty("Все"); setSkill("Все"); };
  return <div className="scenario-catalog"><PageHeader eyebrow="Офлайн-тренировки" title="Сценарные переговоры" description="Выберите ситуацию и начните переговоры." />
    <ModeGuideEntry to="/scenarios/demo" eyebrow="ПРИМЕР СЦЕНАРИЯ" title="Как решение меняет историю?" description="Посмотрите пример выбора и результата." />
    {!loading && !error && <section className="scenario-catalog-feature"><h2>Быстрый старт</h2><div className="scenario-catalog-presets">{scenarios.filter((s) => ["hr_firing_01", "sales_discount_01", "salary_talk_01"].includes(s.id)).map((s) => <button key={s.id} onClick={() => startScenario(s.id)}>{s.title} <span aria-hidden="true">↗</span></button>)}</div></section>}
    <section className="scenario-catalog-filters" aria-label="Фильтры сценариев"><label className="scenario-search">Поиск сценария<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название, роль или навык" /></label><div className="scenario-filter-grid"><Filter value={category} onChange={setCategory} options={categories} label="Категория" /><Filter value={role} onChange={setRole} options={roles} label="Роль" /><Filter value={difficulty} onChange={setDifficulty} options={["Все", "easy", "medium", "hard", "expert"]} labels={difficultyLabel} label="Сложность" /><Filter value={skill} onChange={setSkill} options={skills} label="Навык" /></div>{(query || [category, role, difficulty, skill].some((value) => value !== "Все")) && <button className="scenario-reset" onClick={reset}>Сбросить фильтры</button>}</section>
    {loading && <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="h-64 animate-pulse rounded-3xl bg-white/5" />)}</div>}{error && <div className="mt-6 glass rounded-3xl p-6 text-rose-200">Не удалось загрузить сценарии. <button onClick={load} className="ml-2 text-lime-300 underline">Повторить</button></div>}{!loading && !error && !filtered.length && <div className="mt-6 glass rounded-3xl p-6 text-slate-300">Сценарии по выбранным фильтрам не найдены. <button onClick={reset} className="ml-2 text-lime-300 underline">Сбросить фильтры</button></div>}
    <div className="scenario-catalog-grid">{!loading && !error && filtered.map((s) => <article key={s.id} className="scenario-card"><div className="scenario-card-top"><span>{s.category}</span><span>{s.minutes ? `≈ ${s.minutes} мин · ` : ""}{difficultyLabel[s.difficulty] || s.difficulty}</span></div><h2>{s.title}</h2><p>{s.description || s.context}</p><div className="scenario-card-roles">Вы: {s.roles?.player || "Не указано"}<br />Оппонент: {s.opponent || s.roles?.opponent || "Не указано"}</div><button onClick={() => startScenario(s.id)}>Подробнее <span aria-hidden="true">↗</span></button></article>)}</div>
  </div>;
}
function Filter({ value, onChange, options, label, labels = {} }) { return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((item) => <option key={item} value={item}>{labels[item] || item}</option>)}</select></label>; }
