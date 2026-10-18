import "./report-document.css";

const statusTone = {
  "Достигнута": "success",
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

export default function ReportDocument({ report, sessionMeta, example = false, onRetry, retryLabel = "Повторить ситуацию", onReturn, onDownloadPdf, pdfLoading = false, nextActionsOnly = false }) {
  const note = report.narrative || legacyNarrative(report);
  const sections = Array.isArray(note.sections) ? note.sections.slice(0, 3) : [];
  const finished = sessionMeta?.finished_at || sessionMeta?.created_at;
  const date = finished ? new Date(finished).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  return <div className="report-document">
    <div className="report-document-layout">
      <article className="report-document-main">
        <header className="report-document-hero">
          <div className="report-document-hero-heading">
            <h1>{note.headline || "Разбор вашей беседы"}</h1>
            <div className="report-document-meta">
              {date && <span>{date}</span>}
              {example && <span>Учебный пример</span>}
              <span>{sessionMeta?.mode === "online" ? "Разговор с ИИ" : "Сценарий"}</span>
              {report.scenario_title && <span>{report.scenario_title}</span>}
            </div>
          </div>
          <div className="report-document-overview">
            {note.lead && <p className="report-document-lead">{note.lead}</p>}
          </div>
          <div className="report-document-result">
            <span className={`report-document-status ${statusTone[note.status] || "unknown"}`}>{note.status || "Результат не подтверждён"}</span>
            {note.completion_reason && <p className="report-document-footnote">{note.completion_reason}</p>}
            {note.takeaway && note.status !== "Результат не подтверждён" && <p className="report-document-summary-note">{note.takeaway}</p>}
          </div>
        </header>

        {sections.length > 0 && <div className="report-document-moments-grid">
          {sections.map((item, index) => <section className="report-document-section" key={`${item.id}-${index}`}>
            <div className="report-document-number">{String(index + 1).padStart(2, "0")} / {item.kind === "strength" ? "ЧТО ПОМОГЛО" : item.kind === "improve" ? "ЧТО СТОИТ ИЗМЕНИТЬ" : "ХОД РАЗГОВОРА"}</div>
            <h2>{item.title}</h2>
            {item.body && <p>{item.body}</p>}
            {item.evidence?.quote && <figure className="report-document-evidence"><figcaption>{item.evidence.speaker || "Вы"}{item.evidence.turn ? ` · реплика ${item.evidence.turn}` : ""}</figcaption><blockquote>«{item.evidence.quote}»</blockquote></figure>}
            {item.alternative && <aside className="report-document-card-tip"><strong>Попробуйте иначе</strong><p>{item.alternative}</p></aside>}
          </section>)}
        </div>}

        {nextActionsOnly ? onRetry && <div className="report-document-actions report-document-actions--standalone"><button type="button" onClick={onRetry}>{retryLabel}</button></div> : <section className="report-document-next">
          <div className="report-document-kicker">СЛЕДУЮЩАЯ ПОПЫТКА</div>
          <h2>Что попробовать дальше</h2>
          <p>{note.next_step || "Повторите ситуацию и сравните решения."}</p>
          <div className="report-document-actions">
            {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
            {onReturn && <button type="button" className="secondary" onClick={onReturn}>Вернуться</button>}
            {onDownloadPdf && <button type="button" className="secondary" disabled={pdfLoading} onClick={onDownloadPdf}>{pdfLoading ? "Готовим PDF…" : "Скачать PDF"}</button>}
            {example && <a href="/login">Открыть тренировки</a>}
          </div>
        </section>}
        {example && <p className="report-document-footnote">Это пример формата по вымышленному диалогу. В настоящем отчёте цитаты и выводы берутся из конкретной сессии.</p>}
        {!example && note.source === "transcript" && <p className="report-document-footnote">Автоматический разбор был недоступен; здесь показаны подтверждённые фрагменты стенограммы.</p>}
      </article>
    </div>
  </div>;
}
