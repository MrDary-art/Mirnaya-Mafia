import { useId, useState } from "react";
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

export default function ReportDocument({ report, sessionMeta, example = false, onRetry, retryLabel = "Повторить ситуацию", onReturn }) {
  const prefix = useId().replaceAll(":", "");
  const anchor = (name) => `${prefix}-${name}`;
  const [showTranscript, setShowTranscript] = useState(false);
  const note = report.narrative || legacyNarrative(report);
  const sections = Array.isArray(note.sections) ? note.sections : [];
  const hasContents = sections.length > 0;
  const finished = sessionMeta?.finished_at || sessionMeta?.created_at;
  const date = finished ? new Date(finished).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  return <div className="report-document">
    <div className="report-document-layout">
      {hasContents && <nav className="report-document-toc" aria-label="Содержание отчёта">
        <div className="report-document-kicker">В этом разборе</div>
        <a href={`#${anchor("result")}`}>Итог разговора</a>
        {sections.map((item, index) => <a key={`${item.id}-${index}`} href={`#${anchor(`moment-${index}`)}`}>{String(index + 1).padStart(2, "0")} · {item.title}</a>)}
        <a href={`#${anchor("next")}`}>Следующая попытка</a>
        <p>Выводы основаны на записанных репликах этой сессии.</p>
      </nav>}
      <article className="report-document-main">
        <header id={anchor("result")} className="report-document-hero">
          <div className="report-document-kicker">Личный разбор · {example ? "пример оформления" : report.scenario_title || "Практика"}</div>
          <h1>{note.headline || "Разбор вашей беседы"}</h1>
          <div className="report-document-meta">{date && <span>{date}</span>}{example && <span>Учебный пример</span>}{sessionMeta?.mode && <span>{sessionMeta.mode === "online" ? "Разговор с ИИ" : "Сценарий"}</span>}</div>
          <p className="report-document-lead">{note.lead}</p>
          <span className={`report-document-status ${statusTone[note.status] || "unknown"}`}>{note.status || "Результат не подтверждён"}</span>
          {note.completion_reason && <p className="report-document-footnote">{note.completion_reason}</p>}
          {report.learning_support && <section className="report-learning-support"><h2>{report.learning_support.used ? "Результат с поддержкой ментора" : "Самостоятельная работа"}</h2><p>{report.learning_support.summary}</p>{report.learning_support.used && <p>Обращений: {report.learning_support.exchanges}. Ответов до помощи: {report.learning_support.independent_answers}; после её активации: {report.learning_support.answers_after_activation}. Это не оценка вашего общего уровня — только условия этой попытки.</p>}</section>}
          {note.goal_evidence?.quote && <p className="report-document-goal-evidence">Основание итога · {note.goal_evidence.speaker === "opponent" ? "собеседник" : "вы"}: «{note.goal_evidence.quote}»</p>}
          {note.takeaway && note.status !== "Результат не подтверждён" && <div className="report-document-takeaway">{note.takeaway}</div>}
        </header>

        {sections.map((item, index) => <section id={anchor(`moment-${index}`)} className="report-document-section" key={`${item.id}-${index}`}>
          <div className="report-document-number">{String(index + 1).padStart(2, "0")} / {item.kind === "strength" ? "ЧТО ПОМОГЛО" : item.kind === "improve" ? "ЧТО СТОИТ ИЗМЕНИТЬ" : "ХОД РАЗГОВОРА"}</div>
          <h2>{item.title}</h2>
          {item.body && <p>{item.body}</p>}
          {item.context?.text && <div className="report-document-context"><small>{item.context.position === "after" ? "Ответ собеседника" : "Перед вашим ответом"}</small><p>«{item.context.text}»</p></div>}
          {item.evidence?.quote && <figure className="report-document-quote"><figcaption>{item.evidence.speaker || "Вы"}{item.evidence.turn ? ` · реплика ${item.evidence.turn}` : ""}</figcaption><blockquote>«{item.evidence.quote}»</blockquote></figure>}
          {item.evidence?.turn && report.transcript?.length > 0 && <button className="report-evidence-link" onClick={() => { setShowTranscript(true); requestAnimationFrame(() => document.getElementById(anchor(`turn-${item.evidence.turn}`))?.scrollIntoView({ behavior: "smooth", block: "center" })); }}>Показать в разговоре</button>}
          {item.alternative && <aside className="report-document-alternative"><strong>Попробуйте иначе</strong><p>{item.alternative}</p></aside>}
          {item.principle?.label && item.principle?.url && <div className="report-document-theory"><strong>Переговорный принцип: {item.principle.label}.</strong> {item.principle.explanation && <span>{item.principle.explanation} </span>}<a href={item.principle.url} target="_blank" rel="noreferrer">Открыть источник ↗</a></div>}
        </section>)}

        {Array.isArray(note.agreement_table) && note.agreement_table.length > 0 && <section className="report-document-section" id={anchor("terms")}>
          <div className="report-document-number">УСЛОВИЯ РАЗГОВОРА</div><h2>Что обсуждали и подтвердили</h2>
          <div className="report-document-table-scroll"><table><thead><tr><th>Условие</th><th>Предложили</th><th>Подтвердили</th></tr></thead><tbody>{note.agreement_table.map((row, index) => <tr key={index}><td>{row.label}</td><td>{row.proposed}</td><td>{row.confirmed}</td></tr>)}</tbody></table></div>
        </section>}

        {Array.isArray(note.requirements) && note.requirements.length > 0 && <section className="report-document-section" id={anchor("requirements")}>
          <div className="report-document-number">ЗАДАНИЕ КОМАНДЫ</div><h2>Требования и подтверждения</h2>
          <p>Здесь показаны только действия, которые можно связать с записанным выбором. Отсутствие подтверждения не означает, что требование нарушено.</p>
          <div className="report-document-table-scroll"><table><thead><tr><th>Требование</th><th>По записи</th><th>Подтверждение</th></tr></thead><tbody>{note.requirements.map((item, index) => <tr key={index}><td>{item.label}</td><td>{item.status}</td><td>{item.evidence?.quote ? `«${item.evidence.quote}»` : "Нужны дополнительные данные"}</td></tr>)}</tbody></table></div>
        </section>}

        {note.constraints && <section className="report-document-section"><h2>Условия задачи</h2><p>{note.constraints}</p><p>Соблюдение ограничений оценивается только по тому, что подтверждено в разговоре.</p></section>}
        {report.transcript?.length > 0 && <details className="report-transcript" open={showTranscript} onToggle={(event) => setShowTranscript(event.currentTarget.open)}><summary>Сохранённый разговор · {report.transcript.length} ответов</summary>{report.transcript.map((turn, index) => <div id={anchor(`turn-${index + 1}`)} key={index} tabIndex={-1}><small>Ответ {index + 1}</small>{turn.context && <p><b>Собеседник:</b> {turn.context}</p>}<p><b>Вы:</b> {turn.text}</p>{turn.reply && <p><b>Собеседник:</b> {turn.reply}</p>}</div>)}</details>}
        <section id={anchor("next")} className="report-document-next">
          <div className="report-document-kicker">СЛЕДУЮЩАЯ ПОПЫТКА</div>
          <h2>Что попробовать дальше</h2>
          <p>{note.next_step || "Повторите ситуацию и сравните решения."}</p>
          <div className="report-document-actions">
            {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
            {onReturn && <button type="button" className="secondary" onClick={onReturn}>Вернуться</button>}
            <button type="button" className="secondary" onClick={() => window.print()}>Сохранить PDF</button>
            {example && <a href="/login">Открыть тренировки</a>}
          </div>
        </section>
        {example && <p className="report-document-footnote">Это пример формата по вымышленному диалогу. В настоящем отчёте цитаты и выводы берутся из конкретной сессии.</p>}
        {!example && note.source === "transcript" && <p className="report-document-footnote">Автоматический разбор был недоступен; здесь показаны подтверждённые фрагменты стенограммы.</p>}
      </article>
    </div>
  </div>;
}
