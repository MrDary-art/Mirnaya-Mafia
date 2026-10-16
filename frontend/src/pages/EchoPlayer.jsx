import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { Link, useParams } from "react-router-dom";
import { LabError, LabLoading, Metrics } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import "../components/game-lab/game-lab.css";
import "../components/game-lab/echo.css";

const PHASES = [
  ["aftermath", "Последствие"],
  ["archive", "Архив"],
  ["trace", "Траектория"],
  ["intervention", "Точка решения"],
  ["reveal", "Две недели"],
  ["finished", "Результат"],
];

function PhaseLine({ phase }) {
  const active = Math.max(0, PHASES.findIndex(([id]) => id === phase));
  return <ol className="echo-phase-line" aria-label="Этап исследования">
    {PHASES.slice(0, phase === "finished" ? 6 : 5).map(([id, label], index) => <li key={id} className={index <= active ? "is-active" : ""}>
      <i aria-hidden="true" /><span>{label}</span>
    </li>)}
  </ol>;
}

function Future({ future, className = "", label }) {
  return <article className={`echo-future ${className}`}>
    <span>{label || future.date}</span>
    <h2>{future.title}</h2>
    <p>{future.summary}</p>
    <dl>{future.markers.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
  </article>;
}

function EvidenceBoard({ echo, onAction, busy, selectedId, onSelect }) {
  const opened = echo.evidence.filter((item) => item.opened);
  const selected = echo.evidence.find((item) => item.id === selectedId) || opened.at(-1) || echo.evidence[0];
  return <section className="echo-workspace echo-archive" aria-labelledby="echo-archive-title">
    <div className="echo-workspace-heading">
      <div><h2 id="echo-archive-title">Архив события</h2><p>Четыре фрагмента одной недели.</p></div>
      <span>{opened.length} / {echo.evidence.length}</span>
    </div>
    <div className="echo-evidence-board">
      {echo.evidence.map((item, index) => <button key={item.id} type="button" className={`echo-evidence ${item.opened ? "is-opened" : ""}${selected?.id === item.id ? " is-selected" : ""}`} disabled={busy || item.opened} onClick={() => { onSelect(item.id); onAction("archive", item.id); }} aria-pressed={selected?.id === item.id}>
        <span>{String(index + 1).padStart(2, "0")}</span><strong>{item.kind}</strong><b>{item.title}</b><small>{item.time}</small>
      </button>)}
    </div>
    <article className={`echo-document ${selected?.opened ? "is-opened" : ""}`} aria-live="polite">
      {selected?.opened ? <><span>{selected.kind}</span><p>«{selected.excerpt}»</p><small>{selected.detail}</small></> : <><span>Выберите фрагмент</span><p>Архив откроет причины только после того, как станет видна вся неделя.</p></>}
    </article>
    {echo.all_evidence_seen && <div className="echo-primary-wrap"><button type="button" className="echo-primary" disabled={busy} onClick={() => onAction("archive", "trace-causes")}>Собрать траекторию<ArrowRightIcon size={18} aria-hidden="true" /></button></div>}
  </section>;
}

function TraceBoard({ echo, onAction, busy, selectedId, onSelect }) {
  const selected = echo.causes.find((item) => item.id === selectedId) || echo.causes.find((item) => item.traced);
  return <section className="echo-workspace echo-trace" aria-labelledby="echo-trace-title">
    <div className="echo-workspace-heading"><div><h2 id="echo-trace-title">Траектория</h2><p>Свяжите факты с тем, что случилось позже.</p></div><span>{echo.causes.filter((item) => item.traced).length} / {echo.causes.length}</span></div>
    <div className="echo-causal-map">
      <div className="echo-map-origin"><span>Тогда</span><strong>Решение перед премьерой</strong></div>
      <svg className="echo-map-lines" viewBox="0 0 900 300" preserveAspectRatio="none" aria-hidden="true"><path d="M80 150 C245 150, 290 55, 450 55 S650 55, 820 150" /><path d="M80 150 C245 150, 290 150, 450 150 S650 150, 820 150" /><path d="M80 150 C245 150, 290 245, 450 245 S650 245, 820 150" /></svg>
      <div className="echo-map-causes">{echo.causes.map((item, index) => <button key={item.id} type="button" disabled={busy || !item.available || item.traced} onClick={() => { onSelect(item.id); onAction("trace", item.id); }} className={`echo-cause echo-cause-${index + 1}${item.traced ? " is-traced" : ""}${selected?.id === item.id ? " is-selected" : ""}`} aria-pressed={selected?.id === item.id}>
        <i aria-hidden="true">{item.traced ? <CheckIcon size={13} weight="bold" /> : index + 1}</i><span>{item.title}</span>
      </button>)}</div>
      <div className="echo-map-effect"><span>Через неделю</span><strong>Лера уходит из группы</strong></div>
    </div>
    <article className="echo-trace-reading" aria-live="polite">{selected?.traced ? <><span>Связь подтверждена</span><p>{selected.summary}</p></> : <><span>Выберите связь</span><p>На карте нет готового объяснения: его нужно подтвердить фрагментами архива.</p></>}</article>
  </section>;
}

function Intervention({ echo, onAction, busy }) {
  return <section className="echo-workspace echo-intervention" aria-labelledby="echo-intervention-title">
    <div className="echo-workspace-heading"><div><h2 id="echo-intervention-title">Одна точка до последствий</h2><p>Измените не формулировку, а условия, в которых появился выбор.</p></div></div>
    <div className="echo-intervention-list">{echo.interventions.map((item, index) => <button key={item.id} type="button" className="echo-intervention-action" disabled={busy || !item.available} onClick={() => onAction("intervention", item.id)}>
      <span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><p>{item.description}</p><ArrowRightIcon size={18} aria-hidden="true" />
    </button>)}</div>
  </section>;
}

function Comparison({ echo, onAction, busy }) {
  const source = { ...echo.aftermath, date: "Исходная неделя" };
  const changed = { ...echo.rewritten_future, date: "После вмешательства" };
  return <section className="echo-workspace echo-reveal" aria-labelledby="echo-reveal-title">
    <div className="echo-workspace-heading"><div><h2 id="echo-reveal-title">Две траектории</h2><p>Одно решение меняет не оценку разговора, а то, что становится возможным через неделю.</p></div></div>
    <div className="echo-future-compare"><Future future={source} className="is-original" label="Исходная неделя" /><span className="echo-future-shift" aria-hidden="true"><ArrowRightIcon size={22} weight="bold" /></span><Future future={changed} className="is-rewritten" label="После вмешательства" /></div>
    <div className="echo-primary-wrap"><button type="button" className="echo-primary" disabled={busy} onClick={() => onAction("reveal", "finish")}>Зафиксировать результат<ArrowRightIcon size={18} aria-hidden="true" /></button></div>
  </section>;
}

function EchoResult({ data, onRestart, busy }) {
  const future = data.echo.rewritten_future;
  return <main className="echo-result" aria-label="Результат траектории">
    <div><span>Результат</span><h1>{data.report.outcome.title}</h1><p>{data.report.outcome.description}</p></div>
    <Future future={{ ...future, date: "Изменённая неделя" }} className="is-rewritten" />
    <Metrics metrics={data.report.metrics} />
    <div className="echo-result-actions"><button type="button" className="echo-primary" disabled={busy} onClick={onRestart}>{busy ? "Собираем…" : "Исследовать заново"}<ArrowRightIcon size={18} aria-hidden="true" /></button><Link to="/lab/echo">К кейсу</Link></div>
  </main>;
}

export default function EchoPlayer() {
  const { runId } = useParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState("");
  const [selectedCause, setSelectedCause] = useState("");
  const mainRef = useRef(null);

  const load = useCallback(() => {
    setError("");
    labApi.run(runId).then(setData).catch((reason) => setError(reason.message));
  }, [runId]);
  useEffect(load, [load]);
  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); }, [data?.run?.revision, data?.echo?.phase]);

  const phase = data?.echo?.phase;
  const action = useCallback(async (nodeId, choiceId) => {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      setData(await labApi.act(data.run.id, { revision: data.run.revision, node_id: nodeId, choice_id: choiceId }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }, [busy, data]);

  const restart = useCallback(async () => {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      setSelectedEvidence("");
      setSelectedCause("");
      setData(await labApi.restart(data.run.id, data.run.revision));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }, [busy, data]);

  if (!data && !error) return <div className="echo-player-shell"><LabLoading text="Восстанавливаем траекторию…" /></div>;
  if (!data) return <div className="echo-player-shell"><LabError error={error} onRetry={load} /></div>;

  return <div className="echo-player-shell">
    <header className="echo-player-header">
      <div><span>Эхо</span><strong>{data.case.title}</strong></div>
      <PhaseLine phase={phase} />
      <Link to="/lab/echo" className="lab-player-close" aria-label="Закрыть исследование"><XIcon size={21} aria-hidden="true" /></Link>
    </header>
    {error && <div className="lab-player-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Обновить</button></div>}
    <main ref={mainRef} tabIndex="-1" className="echo-player-main">
      {phase === "aftermath" && <section className="echo-cold-open"><Future future={data.echo.aftermath} /><button type="button" className="echo-primary" disabled={busy} onClick={() => action("aftermath", "open-archive")}>Открыть архив<ArrowRightIcon size={18} aria-hidden="true" /></button></section>}
      {phase === "archive" && <EvidenceBoard echo={data.echo} onAction={action} busy={busy} selectedId={selectedEvidence} onSelect={setSelectedEvidence} />}
      {phase === "trace" && <TraceBoard echo={data.echo} onAction={action} busy={busy} selectedId={selectedCause} onSelect={setSelectedCause} />}
      {phase === "intervention" && <Intervention echo={data.echo} onAction={action} busy={busy} />}
      {phase === "reveal" && <Comparison echo={data.echo} onAction={action} busy={busy} />}
      {phase === "finished" && <EchoResult data={data} onRestart={restart} busy={busy} />}
    </main>
  </div>;
}
