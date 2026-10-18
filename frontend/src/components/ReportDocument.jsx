import { useId, useState } from "react";
import "./report-document.css";

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
  const [showTranscript, setShowTranscript] = useState(false);
  const note = report.narrative || legacyNarrative(report);
  const sections = Array.isArray(note.sections) ? (detailed ? note.sections : note.sections.slice(0, 3)) : [];
  function revealTurn(turn) {
    setShowTranscript(true);
    requestAnimationFrame(() => document.getElementById(`${transcriptId}-${turn}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  const finished = sessionMeta?.finished_at || sessionMeta?.created_at;
  const date = finished ? new Date(finished).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  const resolvedModeLabel = modeLabel || (sessionMeta?.mode === "online" ? "Разговор с ИИ" : "Сценарий");
  const resultLabel = detailed ? report.hiring_result?.label || "Собеседование завершено" : note.status || "Результат не подтверждён";
  const resultTone = detailed ? (report.hiring_result?.outcome === "won" ? "success" : "partial") : statusTone[note.status] || "unknown";
  return <div className="report-document">
    <div className="report-document-layout">
      <article className="report-document-main">
        <header className="report-document-hero">
          <div className="report-document-hero-heading">
            <h1>{note.headline || "Разбор вашей беседы"}</h1>
            <div className="report-document-meta">
              {date && <span>{date}</span>}
              {example && <span>Учебный пример</span>}
              <span>{resolvedModeLabel}</span>
              {report.scenario_title && <span>{report.scenario_title}</span>}
            </div>
          </div>
          <div className="report-document-overview">
            {note.lead && <p className="report-document-lead">{note.lead}</p>}
          </div>
          <div className="report-document-result">
            <span className={`report-document-status ${resultTone}`}>{resultLabel}</span>
            {note.completion_reason && <p className="report-document-footnote">{note.completion_reason}</p>}
            {note.takeaway && note.status !== "Результат не подтверждён" && <p className="report-document-summary-note">{note.takeaway}</p>}
          </div>
        </header>

        {sections.length > 0 && <div className="report-document-moments-grid">
          {sections.map((item, index) => <section className="report-document-section" key={`${item.id}-${index}`}>
            <div className="report-document-number">{String(index + 1).padStart(2, "0")} / {item.kind === "strength" ? "ЧТО ПОМОГЛО" : item.kind === "improve" ? "ЧТО СТОИТ ИЗМЕНИТЬ" : "ХОД РАЗГОВОРА"}</div>
            <h2>{item.title}</h2>
            {item.body && <p>{item.body}</p>}
            {detailed && item.context?.text && <div className="report-document-context"><small>{item.context.position === "after" ? "Ответ интервьюера" : "Вопрос интервьюера"}</small><p>«{item.context.text}»</p></div>}
            {item.evidence?.quote && <figure className="report-document-evidence"><figcaption>{item.evidence.speaker || "Вы"}{item.evidence.turn ? ` · реплика ${item.evidence.turn}` : ""}</figcaption><blockquote>«{item.evidence.quote}»</blockquote></figure>}
            {detailed && item.evidence?.turn && report.transcript?.length > 0 && <button type="button" className="report-evidence-link" onClick={() => revealTurn(item.evidence.turn)}>Показать в разговоре</button>}
            {item.alternative && <aside className="report-document-card-tip"><strong>Попробуйте иначе</strong><p>{item.alternative}</p></aside>}
          </section>)}
        </div>}

        {!detailed && report.scoring_explanation && <details className="scoring-details"><summary>Основания оценки по ходам</summary><p>{report.scoring_explanation.description}</p>{report.scoring_explanation.turns?.map(row => <div key={row.turn}><p><b>Ход {row.turn}</b>: «{row.quote}»</p>{row.changes?.length ? row.changes.map((change, index) => <p key={index}>{change.label}: {change.actual_delta > 0 ? "+" : ""}{change.actual_delta}. {change.reason}{change.evidence?.map((e, i) => <span key={i}> · {e.tag}: «{e.quote}»</span>)}</p>) : <p>Подтверждённых изменений нет.</p>}</div>)}</details>}

        {detailed && report.transcript?.length > 0 && <details className="report-transcript" open={showTranscript} onToggle={event => setShowTranscript(event.currentTarget.open)}><summary>Сохранённое собеседование · {report.transcript.length} ответов</summary>{report.transcript.map((turn, index) => <div id={`${transcriptId}-${index + 1}`} key={index} tabIndex={-1}><small>Ответ {index + 1}</small>{turn.context && <p><b>Интервьюер:</b> {turn.context}</p>}<p><b>Вы:</b> {turn.text}</p>{turn.reply && <p><b>Интервьюер:</b> {turn.reply}</p>}</div>)}</details>}
        {detailed && report.recommendations?.length > 0 && <section className="report-document-section"><h2>Рекомендации по собеседованию</h2>{report.recommendations.map((text, index) => <p key={index}>{text}</p>)}</section>}

        {nextActionsOnly ? onRetry && <div className="report-document-actions report-document-actions--standalone"><button type="button" onClick={onRetry}>{retryLabel}</button></div> : <section className="report-document-next">
          <div className="report-document-kicker">СЛЕДУЮЩАЯ ПОПЫТКА</div>
          <h2>Что попробовать дальше</h2>
          <p>{note.next_step || "Повторите ситуацию и сравните решения."}</p>
          <div className="report-document-actions">
            {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
            {onReturn && <button type="button" className="secondary" onClick={onReturn}>Вернуться</button>}
            {onDownloadPdf && <button type="button" className="secondary" disabled={pdfLoading} onClick={onDownloadPdf}>{pdfLoading ? "Готовим PDF…" : "Скачать отчет в PDF"}</button>}
            {example && <a href="/login">Открыть тренировки</a>}
          </div>
        </section>}
        {example && <p className="report-document-footnote">Это пример формата по вымышленному диалогу. В настоящем отчёте цитаты и выводы берутся из конкретной сессии.</p>}
        {!example && note.source === "transcript" && <p className="report-document-footnote">Автоматический разбор был недоступен; здесь показаны подтверждённые фрагменты стенограммы.</p>}
      </article>
    </div>
  </div>;
}
