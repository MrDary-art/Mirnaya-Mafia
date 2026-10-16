import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import Icon from "../Icon.jsx";
import { charactersOf, portraitPosition, storyBackground } from "./serialModel.js";

const serialIconPaths = {
  "circle-alert": ["M12 8v5m0 3h.01", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"],
  clapperboard: ["m4 4 4 4m2-5 4 4m2-5 4 4", "m3 9 18-4-1-4L2 5l1 4Zm0 0h18v12H3Z"],
  "git-branch": ["M6 6v12m12-12v4a6 6 0 0 1-6 6H6", "M9 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 21a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  bookmark: ["M5 3h14v18l-7-4-7 4Z"],
  "bookmark-check": ["M5 3h14v18l-7-4-7 4Z", "m9 9 2 2 4-4"],
  "repeat-2": ["m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"],
  "rotate-ccw": ["M3 10a9 9 0 1 1 1 7M3 3v7h7"],
  "lock-keyhole": ["M6 11h12v10H6Zm3 0V7a3 3 0 0 1 6 0v4m-3 4v2"],
  plus: ["M12 5v14M5 12h14"],
  list: ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  "volume-x": ["M11 5 6 9H3v6h3l5 4Zm6 4 5 6m0-6-5 6"],
  "settings-2": ["M3 6h5m4 0h9M3 18h9m4 0h5M8 3v6m4 6v6"],
  "cloud-check": ["M7 17H6a5 5 0 0 1 0-10 7 7 0 0 1 13-1 5 5 0 0 1 1 10", "m9 17 3 3 6-6"],
  "loader-circle": ["M12 3a9 9 0 1 1-9 9"],
  "more-horizontal": ["M5 12h.01M12 12h.01M19 12h.01"],
};
export function SerialIcon({ name, size = 18 }) {
  if (serialIconPaths[name]) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="serials-svg-icon">{serialIconPaths[name].map((path, index) => <path d={path} key={index} />)}</svg>;
  return <Icon name={name === "clock" ? "clock-3" : name} size={size} />;
}

export function StarBalance({ stars }) {
  return <span className="serials-wallet" aria-label={`На вашем счету ${stars ?? 0} звёзд`}><SerialIcon name="star" size={17} /><b>{stars ?? 0}</b><span>звёзд</span></span>;
}

export function SerialPortrait({ index = 0, className = "", name }) {
  const position = portraitPosition(index);
  return <span className={`serials-portrait ${className}`} style={{ backgroundPosition: position, WebkitMaskPosition: position, maskPosition: position }} role={name ? "img" : undefined} aria-label={name} aria-hidden={name ? undefined : true} />;
}

export function SerialBackdrop({ background = "school", className = "", variant = "cover" }) {
  const tile = { school: 0, stage: 0, home: 1, bedroom: 1, friends: 2, cafe: 2, city: 2, courtyard: 2, chat: 1, work: 3, office: 3 }[background] ?? 0;
  const fullTile = `${tile % 2 * 724} ${Math.floor(tile / 2) * 543} 724 543`;
  const sceneFrame = {
    stage: "176 10 520 520",
    bedroom: "944 8 494 527",
    chat: "1010 38 418 470",
    courtyard: "142 551 568 520",
    city: "82 563 626 500",
    work: "746 572 658 492",
  }[background];
  const viewBox = variant === "scene" && sceneFrame ? sceneFrame : fullTile;
  return <svg className={className} width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="/assets/serials/backgrounds-atlas.webp" width="1448" height="1086" /></svg>;
}

export function SerialArtwork({ story, className = "", children }) {
  const characters = charactersOf(story);
  const leads = characters.slice(0, 2);
  return <div className={`serials-artwork serials-artwork--${story?.id} ${className}`} aria-hidden="true">
    <SerialBackdrop className="serials-art-background" background={storyBackground(story)} /><div className="serials-art-grain" />
    {leads.map((character, index) => <SerialPortrait key={character.id || index} index={character.portrait} className={`serials-art-character serials-art-character--${index}`} />)}
    {children}
  </div>;
}

export function SerialLoading({ text = "Открываем историю…" }) { return <div className="serials-loading" role="status"><span className="serials-spinner" /><p>{text}</p></div>; }

export function SerialError({ error, onRetry, children }) {
  return <div className="serials-error" role="alert"><SerialIcon name="circle-alert" size={23} /><div><strong>Не удалось продолжить</strong><p>{error || "Проверьте соединение и повторите попытку."}</p><div className="serials-inline-actions">{onRetry && <button className="serials-button serials-button--small" onClick={onRetry}>Повторить</button>}{children}</div></div></div>;
}

export function SerialModal({ title, children, onClose, className = "" }) {
  const titleId = useId();
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function keydown(event) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const focusable = [...(dialog.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]') || [])].filter((element) => {
        if (!element.getClientRects().length || element.closest("[hidden],[inert]")) return false;
        // Closed details can retain descendant layout boxes in Chromium. Only
        // their first summary belongs to the keyboard order until opened.
        for (let parent = element.parentElement; parent && parent !== dialog.current; parent = parent.parentElement) {
          if (parent.tagName === "DETAILS" && !parent.open) {
            const summary = [...parent.children].find(child => child.tagName === "SUMMARY");
            if (!summary?.contains(element)) return false;
          }
        }
        return true;
      });
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, []);
  return createPortal(<div className="serials-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`serials-modal ${className}`}><header><h2 id={titleId}>{title}</h2><button className="serials-icon-button" aria-label="Закрыть окно" onClick={onClose}><SerialIcon name="x" size={22} /></button></header>{children}</section></div>, document.body);
}

export function SerialBack({ to = "/serials", children = "Все истории" }) {
  return <Link to={to} className="serials-back"><SerialIcon name="arrow-left" size={16} />{children}</Link>;
}
