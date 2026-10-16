import { SerialIcon } from "./SerialShared.jsx";
import { METRIC_LABELS, withoutAgeLabel } from "./serialModel.js";
import "./serial-learning.css";

export function EpisodeBrief({ episode, learning, onStart }) {
  if (!learning) return null;
  return <section className="serials-episode-brief" aria-labelledby="serial-brief-title">
    <p className="serials-brief-episode">Ваша задача</p>
    <h2 id="serial-brief-title">{episode?.title}</h2>
    <p className="serials-brief-objective">{learning.objective}</p>
    <dl className="serials-brief-core">
      <div><dt>Роль</dt><dd>{withoutAgeLabel(learning.role)}</dd></div>
      <div><dt>Цель разговора</dt><dd>{learning.brief?.goal}</dd></div>
    </dl>
    <button className="serials-button" onClick={onStart}>Начать <SerialIcon name="arrow-right" size={18} /></button>
  </section>;
}

export function DecisionMetrics({ effects, metrics }) {
  const entries = Object.entries(METRIC_LABELS);
  if (!entries.every(([key]) => Number.isFinite(metrics?.[key]))) return null;
  return <aside className="serials-decision-metrics" aria-label="Показатели переговоров" aria-live="polite" aria-atomic="true">
    <dl>{entries.map(([key, label]) => {
      const delta = Number.isFinite(effects?.[key]) ? effects[key] : null;
      return <div key={key}>
        <dt>{label}</dt>
        <dd><strong>{metrics[key]}</strong>{delta !== null && <span data-change={delta > 0 ? "increase" : delta < 0 ? "decrease" : "none"}>{delta > 0 ? "+" : ""}{delta}</span>}</dd>
        <meter value={metrics[key]} min="0" max="100" aria-label={`${label}: ${metrics[key]} из 100`} />
      </div>;
    })}</dl>
  </aside>;
}

export function EpisodeResult({ metrics }) {
  return <section className="serial-result" aria-labelledby="serial-result-metrics">
    <h3 id="serial-result-metrics">Итоговые показатели</h3>
    <div className="serials-metrics">{Object.entries(METRIC_LABELS).map(([key, label]) => <div key={key}><span>{label}</span><strong>{metrics?.[key] ?? 50}<small>/100</small></strong><meter value={metrics?.[key] ?? 50} min="0" max="100" aria-label={label} /></div>)}</div>
  </section>;
}
