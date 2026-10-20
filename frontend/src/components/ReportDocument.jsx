import { useId, useState } from "react";
import "./report-document.css";
import ReportAppendix, { ReportOverview, ReportMethodology } from "./ReportAppendix.jsx";

const statusTone = {
  "Достигнута": "success",
  "Уровень завершён": "success",
  "Частично": "partial",
  "Не достигнута": "failed",
  "Результат не подтверждён": "unknown",
};

function legacyNarrative(report) {
  const explicitOutcome = report.outcome || report.ending_id;
  const status = ["goal_achieved", "win_win", "win", "process_ok", "online_success", "excellent", "good"].includes(explicitOutcome)
    ? "Достигнута"
    : ["failure", "conflict", "needs_work"].includes(explicitOutcome)
      ? "Не достигнута" : "Результат не подтверждён";
  const sections = (report.mistakes || []).filter((item) => item.chosen).slice(0, 3).map((item, index) => ({
    id: `legacy-${index}`,
    kind: "improve",
    title: item.what || "Момент для повторной попытки",
    body: "Этот вывод сохранён в отчёте прежнего формата. Полная последовательность реплик здесь недоступна.",
    evidence: { speaker: "Вы", quote: item.chosen },
    alternative: item.alternative,
  }));
  return {
    status,
    headline: report.verdict || report.scenario_title || "Разбор беседы",
    lead: report.summary || "Для этой сессии сохранён отчёт прежнего формата.",
    takeaway: "Новые тренировки получают разбор с цитатами и конкретным следующим шагом.",
    sections,
    next_step: (report.recommendations || [])[0] || "Повторите ситуацию, чтобы получить новый подробный разбор.",
    source: "legacy",
  };
}

export default function ReportDocument({ report, sessionMeta, example = false, onRetry, retryLabel = "Повторить ситуацию", onReturn, onDownloadPdf, pdfLoading = false, nextActionsOnly = false, modeLabel, detailed = false }) {
  const transcriptId = useId();
  const [openTurn, setOpenTurn] = useState(null);
  const hiring = detailed || Boolean(report.hiring_result) || report.report_kind === "hiring";
  const note = report.narrative || legacyNarrative(report);
  const sections = Array.isArray(note.sections) ? note.sections : [];
  const moments = sections.map((item, index) => ({ item, index }));
  const momentGroups = [
    { kind: "strength", title: "Что помогло", empty: "В этом разборе не выделены отдельные сильные ходы." },
    { kind: "improve", title: "Что стоит изменить", empty: "В этом разборе не выделены отдельные моменты для изменения." },
    { kind: "sequence", title: "Ход разговора", empty: "В этом разборе нет отдельных наблюдений о ходе разговора." },
  ];
  const finished = sessionMeta?.finished_at || sessionMeta?.created_at;
  const date = finished ? new Date(finished).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  const resolvedModeLabel = modeLabel || (sessionMeta?.mode === "online" ? "Разговор с ИИ" : "Сценарий");
  const genericHeadline = ["Онлайн-переговоры", "Практика переговоров", "Разбор вашей беседы"].includes(note.headline);
  const headline = genericHeadline ? (report.practice_context?.problem ? `Разбор: ${report.practice_context.problem}` : "Разбор вашей беседы") : note.headline;
  const showScenarioMeta = report.scenario_title && report.scenario_title !== headline && !["Онлайн-переговоры", "Практика переговоров"].includes(report.scenario_title);
  function revealTurn(turn) {
    setOpenTurn(turn);
    requestAnimationFrame(() => {
      const target = document.getElementById(`${transcriptId}-${turn}`);
      if (!target) return;
      const transcript = target.closest(".report-transcript-disclosure");
      if (transcript) transcript.open = true;
      target.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  const resultLabel = hiring ? report.hiring_result?.label || "Собеседование завершено" : note.status || "Результат не подтверждён";
  const resultTone = hiring ? (report.hiring_result?.outcome === "won" ? "success" : "partial") : statusTone[note.status] || "unknown";
  return <div className="report-document">
    <div className="report-document-layout">
      <article className="report-document-main">
        <header id="report-summary" className="report-document-hero">
          <div className="report-document-hero-heading">
            <h1>{headline || "Разбор вашей беседы"}</h1>
            <div className="report-document-meta">
              {date && <span>{date}</span>}
              {example && <span>Учебный пример</span>}
              <span>{resolvedModeLabel}</span>
              {showScenarioMeta && <span>{report.scenario_title}</span>}
            </div>
          </div>
          <div className="report-document-overview">
            {note.lead && <p className="report-document-lead">{note.lead}</p>}
          </div>
          <div className="report-document-result">
            <span className={`report-document-status ${resultTone}`}>{resultLabel}</span>
            {note.completion_reason && <p className="report-document-footnote">{note.completion_reason}</p>}
            {note.takeaway && <p className="report-document-summary-note"><strong>Короткий итог. </strong>{note.takeaway}</p>}
          </div>
        </header>
        <ReportMethodology report={report} />

        <div id="report-moments" className="report-document-moments-grid">
          {momentGroups.map((group, groupIndex) => {
            const items = moments.filter(({ item }) => group.kind === "sequence" ? !["strength", "improve"].includes(item.kind) : item.kind === group.kind);
            return <section className="report-document-moment-card" key={group.kind} aria-labelledby={`${transcriptId}-moment-${group.kind}`}>
              <header className="report-document-moment-heading"><span className="report-document-number">{String(groupIndex + 1).padStart(2, "0")}</span><h2 id={`${transcriptId}-moment-${group.kind}`}>{group.title}</h2></header>
              {items.length ? items.map(({ item, index }) => <section id={`report-moment-${index + 1}`} className="report-document-section" key={`${item.id}-${index}`}>
                {item.title && <h3>{item.title}</h3>}
                {item.body && <p>{item.body}</p>}{item.context?.text && <div className="report-document-context"><small>{item.context.position === "after" ? `Ответ · ${report.speakers?.opponent || "ИИ"}` : "Перед вашим ответом"}</small><p>«{item.context.text}»</p></div>}
                {item.evidence?.quote && <figure className="report-document-evidence"><figcaption>{item.evidence.speaker || "Вы"}{item.evidence.turn ? ` · реплика ${item.evidence.turn}` : ""}</figcaption><blockquote>«{item.evidence.quote}»</blockquote></figure>}
                {item.evidence?.turn && (report.turn_reviews?.length > 0 || report.transcript?.length > 0) && <button type="button" className="report-evidence-link" onClick={() => revealTurn(item.evidence.turn)}>Показать в разговоре</button>}
                {item.principle?.label && <div className="report-document-principle"><b>{item.principle.label}</b><p>{item.principle.explanation}</p>{item.principle.url && <a href={item.principle.url} target="_blank" rel="noreferrer">Подробнее о принципе ↗</a>}{item.principle.sources?.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p>)}</div>}{item.alternative && <aside className="report-document-card-tip"><strong>Упражнение по этому правилу</strong><p>{item.alternative}</p></aside>}
              </section>) : <p className="report-document-moment-empty">{group.empty}</p>}
            </section>;
          })}
        </div>

        <ReportOverview report={report} />

        <ReportAppendix report={report} note={note} idPrefix={transcriptId} openTurn={openTurn} />
        {!hiring && report.scoring_explanation && <details className="scoring-details"><summary>Основания оценки по ходам</summary><p>{report.scoring_explanation.description}</p>{report.scoring_explanation.turns?.map(row => <div key={row.turn}><p><b>Ход {row.turn}</b>: «{row.quote}»</p>{row.changes?.length ? row.changes.map((change, index) => <p key={index}>{change.label}: {change.actual_delta > 0 ? "+" : ""}{change.actual_delta}. {change.reason}{change.evidence?.map((e, i) => <span key={i}> · {e.tag}: «{e.quote}»</span>)}</p>) : <p>Подтверждённых изменений нет.</p>}</div>)}</details>}

        {nextActionsOnly ? onRetry && <div className="report-document-actions report-document-actions--standalone"><button type="button" onClick={onRetry}>{retryLabel}</button></div> : <section className="report-document-next">
          <div className="report-document-kicker">СЛЕДУЮЩАЯ ПОПЫТКА</div>
          <h2>Что попробовать дальше</h2>
          <p>{note.next_step || "Повторите ситуацию и сравните решения."}</p>
          <div className="report-document-actions">
            {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
            {onReturn && <button type="button" className="secondary" onClick={onReturn}>Вернуться</button>}
            {onDownloadPdf && <button type="button" className="secondary" disabled={pdfLoading} onClick={onDownloadPdf}>{pdfLoading ? "Готовим PDF…" : "Скачать подробный PDF"}</button>}
            {example && <a href="/login">Открыть тренировки</a>}
          </div>
        </section>}
        {example && <p className="report-document-footnote">Это пример формата по вымышленному диалогу. В настоящем отчёте цитаты и выводы берутся из конкретной сессии.</p>}
        {!example && note.source === "transcript" && <p className="report-document-footnote">Автоматический разбор был недоступен; здесь показаны подтверждённые фрагменты стенограммы.</p>}
      </article>
    </div>
  </div>;
}
