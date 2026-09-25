import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const difficultyLabel = { easy: "Легко", medium: "Средне", hard: "Сложно", expert: "Эксперт", brutal: "Эксперт" };

export default function Scenarios() {
  const nav = useNavigate();
  const [scenarios, setScenarios] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("Все"); const [role, setRole] = useState("Все"); const [difficulty, setDifficulty] = useState("Все"); const [skill, setSkill] = useState("Все"); const [selected, setSelected] = useState(null);
  const lastTrigger = useRef(null);
  const open = (scenario) => { lastTrigger.current = document.activeElement; setSelected(scenario); };
  const close = () => { setSelected(null); requestAnimationFrame(() => lastTrigger.current?.focus?.()); };
  async function load() { setLoading(true); setError(""); try { setScenarios(await api("/api/scenarios")); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const categories = ["Все", ...new Set(scenarios.map((s) => s.category).filter(Boolean))]; const roles = ["Все", ...new Set(scenarios.map((s) => s.roles?.player).filter(Boolean))]; const skills = ["Все", ...new Set(scenarios.flatMap((s) => s.skills || []))];
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return scenarios.filter((s) => { const text = [s.title, s.description, s.context, s.roles?.player, s.opponent, ...(s.skills || [])].join(" ").toLowerCase(); return (!q || text.includes(q)) && (category === "Все" || s.category === category) && (role === "Все" || s.roles?.player === role) && (difficulty === "Все" || s.difficulty === difficulty) && (skill === "Все" || (s.skills || []).includes(skill)); }); }, [scenarios, query, category, role, difficulty, skill]);
  const reset = () => { setQuery(""); setCategory("Все"); setRole("Все"); setDifficulty("Все"); setSkill("Все"); };
  return <div className="scenario-catalog"><header className="scenario-catalog-head"><div><div className="eyebrow">ОФЛАЙН-ТРЕНИРОВКИ</div><h1>Сценарные переговоры</h1><p>Готовые деловые ситуации, в которых ваши решения меняют ход разговора. Работает без подключения к ИИ.</p></div><div className="scenario-catalog-art" aria-hidden="true"><span>04 / ДОСЬЕ СИТУАЦИИ</span></div></header>
    <div className="scenario-catalog-meta"><span>{loading ? "Загружаем каталог…" : `${scenarios.length} сценариев`}</span><span>Практика офлайн</span></div>
    {!loading && !error && <section className="scenario-catalog-feature"><div><span className="eyebrow">БЫСТРЫЙ СТАРТ</span><h2>Начните с понятной ситуации</h2><p>Выберите тему — сначала увидите роли и цель, затем настроите тренировку.</p></div><div className="scenario-catalog-presets">{scenarios.filter((s) => ["hr_firing_01", "sales_discount_01", "salary_talk_01"].includes(s.id)).map((s) => <button key={s.id} onClick={() => open(s)}>{s.title} <span aria-hidden="true">↗</span></button>)}</div></section>}
    <section className="scenario-catalog-filters" aria-label="Фильтры сценариев"><label className="scenario-search">Поиск сценария<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название, роль или навык" /></label><div className="scenario-filter-grid"><Filter value={category} onChange={setCategory} options={categories} label="Категория" /><Filter value={role} onChange={setRole} options={roles} label="Роль" /><Filter value={difficulty} onChange={setDifficulty} options={["Все", "easy", "medium", "hard", "expert"]} labels={difficultyLabel} label="Сложность" /><Filter value={skill} onChange={setSkill} options={skills} label="Навык" /></div>{(query || [category, role, difficulty, skill].some((value) => value !== "Все")) && <button className="scenario-reset" onClick={reset}>Сбросить фильтры</button>}</section>
    {loading && <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="h-64 animate-pulse rounded-3xl bg-white/5" />)}</div>}{error && <div className="mt-6 glass rounded-3xl p-6 text-rose-200">Не удалось загрузить сценарии. <button onClick={load} className="ml-2 text-cyan-300 underline">Повторить</button></div>}{!loading && !error && !filtered.length && <div className="mt-6 glass rounded-3xl p-6 text-slate-300">Сценарии по выбранным фильтрам не найдены. <button onClick={reset} className="ml-2 text-cyan-300 underline">Сбросить фильтры</button></div>}
    {!loading && !error && <div className="scenario-catalog-results">Найдено: {filtered.length}</div>}
    <div className="scenario-catalog-grid">{!loading && !error && filtered.map((s, index) => <article key={s.id} className="scenario-card"><div className="scenario-card-top"><span>{String(index + 1).padStart(2, "0")} / {s.category}</span><span>{s.minutes ? `≈ ${s.minutes} мин` : "Время не указано"} · {difficultyLabel[s.difficulty] || s.difficulty}</span></div><h2>{s.title}</h2><p>{s.description || s.context}</p><div className="scenario-card-roles">Вы: {s.roles?.player || "Не указано"}<br />Оппонент: {s.opponent || s.roles?.opponent || "Не указано"}<br />Диалог: {s.turns || 0} ходов · {s.choice_count || 0} вариантов</div><div className="scenario-card-skills">{(s.skills || []).slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div><button onClick={() => open(s)}>Подробнее <span aria-hidden="true">↗</span></button></article>)}</div>
    {selected && <ScenarioModal scenario={selected} onClose={close} onStart={() => nav(`/setup?preset=${selected.id}`)} />}</div>;
}
function Filter({ value, onChange, options, label, labels = {} }) { return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((item) => <option key={item} value={item}>{labels[item] || item}</option>)}</select></label>; }
function ScenarioModal({ scenario, onClose, onStart }) {
  const dialog = useRef(null);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("button")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = [...dialog.current.querySelectorAll("button:not([disabled]), a[href]")];
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return createPortal(<div className="scenario-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} className="scenario-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-dialog-title"><div className="scenario-modal-head"><div><span className="eyebrow">{scenario.category}</span><h2 id="scenario-dialog-title">{scenario.title}</h2></div><button onClick={onClose} aria-label="Закрыть подробности">×</button></div><div className="scenario-modal-details"><Info label="Ситуация" value={scenario.context} /><Info label="Ваша роль" value={scenario.roles?.player} /><Info label="Оппонент" value={scenario.opponent || scenario.roles?.opponent} /><Info label="Ваша цель" value={scenario.goal} /><Info label="Диалог" value={`${scenario.turns || 0} ходов · ${scenario.choice_count || 0} вариантов ответа`} /><Info label="Что тренируем" value={(scenario.skills || []).join(" · ")} /><Info label="Сложность и длительность" value={`${difficultyLabel[scenario.difficulty] || scenario.difficulty} · ${scenario.minutes ? `≈ ${scenario.minutes} минут` : "время не указано"}`} />{scenario.features?.length > 0 && <Info label="Особенности" value={scenario.features.join(" · ")} />}</div><button onClick={onStart} className="primary-button scenario-modal-start">Настроить тренировку →</button></section></div>, document.body);
}
function Info({ label, value }) { return <div className="mt-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-slate-200">{value}</div></div>; }
