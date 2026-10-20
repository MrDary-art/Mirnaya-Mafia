import {Link} from "react-router-dom";

export default function DevelopmentSummary({data}) {
  if (!data) return null;
  return <details className="analytics-development"><summary>Подробная сводка развития: начало, изменения и следующий шаг</summary>
    <p>{data.summary}</p>
    {data.periods.map(period => <section key={period.title}><h4>{period.title}</h4><p>{period.from.slice(0,10)} — {period.to.slice(0,10)}</p><p>{period.source_ids.map(id => <Link key={id} to={`/report/${id}`} state={{returnTo:"/analytics"}}>Отчёт №{id} </Link>)}</p></section>)}
    {data.dimensions.map(item => <section key={item.id}><h4>{item.title}</h4><p>{item.text}</p></section>)}
    <h4>Примеры из ваших разборов</h4><p>{data.evidence_note}</p>
    {data.examples.map((item,index) => <section key={index}><h4>{item.period}: {item.title}</h4><blockquote>«{item.quote}»</blockquote><p>{item.analysis}</p>{item.principle && <p><b>{item.principle}.</b> {item.explanation}</p>}<Link to={`/report/${item.source_id}`} state={{returnTo:"/analytics"}}>Открыть источник №{item.source_id}</Link></section>)}
    <h4>План следующих тренировок</h4>{data.priorities.map(item => <section key={item.title}><h4>{item.title}</h4><p>{item.reason}</p><p>{item.exercise}</p><p>{item.check}</p></section>)}
    <p>{data.limitations}</p>
  </details>;
}
