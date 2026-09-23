import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, Grid2X2, Monitor, Moon, Palette, RotateCcw, Sparkles, Sun, Waves, X } from "lucide-react";
import { readTheme, saveTheme, themeKey, type Theme } from "./preferences";
import { appearanceKey, appearanceStorageKey, defaultForScope, normalizeAppearance, readAppearance, readableInk, type AppearancePreferences, type AppearanceScope } from "./appearancePreferences";
import Background from "./Background";
import { useSectionReveal } from "./useSectionReveal";
import "./appearance.css";
import "./designs.css";

type AppearanceContextValue = {
  scope: AppearanceScope;
  setWorkspace: (active: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  appearance: AppearancePreferences;
  update: (patch: Partial<AppearancePreferences>) => void;
  reset: () => void;
  reducedMotion: boolean;
};
const AppearanceContext = createContext<AppearanceContextValue | null>(null);
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("AppearanceProvider is required");
  return value;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeValue] = useState<Theme>(readTheme);
  const [{ scope, appearance }, setPreferences] = useState(() => ({ scope: "public" as AppearanceScope, appearance: readAppearance() }));
  const setWorkspace = useCallback((active: boolean) => {
    const nextScope = active ? "workspace" : "public";
    setPreferences(previous => previous.scope === nextScope ? previous : { scope: nextScope, appearance: readAppearance(nextScope) });
  }, []);
  const content = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [storageError, setStorageError] = useState(false);
  useSectionReveal(content, reducedMotion || appearance.animation === "still");

  useLayoutEffect(() => {
    const systemTheme = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && systemTheme.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    systemTheme.addEventListener("change", apply);
    return () => systemTheme.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const systemMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(systemMotion.matches);
    systemMotion.addEventListener("change", updateMotion);
    const sync = (event: StorageEvent) => {
      if (event.key?.startsWith(appearanceKey) || event.key === null) setPreferences(previous => ({ ...previous, appearance: readAppearance(previous.scope) }));
      if (event.key === themeKey || event.key === null) setThemeValue(readTheme());
    };
    window.addEventListener("storage", sync);
    const visibility = () => { document.documentElement.dataset.visibility = document.hidden ? "hidden" : "visible"; };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { systemMotion.removeEventListener("change", updateMotion); window.removeEventListener("storage", sync); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.design = appearance.design;
    root.dataset.experience = scope;
    root.dataset.background = appearance.background;
    root.dataset.motion = reducedMotion ? "still" : appearance.animation;
    root.style.setProperty("--design-accent", appearance.accentColor);
    root.style.setProperty("--accent-ink", readableInk(appearance.accentColor));
    root.style.setProperty("--design-icons", appearance.iconColor);
    root.style.setProperty("--spiral-color", appearance.spiralColor);
    root.style.setProperty("--background-opacity", String(appearance.opacity));
    root.style.setProperty("--motion-duration", `${24 / appearance.speed}s`);
  }, [appearance, reducedMotion, scope]);

  useEffect(() => {
    const apply = () => document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--page-surface").trim());
    const system = matchMedia("(prefers-color-scheme: dark)");
    apply();
    system.addEventListener("change", apply);
    return () => system.removeEventListener("change", apply);
  }, [appearance.design, theme]);

  function persist(next: AppearancePreferences) {
    setPreferences({ scope, appearance: next });
    try { localStorage.setItem(appearanceStorageKey(scope), JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function setTheme(next: Theme) {
    setThemeValue(next);
    try { saveTheme(next); setStorageError(false); } catch { setStorageError(true); }
  }
  return <AppearanceContext.Provider value={{ scope, setWorkspace, theme, setTheme, appearance, update: patch => persist(normalizeAppearance({ ...appearance, ...patch }, scope)), reset: () => { persist(defaultForScope(scope)); setTheme("dark"); }, reducedMotion }}>
    <Background appearance={appearance} reducedMotion={reducedMotion} scope={scope}/>
    <div ref={content} className="app-content">{children}</div>
    <AppearancePanel storageError={storageError}/>
  </AppearanceContext.Provider>;
}

const backgrounds = [
  { value: "signature", label: "Объекты темы", description: "Графика референса", Icon: Sparkles },
  { value: "spiral", label: "Спираль", description: "Объёмный металл", Icon: Waves },
  { value: "aurora", label: "Сияние", description: "Мягкие градиенты", Icon: Sparkles },
  { value: "grid", label: "Сетка", description: "Точки и линии", Icon: Grid2X2 },
  { value: "plain", label: "Чистый", description: "Без графики", Icon: Sun },
] as const;
const palettes = [
  { name: "Оранжевый", accentColor: "#ff962e", iconColor: "#ffb15c", spiralColor: "#ff8a32" },
  { name: "Лайм", accentColor: "#bbff72", iconColor: "#6b9962", spiralColor: "#ffffff" },
  { name: "Лаванда", accentColor: "#c3b0ff", iconColor: "#9d83df", spiralColor: "#c9b5ff" },
  { name: "Океан", accentColor: "#81d7f5", iconColor: "#4a9bc4", spiralColor: "#92ccf1" },
  { name: "Терракота", accentColor: "#ffc28b", iconColor: "#be825e", spiralColor: "#e5b493" },
  { name: "Роза", accentColor: "#f6b3c8", iconColor: "#be789e", spiralColor: "#f2afcc" },
];

function AppearancePanel({ storageError }: { storageError: boolean }) {
  const { scope, theme, setTheme, appearance, update, reset, reducedMotion } = useAppearance();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = previous; trigger.current?.focus(); };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="appearance-tab" onClick={() => setOpen(true)} aria-label="Настроить оформление" aria-haspopup="dialog" aria-expanded={open} title="Оформление сайта"><Palette size={21}/><span>Оформление</span></button>
    <dialog ref={dialog} className="appearance-panel" aria-labelledby="appearance-title" onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}>
      <header className="appearance-header"><div><span className="kicker">ВАШЕ ПРОСТРАНСТВО</span><h2 id="appearance-title">Оформление</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Закрыть оформление"><X size={20}/></button></header>
      <div className="appearance-scroll">
        <div className="combined-theme-note"><strong>Solana × Solflare</strong><p>{scope === "workspace" ? "Жёлтые акценты и графика Solflare в вашем пространстве." : "Оранжевое свечение, объёмная Solana сверху и Solflare ниже по странице."}</p></div>
        <fieldset><legend>Тема интерфейса</legend><div className="appearance-segments">{([{value:"system",label:"Системная",Icon:Monitor},{value:"light",label:"Светлая",Icon:Sun},{value:"dark",label:"Тёмная",Icon:Moon}] as const).map(({value,label,Icon}) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon size={17}/>{label}</button>)}</div></fieldset>
        <fieldset><legend>Фон</legend><div className="background-options">{backgrounds.map(({ value, label, description, Icon }) => <button type="button" className={`background-option preview-${value}`} key={value} aria-pressed={appearance.background === value} onClick={() => update({background:value})}><span className="background-preview"><Icon size={28}/>{appearance.background === value && <Check className="background-check" size={14}/>}</span><strong>{label}</strong><small>{description}</small></button>)}</div></fieldset>
        <fieldset><legend>Цветовая палитра</legend><div className="palette-options">{palettes.map(palette => <button type="button" key={palette.name} title={palette.name} aria-label={`Палитра «${palette.name}»`} aria-pressed={appearance.accentColor === palette.accentColor && appearance.iconColor === palette.iconColor && appearance.spiralColor === palette.spiralColor} style={{background:palette.accentColor, color:readableInk(palette.accentColor)}} onClick={() => update({accentColor:palette.accentColor,iconColor:palette.iconColor,spiralColor:palette.spiralColor})}>{appearance.accentColor === palette.accentColor && <Check size={17}/>}</button>)}</div>
          {([{key:"accentColor",label:"Цвет дизайна"},{key:"iconColor",label:"Цвет иконок"},{key:"spiralColor",label:"Цвет объектов и фона"}] as const).map(({key,label}) => <label className="color-setting" key={key}><span>{label}</span><span className="color-value">{appearance[key].toUpperCase()}<input type="color" value={appearance[key]} onChange={event => update({[key]:event.target.value})} aria-label={label}/></span></label>)}
        </fieldset>
        <fieldset disabled={appearance.background === "plain"}><legend>Анимация</legend><div className="appearance-segments">{([{value:"rotate",label:"Вращение"},{value:"float",label:"Парение"},{value:"still",label:"Пауза"}] as const).map(({value,label}) => <button key={value} type="button" aria-pressed={appearance.animation === value} onClick={() => update({animation:value})}>{label}</button>)}</div>
          <label className="range-setting"><span>Скорость <output>{appearance.speed.toFixed(2)}×</output></span><input type="range" min="0.25" max="2" step="0.25" value={appearance.speed} disabled={reducedMotion || appearance.animation === "still"} onChange={event => update({speed:Number(event.target.value)})}/></label>
          <label className="range-setting"><span>Выразительность <output>{Math.round(appearance.opacity * 100)}%</output></span><input type="range" min="0.1" max="1" step="0.05" value={appearance.opacity} onChange={event => update({opacity:Number(event.target.value)})}/></label>
          {reducedMotion && <p className="appearance-note">Анимация приостановлена: на устройстве включено уменьшение движения.</p>}
        </fieldset>
      </div>
      <footer className="appearance-footer"><p role="status">{storageError ? "Изменения применены. Браузер не разрешил сохранить их." : "Изменения сохраняются на этом устройстве."}</p><button type="button" className="text-link" onClick={reset}><RotateCcw size={15}/> Сбросить оформление</button></footer>
    </dialog>
  </>;
}
