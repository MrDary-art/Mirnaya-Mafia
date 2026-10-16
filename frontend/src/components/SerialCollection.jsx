import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { METRIC_LABELS } from "./serials/serialModel.js";
import "./serial-collection.css";

function resultDate(value) {
  if (!value) return "Завершено";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Завершено" : new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export default function SerialCollection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try { setData(await api("/api/serials")); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    api("/api/serials").then((value) => { if (active) setData(value); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const results = (data?.stories || []).flatMap((story) => (story.slots || [])
    .filter((run) => run.ending || run.main_ending)
    .map((run) => ({ story, run, ending: run.ending || run.main_ending })))
    .sort((left, right) => String(right.run.updated_at || "").localeCompare(String(left.run.updated_at || "")));
  return <section className="serial-collection" aria-labelledby="serial-collection-title">
    <div className="serial-collection-heading"><h2 id="serial-collection-title">Результаты историй</h2></div>
    {loading && <p role="status">Собираем ваши результаты…</p>}
    {error && <div role="alert"><p>Не удалось загрузить результаты: {error}</p><button type="button" onClick={load}>Попробовать ещё раз</button></div>}
    {data && !loading && !error && <>
      {results.length ? <div className="serial-collection-results">{results.slice(0, 3).map(({ story, run, ending }) =>
        <Link key={`${story.id}:${run.slot}`} to={`/serials/${story.id}`} className="serial-collection-result">
          <div className="serial-collection-result-meta"><span>{story.title}</span><time dateTime={run.updated_at}>{resultDate(run.updated_at)}</time></div>
          <h3>{ending.title}</h3><p>{ending.reflection || ending.text}</p>
          <dl className="serial-collection-result-metrics">{Object.entries(METRIC_LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{run.metrics?.[key] ?? 50}</dd></div>)}</dl>
        </Link>)}</div> : <div className="serial-collection-empty"><p>Здесь появятся показатели и результат первого завершённого кейса.</p>
          <Link to="/serials">Выбрать историю <span aria-hidden="true">→</span></Link></div>}
    </>}
  </section>;
}
