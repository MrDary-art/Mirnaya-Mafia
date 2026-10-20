import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./forest-section-header.css";

const rememberedTabIndexes = new Map();
const TAB_TEXT_SWAP_DELAY = 135;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findActiveTabIndex(links, pathname) {
  return links.findIndex(({ to, end }) => end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));
}

function ForestSectionTabs({ links, navigationLabel, transitionKey }) {
  const { pathname } = useLocation();
  const activeIndex = findActiveTabIndex(links, pathname);
  const storedIndex = transitionKey ? rememberedTabIndexes.get(transitionKey) : undefined;
  const previousIndex = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < links.length ? storedIndex : activeIndex;
  const initialIndex = prefersReducedMotion() ? activeIndex : previousIndex;
  const [indicatorIndex, setIndicatorIndex] = useState(initialIndex);
  const [highlightedIndex, setHighlightedIndex] = useState(initialIndex);
  const animated = Boolean(transitionKey && activeIndex >= 0);

  useEffect(() => {
    if (!animated) return undefined;

    rememberedTabIndexes.set(transitionKey, activeIndex);
    if (prefersReducedMotion()) {
      setIndicatorIndex(activeIndex);
      setHighlightedIndex(activeIndex);
      return undefined;
    }
    if (indicatorIndex === activeIndex) return undefined;

    let textTimer;
    const frame = window.requestAnimationFrame(() => {
      setIndicatorIndex(activeIndex);
      textTimer = window.setTimeout(() => setHighlightedIndex(activeIndex), TAB_TEXT_SWAP_DELAY);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(textTimer);
    };
  }, [activeIndex, animated, transitionKey]);

  const indicatorStyle = animated ? {
    "--tab-width": `calc(${100 / links.length}% - ${(14 + ((links.length - 1) * 5)) / links.length}px)`,
    "--tab-translate-x": `calc(${indicatorIndex * 100}% + ${indicatorIndex * 5}px)`,
    "--tab-mobile-x": `calc(${(indicatorIndex % 2) * 100}% + ${(indicatorIndex % 2) * 3}px)`,
    "--tab-mobile-y": `calc(${Math.floor(indicatorIndex / 2) * 100}% + ${Math.floor(indicatorIndex / 2) * 3}px)`,
  } : undefined;

  return <nav className={`forest-section-tabs${animated ? " forest-section-tabs--animated" : ""}`} aria-label={navigationLabel} style={indicatorStyle}>
    {animated && <span className="forest-section-tab-indicator" aria-hidden="true" />}
    {links.map(({ to, label, end }, index) => <NavLink className={animated && index === highlightedIndex ? "is-highlighted" : undefined} key={to} to={to} end={end}>{label}</NavLink>)}
  </nav>;
}

export default function ForestSectionHeader({ title, titleId, line, description, image = "hero", links = [], navigationLabel, tabTransitionKey, children }) {
  return <>
    <header className="forest-section-header" style={{ "--section-image": `url("/assets/forest2d/${image}.webp")` }}>
      <div className="forest-section-copy"><h1 id={titleId}>{title}</h1><p className="forest-section-line">{line}</p><p className="forest-section-description">{description}</p></div>
      {children}
    </header>
    {links.length > 0 && <ForestSectionTabs links={links} navigationLabel={navigationLabel} transitionKey={tabTransitionKey} />}
  </>;
}
