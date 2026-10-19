import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import "./analytics-info.css";

const InfoContext = createContext(null);

export function AnalyticsInfoProvider({ children }) {
  const [active, setActive] = useState(null);
  const [position, setPosition] = useState(null);
  const popup = useRef(null), pinned = useRef(false), timer = useRef(null);
  const cancelClose = () => window.clearTimeout(timer.current);
  function close() { cancelClose(); pinned.current = false; setActive(null); }
  function show(info) {
    cancelClose();
    if (active?.id === info.id) return;
    pinned.current = false;
    setPosition(null);
    setActive(info);
  }
  function toggle(info) {
    cancelClose();
    if (active?.id === info.id && pinned.current) { close(); return; }
    pinned.current = true;
    if (active?.id !== info.id) setPosition(null);
    setActive(info);
  }
  function hide(id, immediate = false) {
    cancelClose();
    if (active?.id !== id) return;
    if (immediate) { close(); return; }
    timer.current = window.setTimeout(() => {
      if (!pinned.current && document.activeElement !== active.trigger) setActive(null);
    }, 140);
  }
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!active || !popup.current) return;
    function place() {
      const anchor = active.trigger.getBoundingClientRect(), box = popup.current.getBoundingClientRect();
      if (!active.trigger.isConnected || anchor.bottom < 0 || anchor.top > innerHeight) { setActive(null); return; }
      const left = Math.max(16, Math.min(anchor.left + anchor.width / 2 - box.width / 2, innerWidth - box.width - 16));
      const below = anchor.bottom + 10;
      const top = below + box.height <= innerHeight - 16 ? below : Math.max(16, anchor.top - box.height - 10);
      setPosition({ left, top });
    }
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const outside = event => { if (!active.trigger.contains(event.target) && !popup.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [active]);

  return <InfoContext.Provider value={{ activeId: active?.id, show, toggle, hide }}>
    {children}
    {active && createPortal(<aside ref={popup} id={active.id} className="analytics-info-popover" role="tooltip" style={{ ...position, visibility: position ? "visible" : "hidden" }} onMouseEnter={cancelClose} onMouseLeave={() => hide(active.id)}>
      <strong>{active.label}</strong><p>{active.description}</p>
    </aside>, document.body)}
  </InfoContext.Provider>;
}

export default function AnalyticsLabel({ label, help }) {
  const { activeId, show, toggle, hide } = useContext(InfoContext);
  const id = useId(), button = useRef(null);
  const info = () => ({ id, label, description: help, trigger: button.current });
  return <span className="analytics-info-label"><span>{label}</span>{help && <button ref={button} type="button" className="analytics-info-button" aria-label={`Как формируется показатель «${label}»`} aria-expanded={activeId === id} aria-describedby={activeId === id ? id : undefined}
    onMouseEnter={() => show(info())} onMouseLeave={() => hide(id)} onFocus={() => show(info())} onBlur={() => hide(id, true)} onClick={event => { event.stopPropagation(); toggle(info()); }}>
    <InfoIcon size={18} weight="regular" aria-hidden="true" />
  </button>}</span>;
}
