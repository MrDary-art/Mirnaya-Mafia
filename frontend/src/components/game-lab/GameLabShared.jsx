import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { Link } from "react-router-dom";
import { backgroundPosition, characterImage, METRIC_LABELS, STAGE_LABELS } from "./gameLabModel.js";

export function LabLoading({ text = "Открываем лабораторию…" }) {
  return <div className="lab-loading" role="status"><span className="lab-spinner" /><p>{text}</p></div>;
}

export function LabError({ error, onRetry }) {
  return <div className="lab-error" role="alert"><WarningCircleIcon size={24} aria-hidden="true" /><div><strong>Не удалось открыть тренажёр</strong><p>{error || "Повторите попытку."}</p>{onRetry && <button type="button" onClick={onRetry}>Повторить</button>}</div></div>;
}

export function LabBackdrop({ background, className = "" }) {
  return <div className={`lab-backdrop ${className}`} aria-hidden="true" style={{ backgroundPosition: backgroundPosition(background) }} />;
}

export function Character({ character, emotion = "neutral", className = "" }) {
  const source = characterImage(character, emotion);
  const currentRef = useRef(source);
  const cleanupRef = useRef(null);
  const [currentSource, setCurrentSource] = useState(source);
  const [previousSource, setPreviousSource] = useState("");

  useEffect(() => {
    if (!source || source === currentRef.current) return undefined;
    let cancelled = false;
    let committed = false;
    const nextImage = new Image();
    const swap = () => {
      if (cancelled || committed) return;
      committed = true;
      if (cleanupRef.current) window.clearTimeout(cleanupRef.current);
      setPreviousSource(currentRef.current);
      currentRef.current = source;
      setCurrentSource(source);
      cleanupRef.current = window.setTimeout(() => {
        setPreviousSource("");
        cleanupRef.current = null;
      }, 400);
    };
    nextImage.decoding = "async";
    nextImage.onload = swap;
    nextImage.onerror = swap;
    nextImage.src = source;
    if (nextImage.complete) swap();
    return () => { cancelled = true; };
  }, [source]);

  useEffect(() => () => {
    if (cleanupRef.current) window.clearTimeout(cleanupRef.current);
  }, []);

  return <div className={`lab-character lab-character--emotion emotion-${emotion} ${className}`} data-emotion={emotion} aria-hidden="true">
    {previousSource && <img key={`previous-${previousSource}`} className="lab-character-layer is-previous" src={previousSource} alt="" draggable="false" width="1086" height="1448" />}
    <img key={currentSource} className={`lab-character-layer is-current${previousSource ? " is-entering" : ""}`} src={currentSource} alt="" draggable="false" width="1086" height="1448" />
  </div>;
}

export function Metrics({ metrics, compact = false }) {
  return <section className={`lab-metrics${compact ? " lab-metrics--compact" : ""}`} aria-label="Показатели разговора" aria-live="polite" aria-atomic="true">
    {Object.entries(METRIC_LABELS).map(([key, label]) => <div className="lab-metric" key={key}>
      <div><span>{label}</span><strong>{metrics?.[key] ?? 50}</strong></div>
      <meter min="0" max="100" value={metrics?.[key] ?? 50} aria-label={label} />
    </div>)}
  </section>;
}

export function StageBadge({ stage = "tense" }) {
  return <span className={`lab-stage-badge is-${stage}`}><i aria-hidden="true" />{STAGE_LABELS[stage] || STAGE_LABELS.tense}</span>;
}

export function ProgressLine({ current = 0, total = 1 }) {
  const safe = Math.max(0, Math.min(total, current));
  return <div className="lab-turn-progress" aria-label={`Пройдено ходов: ${safe} из ${total}`} role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={safe}>
    <span style={{ width: `${(safe / Math.max(1, total)) * 100}%` }} />
  </div>;
}

export function ResultActions({ onRestart, busy }) {
  return <div className="lab-result-actions">
    <button className="lab-primary-button" type="button" onClick={onRestart} disabled={busy}>{busy ? "Начинаем…" : "Пройти ещё раз"}<ArrowRightIcon size={18} aria-hidden="true" /></button>
    <Link className="lab-secondary-button" to="/lab/red-zone">К другим кейсам</Link>
  </div>;
}
