import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { api, downloadPrivate } from "../api.js";
import ForestSectionHeader from "../components/ForestSectionHeader.jsx";
import AnalyticsLabel, { AnalyticsInfoProvider } from "../components/analytics/AnalyticsInfo.jsx";
import { ANALYTICS_HELP as HELP, dimensionHelp, reportMetricHelp } from "../components/analytics/analyticsHelp.js";
import "./analytics-note.css";
import "./analytics-forest.css";

const HISTORY_KINDS = [["all", "Всё"], ["negotiation", "Переговоры"], ["room", "Встречи 1×1"], ["course", "Курсы"], ["training", "Тренировки"]];
const HISTORY_KIND_LABELS = { negotiation: "Переговоры", course: "Курс", training: "Тренировка", room: "Встреча 1×1" };
const METRIC_LABELS = { trust: "Доверие", goal: "Достижение цели", control: "Контроль", eq: "Эмоциональный интеллект" };

function clampScore(value, maximum = 100) {
  return Math.max(0, Math.min(maximum, Number(value) || 0));
}

function formatCount(value, forms) {
  const count = Math.abs(Number(value) || 0);
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const form = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? forms[2]
    : lastDigit === 1
      ? forms[0]
      : lastDigit >= 2 && lastDigit <= 4
        ? forms[1]
        : forms[2];
  return `${value} ${form}`;
}

function formatShortDate(value) {
  if (!value) return "";
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  return new Date(normalized).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(" г.", "");
}

function historyDestination(row) {
  if (row.room_id) return `/room/${row.room_id}`;
  if (row.kind === "course") return `/learn/${row.program_id}`;
  if (row.kind === "training") {
    if (row.finished) return `/training/path/attempt/${row.attempt_id}/report`;
    return row.status === "В процессе" ? `/training/path/attempt/${row.attempt_id}` : `/training/path/level/${row.level_id}`;
  }
  return row.finished || row.processing ? `/report/${row.session_id}` : row.mode === "online" ? `/practice?session=${row.session_id}` : `/play/${row.session_id}`;
}

function KpiCard({ label, value, note, help }) {
  return <article className="analytics-kpi-card">
    <AnalyticsLabel label={label} help={help} />
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

function TrendChart({ trend }) {
  const width = 720;
  const height = 250;
  const padding = { left: 42, right: 20, top: 22, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = trend.map((item, index) => {
    const x = trend.length === 1 ? padding.left + plotWidth / 2 : padding.left + index * plotWidth / (trend.length - 1);
    const score = clampScore(item.score);
    const y = padding.top + (100 - score) * plotHeight / 100;
    return { ...item, x, y, score };
  });
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = points.length ? `${line} L ${points.at(-1).x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z` : "";

  return <section className="analytics-panel analytics-trend-panel">
    <header className="analytics-panel-heading">
      <div><h2><AnalyticsLabel label="Динамика результата" help={HELP.trend} /></h2><p>Итоговый балл последних завершённых практик.</p></div>
      <span>{formatCount(trend.length, ["попытка", "попытки", "попыток"])}</span>
    </header>
    {points.length ? <>
      <svg className="analytics-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="analytics-trend-title analytics-trend-description">
        <title id="analytics-trend-title">Динамика результатов переговоров</title>
        <desc id="analytics-trend-description">Баллы последних завершённых практик по шкале от 0 до 100.</desc>
        {[0, 25, 50, 75, 100].map((value) => {
          const y = padding.top + (100 - value) * plotHeight / 100;
          return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text x={padding.left - 10} y={y + 4}>{value}</text></g>;
        })}
        <path className="analytics-trend-area" d={area} />
        <path className="analytics-trend-line" d={line} />
        {points.map((point) => <circle key={point.session_id} cx={point.x} cy={point.y} r="5">
          <title>{point.title}: {point.score} из 100, {formatShortDate(point.date)}</title>
        </circle>)}
        <text className="analytics-trend-date" x={points[0].x} y={height - 8} textAnchor="start">{formatShortDate(points[0].date)}</text>
        {points.length > 1 && <text className="analytics-trend-date" x={points.at(-1).x} y={height - 8} textAnchor="end">{formatShortDate(points.at(-1).date)}</text>}
      </svg>
      <div className="analytics-trend-latest"><AnalyticsLabel label="Последний результат" help={HELP.trend} /><strong>{points.at(-1).score}</strong><small>из 100</small></div>
    </> : <div className="analytics-empty-state"><strong>Динамика появится после первой практики</strong><p>Завершите сценарий, чтобы увидеть первую точку на графике.</p></div>}
  </section>;
}

function RhythmPanel({ weeklyGoal, streak }) {
  const target = Math.max(1, Number(weeklyGoal?.target) || 1);
  const completed = Math.max(0, Number(weeklyGoal?.completed) || 0);
  const percent = clampScore(weeklyGoal?.percent);
  return <section className="analytics-panel analytics-rhythm-panel">
    <header className="analytics-panel-heading"><div><h2><AnalyticsLabel label="Ритм практики" help={HELP.rhythm} /></h2><p>Текущая неделя и непрерывная серия.</p></div></header>
    <div className="analytics-rhythm-primary">
      <AnalyticsLabel label="Недельная цель" help={HELP.weekly} />
      <strong>{completed} <small>из {target}</small></strong>
    </div>
    <div className="analytics-progress-track" role="progressbar" aria-label="Выполнение недельной цели" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <div className="analytics-rhythm-meta"><span>Выполнено</span><strong>{percent}%</strong></div>
    <div className="analytics-rhythm-streak"><AnalyticsLabel label="Текущая серия" help={HELP.streak} /><strong>{formatCount(streak, ["день", "дня", "дней"])}</strong></div>
  </section>;
}

function DimensionsPanel({ dimensions }) {
  return <section className="analytics-panel analytics-dimensions-panel">
    <header className="analytics-panel-heading">
      <div><h2><AnalyticsLabel label="Навыки переговоров" help={HELP.dimensions} /></h2><p>Средние оценки по завершённым практикам и изменение последних результатов.</p></div>
      <span>0–100</span>
    </header>
    <ul className="analytics-dimension-list">
      {dimensions.map((item) => {
        const score = clampScore(item.score);
        const change = Number(item.change) || 0;
        return <li key={item.id}>
          <div><AnalyticsLabel label={item.label} help={dimensionHelp(item.id)} /><span className={`analytics-change${change > 0 ? " is-positive" : change < 0 ? " is-negative" : ""}`}>{change > 0 ? "+" : ""}{change}</span><strong>{score}</strong></div>
          <div className="analytics-skill-track" role="progressbar" aria-label={`${item.label}: ${score} из 100`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={score}><span style={{ width: `${score}%` }} /></div>
        </li>;
      })}
    </ul>
  </section>;
}

function CategoriesPanel({ categories }) {
  return <section className="analytics-panel analytics-categories-panel">
    <header className="analytics-panel-heading"><div><h2><AnalyticsLabel label="Сильные категории" help={HELP.categories} /></h2><p>Средний результат по типам ситуаций.</p></div></header>
    {categories.length ? <ol className="analytics-category-list">{categories.map((item) => {
      const score = clampScore(item.score);
      return <li key={item.category}>
        <div><strong><AnalyticsLabel label={item.category} help={`Средний итоговый балл завершённых практик категории «${item.category}» с полными метриками. В расчёте: ${formatCount(item.sessions, ["практика", "практики", "практик"])}.`} /></strong><span>{score}</span></div>
        <div className="analytics-category-track" role="progressbar" aria-label={`${item.category}: ${score} из 100`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={score}><span style={{ width: `${score}%` }} /></div>
        <small>{formatCount(item.sessions, ["практика", "практики", "практик"])}</small>
      </li>;
    })}</ol> : <div className="analytics-empty-state"><strong>Категории появятся позже</strong><p>Для сравнения нужна хотя бы одна завершённая практика.</p></div>}
  </section>;
}

function ReportCard({ item, kind, title, description, path, busy, onDownload }) {
  const eligible = Number(item?.eligible_reports) || 0;
  const required = Number(item?.required_reports) || 0;
  const readiness = required ? clampScore(eligible / required * 100) : 0;
  const details = item?.data;
  const isProgress = kind === "progress";
  return <article className="analytics-report-card">
    <header>
      <div><h3><AnalyticsLabel label={title} help={`${isProgress ? HELP.progress : HELP.twin} Для открытия нужно ${required} подходящих отчётов.`} /></h3><p>{description}</p></div>
      <span className={`analytics-report-status${item?.locked ? " is-locked" : " is-ready"}`}>{item?.locked ? "Собираем данные" : "Готов"}</span>
    </header>
    <div className="analytics-report-readiness">
      <div><AnalyticsLabel label="Подходящих отчётов" help={`${HELP.reports} Сейчас: ${eligible}; требуется: ${required}.`} /><strong>{eligible} / {required}</strong></div>
      <div className="analytics-progress-track" role="progressbar" aria-label={`Готовность отчёта «${title}»`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={readiness}><span style={{ width: `${readiness}%` }} /></div>
    </div>
    {item?.locked ? <p className="analytics-report-locked-copy">Нужно ещё {formatCount(Math.max(0, required - eligible), ["подходящий отчёт", "подходящих отчёта", "подходящих отчётов"])}.</p> : details && <>
      <div className="analytics-report-score-grid">
        <div><AnalyticsLabel label={isProgress ? "Текущий уровень" : "Лучший показанный уровень"} help={isProgress ? HELP.currentProgress : HELP.potential} /><strong>{isProgress ? details.current_score : details.potential_score}</strong></div>
        <div><AnalyticsLabel label={isProgress ? "Начальный уровень" : "Текущий уровень"} help={isProgress ? HELP.baselineProgress : HELP.currentTwin} /><strong>{isProgress ? details.baseline_score : details.current_score}</strong></div>
        {!isProgress && <div><AnalyticsLabel label="Доступный резерв" help={HELP.gap} /><strong>+{details.gap}</strong></div>}
      </div>
      <ul className="analytics-report-metrics">{(isProgress ? details.changes : Object.keys(details.potential || {}).map((id) => ({ id, baseline: details.current?.[id], current: details.potential?.[id], delta: (details.potential?.[id] || 0) - (details.current?.[id] || 0) }))).map((metric) => <li key={metric.id}>
        <AnalyticsLabel label={METRIC_LABELS[metric.id] || metric.id} help={reportMetricHelp(kind, METRIC_LABELS[metric.id] || metric.id)} /><strong>{metric.baseline} → {metric.current}</strong><em className={metric.delta >= 0 ? "is-positive" : "is-negative"}>{metric.delta > 0 ? "+" : ""}{metric.delta}</em>
      </li>)}</ul>
      {isProgress && details.milestones?.length > 0 && <div className="analytics-milestones"><h4><AnalyticsLabel label="Заметные улучшения" help={HELP.milestones} /></h4>{details.milestones.map((milestone) => <Link key={milestone.source_id} to={`/report/${milestone.source_id}`} state={{ returnTo: "/analytics" }}><span>{milestone.title}</span><strong>+{milestone.delta}</strong><ArrowUpRightIcon size={15} aria-hidden="true" /></Link>)}</div>}
      {!isProgress && details.disclaimer && <p className="analytics-report-disclaimer">{details.disclaimer}</p>}
      <button type="button" disabled={busy} className="analytics-note-cta" onClick={() => onDownload(path)}>{busy ? "Готовим PDF…" : "Скачать PDF"}</button>
    </>}
  </article>;
}

function Comparison({ item }) {
  return <article className="analytics-comparison">
    <header><h3><AnalyticsLabel label={item.title} help={item.detail} /></h3><p>{item.detail}</p></header>
    <div className="analytics-comparison-pair">
      <div><span>Раньше</span><blockquote>«{item.earlier_quote}»</blockquote><Link to={`/report/${item.earlier_session_id}`} state={{ returnTo: "/analytics" }}>Открыть разбор <ArrowUpRightIcon size={15} aria-hidden="true" /></Link></div>
      <div><span>Позже</span><blockquote>«{item.later_quote}»</blockquote><Link to={`/report/${item.later_session_id}`} state={{ returnTo: "/analytics" }}>Открыть разбор <ArrowUpRightIcon size={15} aria-hidden="true" /></Link></div>
    </div>
  </article>;
}

function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyKind, setHistoryKind] = useState("all");
  const [historyState, setHistoryState] = useState("all");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [pdfLoading, setPdfLoading] = useState("");

  const load = () => api("/api/analytics/overview").then(setData).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    let active = true;
    api("/api/history").then((rows) => { if (active) setHistoryRows(rows); })
      .catch((reason) => { if (active) setHistoryError(reason.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);

  async function downloadReport(path) {
    setPdfLoading(path);
    try { await downloadPrivate(`/api/analytics/${path}/pdf`, `arena-${path}.pdf`); }
    catch (reason) { setError(reason.message); }
    finally { setPdfLoading(""); }
  }

  const note = data?.progress_note || {};
  const iqPercent = clampScore((Number(data?.negotiation_iq) || 0) / 10);
  const header = <ForestSectionHeader title="Аналитика" line="Прогресс, который видно." description={note.summary || "Результаты практик, динамика навыков и подробные отчёты — чтобы видеть свои сильные стороны и следующий шаг."} image="profile">
    {data && <div className="analytics-iq-card">
      <AnalyticsLabel label="Индекс переговоров" help={HELP.index} />
      <div><strong>{data.negotiation_iq || 0}</strong><span className="analytics-iq-scale">из 1000</span></div>
      <div className="analytics-iq-track" role="progressbar" aria-label="Индекс переговоров" aria-valuemin="0" aria-valuemax="1000" aria-valuenow={data.negotiation_iq || 0}><span style={{ width: `${iqPercent}%` }} /></div>
      <div className="analytics-rank-line"><AnalyticsLabel label="Текущий уровень" help={HELP.rank} /><strong>{data.rank || "Новичок"}</strong></div>
    </div>}
  </ForestSectionHeader>;
  if (!data) return <main className="analytics-note-page analytics-forest">{header}{error
    ? <div className="analytics-load-state is-error" role="alert"><h2>Аналитика пока не открылась</h2><p>{error}</p><button className="primary-button" onClick={() => { setError(""); load(); }}>Повторить загрузку</button></div>
    : <div className="analytics-load-state" role="status">Собираем аналитику профиля…</div>}</main>;
  const knownSessions = new Set(historyRows.map((row) => String(row.session_id)));
  const savedReportRows = (note.recent_reports || [])
    .filter((report) => !knownSessions.has(String(report.session_id)))
    .map((report) => ({ id: `report:${report.session_id}`, kind: "negotiation", session_id: report.session_id, title: report.title, status: report.status || "Отчёт сохранён", finished: true, date: report.date }));
  const allHistoryRows = [...historyRows, ...savedReportRows]
    .sort((left, right) => (right.date || "").localeCompare(left.date || ""));
  const matchingHistory = allHistoryRows.filter((row) => (historyKind === "all" || row.kind === historyKind)
    && (historyState === "all" || (historyState === "finished" ? row.finished : !row.finished)));
  const visibleHistory = showAllHistory ? matchingHistory : matchingHistory.slice(0, 8);
  return <main className="analytics-note-page analytics-forest">
    {header}
    {note.basis && note.basis !== "Нет завершённых тренировок" && <p className="analytics-basis">{note.basis}</p>}

    <section className="analytics-kpi-grid" aria-label="Основные показатели">
      <KpiCard label="Средний результат" value={`${data.average_score || 0}%`} note="по завершённым практикам" help={HELP.average} />
      <KpiCard label="Лучший результат" value={`${data.best_score || 0}%`} note="личный максимум" help={HELP.best} />
      <KpiCard label="Завершено переговоров" value={data.sessions_total || 0} note="за всё время" help={HELP.sessions} />
      <KpiCard label="Короткие упражнения" value={data.drills_total || 0} note="в учебных программах" help={HELP.drills} />
    </section>

    <div className="analytics-dashboard-grid">
      <TrendChart trend={data.trend || []} />
      <RhythmPanel weeklyGoal={data.weekly_goal} streak={data.day_streak || 0} />
      <DimensionsPanel dimensions={data.dimensions || []} />
      <CategoriesPanel categories={data.category_strengths || []} />
    </div>

    <section className="analytics-report-section" aria-labelledby="analytics-reports-title">
      <div className="analytics-section-heading"><div><h2 id="analytics-reports-title"><AnalyticsLabel label="Подробные отчёты" help={HELP.reports} /></h2><p>Сравнивайте результаты завершённых практик по доверию, достижению цели, контролю и EQ.</p></div></div>
      <div className="analytics-report-grid">
        <ReportCard item={data.progress_report} kind="progress" title="Ваш прогресс" description="Сравнение первых и последних результатов по четырём ключевым метрикам." path="progress-report" busy={pdfLoading === "progress-report"} onDownload={downloadReport} />
        <ReportCard item={data.potential_twin} kind="twin" title="Цифровой двойник" description="Лучшее сочетание уровней, которые вы уже показывали в завершённых практиках." path="potential-twin" busy={pdfLoading === "potential-twin"} onDownload={downloadReport} />
      </div>
    </section>

    {(note.improvements?.length > 0 || note.repeating?.length > 0) && <div className="analytics-insight-grid">
      {note.improvements?.length > 0 && <section className="analytics-panel"><header className="analytics-panel-heading"><div><h2><AnalyticsLabel label="Что стало получаться" help={HELP.improvements} /></h2><p>Подтверждённые изменения в сопоставимых практиках.</p></div></header>{note.improvements.map((item, index) => <Comparison key={index} item={item} />)}</section>}
      {note.repeating?.length > 0 && <section className="analytics-panel"><header className="analytics-panel-heading"><div><h2><AnalyticsLabel label="Что продолжает мешать" help={HELP.repeating} /></h2><p>Повторяющиеся решения, на которые стоит обратить внимание.</p></div></header>{note.repeating.map((item, index) => <Comparison key={index} item={item} />)}</section>}
    </div>}

    {data.assignments?.length > 0 && <section className="analytics-panel analytics-assignment-panel">
      <header className="analytics-panel-heading"><div><h2><AnalyticsLabel label="Задания команды" help={HELP.assignments} /></h2><p>Назначенные сценарии и состояние выполнения.</p></div></header>
      <div className="analytics-assignment-list">{data.assignments.map((item) => <article key={item.id}><div><strong>{item.scenario_title}</strong>{item.deadline && <small>Срок: {new Date(item.deadline).toLocaleDateString("ru-RU")}</small>}</div><span>{item.completed ? "Выполнено" : "Назначено"}</span>{!item.completed && <Link to={`/setup?preset=${encodeURIComponent(item.scenario_id)}`} state={{ returnTo: "/analytics" }}>Начать <ArrowUpRightIcon size={15} aria-hidden="true" /></Link>}</article>)}</div>
    </section>}

    <section className="analytics-panel analytics-history-section" aria-labelledby="analytics-history-title">
      <details className="analytics-history-details">
        <summary><span><strong id="analytics-history-title" className="analytics-history-title"><AnalyticsLabel label="Последние занятия" help={HELP.history} /></strong><small>{formatCount(allHistoryRows.length, ["запись", "записи", "записей"])} в истории</small></span><CaretDownIcon className="analytics-history-caret" size={22} weight="bold" aria-hidden="true" /></summary>
        <div className="analytics-history-content">
          <div className="history-toolbar"><div role="group" aria-label="Тип активности">{HISTORY_KINDS.map(([value, label]) => <button key={value} type="button" aria-pressed={historyKind === value} onClick={() => setHistoryKind(value)}>{label}</button>)}</div>
            <label>Состояние <select aria-label="Состояние занятий" value={historyState} onChange={(event) => setHistoryState(event.target.value)}><option value="all">Все</option><option value="finished">Завершённые</option><option value="unfinished">Незавершённые</option></select></label>
          </div>
          {historyError && <div className="product-error" role="alert"><p>{historyError}</p><button className="subtle-button" onClick={() => { setHistoryLoading(true); setHistoryError(""); api("/api/history").then(setHistoryRows).catch((reason) => setHistoryError(reason.message)).finally(() => setHistoryLoading(false)); }}>Повторить загрузку</button></div>}
          {historyLoading ? <p className="product-loading" role="status">Загружаем занятия…</p> : visibleHistory.length ? <div className="history-list">{visibleHistory.map((row) => <Link key={row.id} to={historyDestination(row)} state={{ returnTo: "/analytics" }} className="history-row">
            <span className="history-row-main"><span className="history-row-kind">{HISTORY_KIND_LABELS[row.kind] || "Активность"} · {row.status}</span><b>{row.title}</b></span>
            <span className="history-row-action">{row.finished ? "Открыть разбор" : row.status === "В процессе" ? "Продолжить" : "Открыть"}<ArrowUpRightIcon size={15} aria-hidden="true" /></span>
          </Link>)}</div> : <div className="product-empty"><b>Здесь пока нет занятий</b><p>{allHistoryRows.length ? "Измените фильтры, чтобы увидеть другие записи." : "Начните сценарий или тренировку — записи появятся здесь."}</p>{allHistoryRows.length > 0 && <button className="subtle-button" onClick={() => { setHistoryKind("all"); setHistoryState("all"); }}>Сбросить фильтры</button>}</div>}
          {!historyLoading && matchingHistory.length > 8 && <button type="button" className="analytics-note-cta" onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? "Показать последние 8" : `Показать всю историю · ${matchingHistory.length}`}</button>}
        </div>
      </details>
    </section>

  </main>;
}

export default function Analytics() {
  return <AnalyticsInfoProvider><AnalyticsDashboard /></AnalyticsInfoProvider>;
}
