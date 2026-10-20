import { useEffect, useState } from "react";
import { clearTourPending, isTourPending } from "./productTourState.js";

function hasSeen(key) {
  try { return window.localStorage.getItem(key) === "done"; }
  catch { return false; }
}

function markSeen(key) {
  try { window.localStorage.setItem(key, "done"); }
  catch { /* Local storage is optional; the tour stays usable in private browsing. */ }
}

function tourPosition(target) {
  const rect = target.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 32);
  const x = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
  const below = rect.bottom + 14;
  const y = below + 196 <= window.innerHeight ? below : Math.max(16, rect.top - 210);
  return { x, y, width, target: { x: rect.left - 5, y: rect.top - 5, width: rect.width + 10, height: rect.height + 10 } };
}

export default function ProductTour({
  storageKey,
  steps,
  active,
  ariaLabel,
  className,
  activeAttribute,
  replayToken = 0,
  triggerKey,
}) {
  const [visible, setVisible] = useState(() => active && !hasSeen(storageKey) && (!triggerKey || isTourPending(triggerKey)));
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const step = steps[stepIndex];

  useEffect(() => {
    setStepIndex(0);
    const seen = hasSeen(storageKey);
    if (seen && triggerKey) clearTourPending(triggerKey);
    setVisible(active && !seen && (!triggerKey || isTourPending(triggerKey)));
  }, [storageKey, triggerKey, active]);

  useEffect(() => {
    if (!replayToken || !active) return;
    setStepIndex(0);
    setVisible(true);
  }, [replayToken, active]);

  useEffect(() => {
    if (!visible || !active || !step) return undefined;
    let frame = 0;
    let activeTarget = null;
    const update = () => {
      const target = document.querySelector(step.target);
      if (!target) {
        setPosition(null);
        return;
      }
      activeTarget?.removeAttribute(activeAttribute);
      activeTarget = target;
      activeTarget.setAttribute(activeAttribute, "true");
      setPosition(tourPosition(target));
    };
    const onViewportChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    const contentObserver = new MutationObserver(onViewportChange);
    contentObserver.observe(document.body, { childList: true, subtree: true });
    update();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      contentObserver.disconnect();
      activeTarget?.removeAttribute(activeAttribute);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [step, visible, active, activeAttribute]);

  if (!visible || !active || !step) return null;

  function close() {
    markSeen(storageKey);
    if (triggerKey) clearTourPending(triggerKey);
    setVisible(false);
  }

  function advance() {
    if (stepIndex === steps.length - 1) close();
    else setStepIndex(index => index + 1);
  }

  return <aside className={className} aria-label={ariaLabel} aria-live="polite">
    {position && <span className={`${className}-spotlight`} style={{ left: position.target.x, top: position.target.y, width: position.target.width, height: position.target.height }} aria-hidden="true" />}
    <div className={`${className}-card`} style={position ? { "--tour-x": `${position.x}px`, "--tour-y": `${position.y}px`, "--tour-width": `${position.width}px` } : undefined}>
      <p className={`${className}-progress`}>{stepIndex + 1} из {steps.length}</p>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div>
        <button type="button" className={`${className}-skip`} onClick={close}>Пропустить</button>
        <button type="button" className="primary-button" onClick={advance}>{stepIndex === steps.length - 1 ? "Понятно" : "Дальше"}</button>
      </div>
    </div>
  </aside>;
}
