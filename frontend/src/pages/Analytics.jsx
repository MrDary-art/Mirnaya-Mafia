import PageHeader from "../design/PageHeader.jsx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import "./analytics-note.css";

function Comparison({ item }) {
  return <article className="analytics-note-comparison">
    <h3>{item.title}</h3><p>{item.detail}</p>
    <div className="analytics-note-pair"><div><small>Раньше</small><blockquote>«{item.earlier_quote}»</blockquote><Link to={`/report/${item.earlier_session_id}`} state={{ returnTo: "/analytics" }}>Открыть разбор ↗</Link></div><div><small>Позже</small><blockquote>«{item.later_quote}»</blockquote><Link to={`/report/${item.later_session_id}`} state={{ returnTo: "/analytics" }}>Открыть разбор ↗</Link></div></div>
  </article>;
}

const HISTORY_KINDS = [["all", "Всё"], ["negotiation", "Переговоры"], ["room", "Встречи 1×1"], ["course", "Курсы"], ["training", "Тренировки"]];
const HISTORY_KIND_LABELS = { negotiation: "Переговоры", course: "Курс", training: "Тренировка", room: "Встреча 1×1" };
const pluralRules = new Intl.PluralRules("ru-RU");
const withCount = (count, forms) => `${count} ${forms[pluralRules.select(count)] || forms.many}`;

function historyDestination(row) {
  if (row.room_id) return `/room/${row.room_id}`;
  if (row.kind === "course") return `/learn/${row.program_id}`;
  if (row.kind === "training") {
    if (row.finished) return `/training/path/attempt/${row.attempt_id}/report`;
    return row.status === "В процессе" ? `/training/path/attempt/${row.attempt_id}` : `/training/path/level/${row.level_id}`;
  }
  return row.finished || row.processing ? `/report/${row.session_id}` : row.mode === "online" ? `/practice?session=${row.session_id}` : `/play/${row.session_id}`;
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyKind, setHistoryKind] = useState("all");
  const [historyState, setHistoryState] = useState("all");
  const [showAllHistory, setShowAllHistory] = useState(false);
  useEffect(() => {
    let active = true;
    api("/api/history").then((rows) => { if (active) setHistoryRows(rows); })
      .catch((reason) => { if (active) setHistoryError(reason.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);
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
  const knownSessions = new Set(historyRows.map((row) => String(row.session_id)));
  const savedReportRows = (note.recent_reports || [])
    .filter((report) => !knownSessions.has(String(report.session_id)))
    .map((report) => ({
      id: `report:${report.session_id}`, kind: "negotiation", session_id: report.session_id,
      title: report.title, subtitle: "Сохранённый разбор", status: report.status || "Отчёт сохранён",
      finished: true, date: report.date,
    }));
  const allHistoryRows = [...historyRows, ...savedReportRows]
    .sort((left, right) => (right.date || "").localeCompare(left.date || ""));
  const matchingHistory = allHistoryRows.filter((row) => (historyKind === "all" || row.kind === historyKind)
    && (historyState === "all" || (historyState === "finished" ? row.finished : !row.finished)));
  const visibleHistory = showAllHistory ? matchingHistory : matchingHistory.slice(0, 8);
  return <main className="analytics-note-page">
    <PageHeader eyebrow="Практика и прогресс" title="Аналитика" description={note.summary || "Здесь собраны ваши результаты, разборы и последние занятия."}>{note.basis && note.basis !== "Нет завершённых тренировок" && <small>{note.basis}</small>}</PageHeader>

    <div className="analytics-note-layout"><div className="analytics-note-main">
      {note.improvements?.length > 0 && <section className="analytics-note-section"><div className="analytics-note-eyebrow">ЧТО СТАЛО ПОЛУЧАТЬСЯ</div><h2>Подтверждённые изменения</h2>{note.improvements.map((item, index) => <Comparison key={index} item={item} />)}</section>}
      {note.repeating?.length > 0 && <section className="analytics-note-section"><div className="analytics-note-eyebrow">ЧТО ПРОДОЛЖАЕТ МЕШАТЬ</div><h2>Повторяющиеся моменты</h2>{note.repeating.map((item, index) => <Comparison key={index} item={item} />)}</section>}
      {!note.improvements?.length && !note.repeating?.length && <section className="analytics-note-section analytics-note-empty"><h2>Что уже можно сказать</h2><p>{data.sessions_total ? "Разборы доступны ниже. Для надёжного сравнения повторите похожую задачу: мы сопоставим ваши конкретные решения и реплики." : "Завершите тренировку, чтобы получить первый личный разбор."}</p></section>}
      <section className="analytics-note-section"><div className="analytics-note-eyebrow">ИСТОРИЯ И РАЗБОРЫ</div><h2>Последние занятия</h2>
        <div className="history-toolbar"><div role="group" aria-label="Тип активности">{HISTORY_KINDS.map(([value, label]) => <button key={value} type="button" aria-pressed={historyKind === value} onClick={() => setHistoryKind(value)}>{label}</button>)}</div>
          <label>Состояние <select aria-label="Состояние занятий" value={historyState} onChange={(event) => setHistoryState(event.target.value)}><option value="all">Все</option><option value="finished">Завершённые</option><option value="unfinished">Незавершённые</option></select></label>
        </div>
        {historyError && <div className="product-error" role="alert"><p>{historyError}</p><button className="subtle-button" onClick={() => { setHistoryLoading(true); setHistoryError(""); api("/api/history").then(setHistoryRows).catch((reason) => setHistoryError(reason.message)).finally(() => setHistoryLoading(false)); }}>Повторить загрузку</button></div>}
        {historyLoading ? <p className="product-loading" role="status">Загружаем занятия…</p> : visibleHistory.length ? <div className="history-list">{visibleHistory.map((row, index) => <Link key={row.id} to={historyDestination(row)} state={{ returnTo: "/analytics" }} className="history-row">
          <span className="history-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="history-row-main"><span className="history-row-kind">{HISTORY_KIND_LABELS[row.kind] || "Активность"} · {row.status}</span><b>{row.title}</b><small>{row.subtitle}{row.date ? ` · ${new Date(row.date).toLocaleDateString("ru-RU")}` : ""}</small>{row.verdict && <span className="history-row-verdict">{row.verdict}</span>}</span>
          <span className="history-row-action">{row.finished ? "Открыть разбор" : row.status === "В процессе" ? "Продолжить" : "Открыть"} <span aria-hidden="true">↗</span></span>
        </Link>)}</div> : <div className="product-empty"><b>Здесь пока нет занятий</b><p>{allHistoryRows.length ? "Измените фильтры, чтобы увидеть другие записи." : "Начните сценарий или тренировку — записи появятся здесь."}</p>{allHistoryRows.length > 0 && <button className="subtle-button" onClick={() => { setHistoryKind("all"); setHistoryState("all"); }}>Сбросить фильтры</button>}</div>}
        {!historyLoading && matchingHistory.length > 8 && <button type="button" className="analytics-note-cta" onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? "Свернуть список" : `Показать всю историю · ${matchingHistory.length}`}</button>}
      </section>
    </div><aside className="analytics-note-side">
      <section><div className="analytics-note-eyebrow">СЛЕДУЮЩАЯ ПРАКТИКА</div><h2>Один полезный шаг</h2><p>{note.next_practice?.text || "Начните тренировку и выберите одну задачу, которую хотите отработать."}</p><Link className="analytics-note-cta" to={note.next_practice?.mode === "online" ? `/ai/prepare?retry=${note.next_practice.session_id}` : note.next_practice?.scenario_id ? `/setup?preset=${encodeURIComponent(note.next_practice.scenario_id)}` : "/ai"} state={{ returnTo: "/analytics" }}>Перейти к тренировке →</Link></section>
      <section><div className="analytics-note-eyebrow">АКТИВНОСТЬ</div><h2>{withCount(data.sessions_total, { one: "завершённая беседа", few: "завершённые беседы", many: "завершённых бесед" })}</h2><p>{withCount(data.drills_total, { one: "короткое упражнение", few: "коротких упражнения", many: "коротких упражнений" })} · серия {withCount(data.day_streak, { one: "день", few: "дня", many: "дней" })}</p><label>Цель на неделю<select disabled={saving} value={data.weekly_goal?.target || 3} onChange={(event) => setGoal(Number(event.target.value))}>{[1, 2, 3, 4, 5, 7, 10].map((value) => <option value={value} key={value}>{withCount(value, { one: "практика", few: "практики", many: "практик" })}</option>)}</select></label><small>Выполнено: {data.weekly_goal?.completed || 0} из {data.weekly_goal?.target || 3} на этой неделе</small></section>
      {data.assignments?.length > 0 && <section><div className="analytics-note-eyebrow">ЗАДАНИЯ КОМАНДЫ</div>{data.assignments.map((item) => <div key={item.id} className="analytics-note-assignment"><strong>{item.scenario_title}</strong><small>{item.completed ? "Выполнено" : "Назначено"}</small>{!item.completed && <Link to={`/setup?preset=${encodeURIComponent(item.scenario_id)}`} state={{ returnTo: "/analytics" }}>Начать →</Link>}</div>)}</section>}
    </aside></div>
  </main>;
}
