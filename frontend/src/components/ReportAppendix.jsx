import { useEffect, useRef } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";

const labels = {trust:"Доверие",goal:"Продвижение к цели",control:"Управление разговором",eq:"Эмоциональная регуляция"};

export function ReportMethodology({ report }) {
  const method = report.methodology;
  if (!method) return null;
  const sources = [...new Map((method.rules || []).flatMap(rule => rule.sources || []).map(source => [source.url, source])).values()];
  return <details className="report-detail-panel"><summary>На чём основан разбор</summary>
    <p>Выводов с проверенной цитатой, применимым правилом и отдельной проверкой интерпретации: {method.verified_findings}.</p>
    {!method.verified_findings && <p>Проверенных по этой методике выводов пока нет. Сохранённые реплики доступны ниже; сами по себе они не доказывают применение приёма.</p>}
    <p>{method.limitations}</p><p>{method.tki_note}</p>
    {sources.length > 0 && <ul>{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul>}
  </details>;
}

function MetricDiagram({ label, value, start = 50 }) {
  if (!Number.isFinite(value)) return <article><span>{label}</span><b>Нет оценки</b></article>;
  const score = Math.max(0, Math.min(100, value));
  const delta = value - start;
  return <article><span>{label}</span><b>{value} <small>/ 100</small></b><div className="report-score-track" role="img" aria-label={`${label}: начало ${start}, итог ${value}`}><div style={{width:`${score}%`}} /><i style={{left:`${start}%`}} title={`Начало: ${start}`} /></div><div className="report-score-scale"><span>0</span><span>50</span><span>100</span></div><p className="report-score-change">Начало: {start} → итог: {value}<br /><strong>{delta > 0 ? "+" : ""}{delta} за разговор</strong></p></article>;
}

export function ReportOverview({ report }) {
  const context = report.practice_context || {}, support=report.learning_support;
  const values = report.metrics?.values || report.metrics || {};
  const chart = report.metrics_chart || [];
  const measured = report.metrics_coverage?.measured || 0;
  return <>
    {report.hiring_result?.methodology && <details className="report-detail-panel"><summary>Критерии сравнения кандидатов</summary><p>{report.hiring_result.methodology.limitations}</p><a href={report.hiring_result.methodology.source.url} target="_blank" rel="noreferrer">{report.hiring_result.methodology.source.title} ↗</a></details>}
    {context.problem && <section id="report-task" className="report-detail-panel"><span className="report-document-number">ЗАДАЧА</span><h2>С чего начался разговор</h2><p>{context.problem}</p><dl className="report-context-list">{[["Ваша роль",context.role],["Цель",context.goal],["Ограничения",context.constraints]].filter(([,v])=>v).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
    {support && <section className="report-learning-support"><h2>{support.used ? "Работа с поддержкой ментора" : "Самостоятельная попытка"}</h2><p>{support.summary}</p>{support.used && <p>Обращений: {support.exchanges}. Ответов до активации: {support.independent_answers}; после: {support.answers_after_activation}.</p>}</section>}
    {Object.keys(labels).some(key=>Number.isFinite(values[key])) && <section id="report-dynamics" className="report-detail-panel"><span className="report-document-number">ДИНАМИКА</span><h2>Результат разговора</h2>{measured ? <><div className="report-metric-grid">{Object.entries(labels).map(([key,label])=><MetricDiagram key={key} label={label} value={values[key]} start={chart[0]?.[key] ?? (key === "goal" ? 40 : 50)} />)}</div><p className="report-document-footnote">Заливка — итоговая оценка. Вертикальная отметка — значение до разговора. Шкала от 0 до 100. Продвижение к цели — учебный показатель; подтверждение соглашения проверяется отдельно.</p></> : <p>Для этой записи нет подтверждённых оценок реплик: во время разговора анализ не был доступен. Стартовые значения не выдаются за динамику.</p>}</section>}
    {report.final_decision && <section className="report-detail-panel"><h2>{report.final_decision.kind==="no_deal" ? "Подтверждённый отказ от сделки" : "Согласованный следующий шаг"}</h2><p>{report.final_decision.reason}</p><blockquote>«{report.final_decision.proposal?.quote}»</blockquote><blockquote>«{report.final_decision.confirmation?.quote}»</blockquote></section>}
  </>;
}

export default function ReportAppendix({ report, note, idPrefix, openTurn }) {
  const transcriptRef = useRef(null);
  useEffect(() => {
    let snapshot = null;
    const restore = () => {
      snapshot?.forEach(([element, open]) => { element.open = open; });
      snapshot = null;
    };
    const expand = () => {
      const root = transcriptRef.current;
      if (!root || snapshot) return;
      snapshot = [root, ...root.querySelectorAll("details")].map(element => [element, element.open]);
      snapshot.forEach(([element]) => { element.open = true; });
    };
    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
      restore();
    };
  }, []);
  const opponent = report.speakers?.opponent || "ИИ";
  const turns=report.turn_reviews || report.transcript?.map((row,i)=>({turn:i+1,player:row.text,before:row.context,after:row.reply})) || [];
  return <>
    {note.agreement_table?.length>0 && <section className="report-detail-panel"><span className="report-document-number">УСЛОВИЯ И ПОДТВЕРЖДЕНИЯ</span><h2>О чём договорились, а что осталось открытым</h2><div className="report-document-table-scroll"><table><thead><tr><th>Условие</th><th>Предложение</th><th>Подтверждение</th></tr></thead><tbody>{note.agreement_table.map((row,i)=><tr key={i}><td>{row.label}</td><td>{row.proposed}</td><td>{row.confirmed}</td></tr>)}</tbody></table></div></section>}
    {note.requirements?.length>0 && <section className="report-detail-panel"><h2>Требования задания</h2>{note.requirements.map((item,i)=><div key={i}><h3>{item.label}</h3><p>{item.status}</p>{item.evidence?.quote&&<blockquote>«{item.evidence.quote}»</blockquote>}</div>)}</section>}
    {report.recommendations?.length>0 && <section className="report-detail-panel"><span className="report-document-number">ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ</span><h2>Что изменить в следующем разговоре</h2><ol>{report.recommendations.map((text,i)=><li key={i}>{text}</li>)}</ol></section>}
    {turns.length>0 && <details ref={transcriptRef} id="report-transcript" className="report-detail-panel report-transcript-disclosure">
      <summary className="report-transcript-toggle"><h2>
        <span className="report-transcript-heading"><span className="report-document-number">ПОЛНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ</span><span>Разговор и основания оценки</span></span>
        <CaretDownIcon className="report-transcript-caret" size={24} weight="regular" aria-hidden="true" />
      </h2></summary>
      <div className="report-transcript-content">
        {report.analysis_coverage && <p>Записано ответов: {report.analysis_coverage.total}. Подробные выводы ИИ с проверенными цитатами: {report.analysis_coverage.reviewed}. Для остальных сохранены реплики и основания расчёта.</p>}
        {turns.map(row=><details className="report-turn" key={row.turn} id={idPrefix ? `${idPrefix}-${row.turn}` : undefined} open={openTurn === row.turn ? true : undefined}><summary>Ход {row.turn} · {(row.player||"").slice(0,85)}{row.player?.length>85?"…":""}</summary>{row.before&&<div className="report-turn-context"><b>Перед вашим ответом · {opponent}</b><p>{row.before}</p></div>}<figure className="report-document-evidence"><figcaption>Вы</figcaption><blockquote>{row.player}</blockquote></figure>{row.after&&<div className="report-turn-context"><b>Ответ · {opponent}</b><p>{row.after}</p></div>}{row.techniques?.length>0&&<p>Подтверждённые приёмы: {row.techniques.join(" · ")}</p>}{row.changes?.map((change,i)=><p className="report-turn-score" key={i}><b>{change.label}: {change.actual_delta>0?"+":""}{change.actual_delta??change.delta}</b> · {change.reason}</p>)}{row.note&&<p className="report-document-footnote">{row.note}</p>}</details>)}
      </div>
    </details>}
  </>;
}
