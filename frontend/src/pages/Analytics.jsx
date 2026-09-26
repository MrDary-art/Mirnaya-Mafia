import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import "./analytics-note.css";

function Comparison({ item }) {
  return <article className="analytics-note-comparison">
    <h3>{item.title}</h3><p>{item.detail}</p>
    <div className="analytics-note-pair"><div><small>Раньше</small><blockquote>«{item.earlier_quote}»</blockquote><Link to={`/report/${item.earlier_session_id}`}>Открыть разбор ↗</Link></div><div><small>Позже</small><blockquote>«{item.later_quote}»</blockquote><Link to={`/report/${item.later_session_id}`}>Открыть разбор ↗</Link></div></div>
  </article>;
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => api("/api/analytics/overview").then(setData).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, []);

  async function setGoal(sessions) {
    setSaving(true);
    try {
      await api("/api/analytics/weekly-goal", { method: "PUT", body: { sessions } });
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  }

  if (!data) return error
    ? <div className="analytics-note-section" role="alert"><h1>Разборы пока не открылись</h1><p>{error}</p><button className="primary-button" onClick={() => { setError(""); load(); }}>Повторить загрузку</button></div>
    : <div className="text-slate-400" role="status">Собираем ваши разборы…</div>;
  const note = data.progress_note || {};
  return <main className="analytics-note-page">
    <header className="analytics-note-hero"><div className="analytics-note-eyebrow">ПРАКТИКА И ПРОГРЕСС</div><h1>Что меняется в ваших разговорах</h1><p>{note.summary || "Здесь появятся выводы по завершённым тренировкам."}</p><small>{note.basis}</small></header>

    <div className="analytics-note-layout"><div className="analytics-note-main">
      {note.improvements?.length > 0 && <section className="analytics-note-section"><div className="analytics-note-eyebrow">ЧТО СТАЛО ПОЛУЧАТЬСЯ</div><h2>Подтверждённые изменения</h2>{note.improvements.map((item, index) => <Comparison key={index} item={item} />)}</section>}
      {note.repeating?.length > 0 && <section className="analytics-note-section"><div className="analytics-note-eyebrow">ЧТО ПРОДОЛЖАЕТ МЕШАТЬ</div><h2>Повторяющиеся моменты</h2>{note.repeating.map((item, index) => <Comparison key={index} item={item} />)}</section>}
      {!note.improvements?.length && !note.repeating?.length && <section className="analytics-note-section analytics-note-empty"><h2>Что уже можно сказать</h2><p>{data.sessions_total ? "Разборы доступны ниже. Для надёжного сравнения повторите похожую задачу: мы сопоставим ваши конкретные решения и реплики." : "Завершите тренировку, чтобы получить первый личный разбор."}</p></section>}
      <section className="analytics-note-section"><div className="analytics-note-eyebrow">К ЧЕМУ ВЕРНУТЬСЯ</div><h2>Сохранённые разборы</h2><div className="analytics-note-report-list">{(note.recent_reports || []).map((item) => <Link key={item.session_id} to={`/report/${item.session_id}`}><span><strong>{item.title}</strong><small>{new Date(`${item.date}T00:00:00`).toLocaleDateString("ru-RU")}</small></span><span>{item.status} ↗</span></Link>)}{!note.recent_reports?.length && <p>После первой завершённой сессии здесь появится её разбор.</p>}</div></section>
    </div><aside className="analytics-note-side">
      <section><div className="analytics-note-eyebrow">СЛЕДУЮЩАЯ ПРАКТИКА</div><h2>Один полезный шаг</h2><p>{note.next_practice?.text || "Начните тренировку и выберите одну задачу, которую хотите отработать."}</p><Link className="analytics-note-cta" to={note.next_practice?.scenario_id ? `/setup?preset=${encodeURIComponent(note.next_practice.scenario_id)}` : "/setup"}>Перейти к тренировке →</Link></section>
      <section><div className="analytics-note-eyebrow">АКТИВНОСТЬ</div><h2>{data.sessions_total} завершённых бесед</h2><p>{data.drills_total} коротких упражнений · серия {data.day_streak} дн.</p><label>Цель на неделю<select disabled={saving} value={data.weekly_goal?.target || 3} onChange={(event) => setGoal(Number(event.target.value))}>{[1, 2, 3, 4, 5, 7, 10].map((value) => <option value={value} key={value}>{value} практик</option>)}</select></label><small>{data.weekly_goal?.completed || 0} из {data.weekly_goal?.target || 3} выполнено на этой неделе</small></section>
      {data.assignments?.length > 0 && <section><div className="analytics-note-eyebrow">ЗАДАНИЯ КОМАНДЫ</div>{data.assignments.map((item) => <div key={item.id} className="analytics-note-assignment"><strong>{item.scenario_title}</strong><small>{item.completed ? "Выполнено" : "Назначено"}</small>{!item.completed && <Link to={`/setup?preset=${encodeURIComponent(item.scenario_id)}`}>Начать →</Link>}</div>)}</section>}
    </aside></div>
  </main>;
}
