import { useEffect, useMemo, useState } from "react";

const TOUR_VERSION = "business-product-tour-v1";

function storageKey(companyId, userId) {
  return `${TOUR_VERSION}:${userId || "member"}:${companyId}`;
}

function hasSeen(key) {
  try { return window.localStorage.getItem(key) === "done"; }
  catch { return false; }
}

function markSeen(key) {
  try { window.localStorage.setItem(key, "done"); }
  catch { /* Local storage is optional; the tour stays usable in private browsing. */ }
}

function desktopSteps(isManager) {
  return [
    {
      target: '[data-business-tour="overview"]',
      title: "Начните с главного шага",
      text: isManager
        ? "Создайте рабочую ситуацию: она проведёт команду от подготовки разговора к общему решению."
        : "Здесь всегда собран ваш ближайший шаг: ситуация, практика или обязательство.",
    },
    {
      target: '[data-business-tour="nav-episodes"]',
      title: "Ведите рабочую ситуацию",
      text: "Откройте важный случай, пригласите участников и зафиксируйте результат после разговора.",
    },
    {
      target: '[data-business-tour="nav-learning"]',
      title: "Подготовьтесь заранее",
      text: "В практике находятся назначенные упражнения и безопасная репетиция сложных разговоров.",
    },
    {
      target: '[data-business-tour="nav-meetings"]',
      title: "Превратите встречу в действие",
      text: "Во встречах команда подтверждает решения, ответственных и следующие шаги.",
    },
    {
      target: '[data-business-tour="messages"]',
      title: "Оставайтесь на связи",
      text: "Сообщения и уведомления открываются в сообществе — так важный контекст не теряется в всплывающих окнах.",
    },
  ];
}

function mobileSteps(isManager) {
  return [
    {
      target: '[data-business-tour="overview"]',
      title: "Начните с главного шага",
      text: isManager
        ? "Создайте рабочую ситуацию — она свяжет подготовку, разговор и итог команды."
        : "Здесь собран ваш ближайший шаг: ситуация, практика или обязательство.",
    },
    {
      target: '[data-business-tour="menu"]',
      title: "Все режимы рядом",
      text: "Откройте меню, чтобы перейти к рабочим ситуациям, практике, встречам и команде.",
    },
    {
      target: '[data-business-tour="messages"]',
      title: "Общение остаётся в компании",
      text: "Через сообщения и уведомления вы попадёте в сообщество, а не в отдельное окно.",
    },
  ];
}

function tourPosition(target) {
  const rect = target.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 32);
  const x = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
  const below = rect.bottom + 14;
  const y = below + 196 <= window.innerHeight ? below : Math.max(16, rect.top - 210);
  return { x, y, width, target: { x: rect.left - 5, y: rect.top - 5, width: rect.width + 10, height: rect.height + 10 } };
}

export default function BusinessProductTour({ companyId, userId, section, compact, isManager, replayToken = 0 }) {
  const key = useMemo(() => storageKey(companyId, userId), [companyId, userId]);
  const steps = useMemo(() => compact ? mobileSteps(isManager) : desktopSteps(isManager), [compact, isManager]);
  const [visible, setVisible] = useState(() => section === "overview" && !hasSeen(storageKey(companyId, userId)));
  const [stepIndex, setStepIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const step = steps[stepIndex];
  const shouldStart = section === "overview" && !hasSeen(key);
  const isVisible = visible || shouldStart;

  useEffect(() => {
    if (section === "overview" && !hasSeen(key)) {
      setStepIndex(0);
      setVisible(true);
    }
  }, [key, section]);

  useEffect(() => {
    if (!replayToken || section !== "overview") return;
    setStepIndex(0);
    setVisible(true);
  }, [replayToken, section]);

  useEffect(() => {
    if (!isVisible || !step) return undefined;
    let frame = 0;
    let activeTarget = null;
    const update = () => {
      const target = document.querySelector(step.target);
      if (!target) {
        setPosition(null);
        return;
      }
      activeTarget?.removeAttribute("data-business-tour-active");
      activeTarget = target;
      activeTarget.setAttribute("data-business-tour-active", "true");
      setPosition(tourPosition(target));
    };
    const onViewportChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      activeTarget?.removeAttribute("data-business-tour-active");
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [step, isVisible]);

  if (!isVisible || section !== "overview" || !step) return null;

  function close() {
    markSeen(key);
    setVisible(false);
  }
  function advance() {
    if (stepIndex === steps.length - 1) close();
    else setStepIndex(index => index + 1);
  }

  return <aside className="business-product-tour" aria-label="Знакомство с Ареной бизнеса" aria-live="polite">
    {position && <span className="business-product-tour-spotlight" style={{ left: position.target.x, top: position.target.y, width: position.target.width, height: position.target.height }} aria-hidden="true" />}
    <div className="business-product-tour-card" style={position ? { "--tour-x": `${position.x}px`, "--tour-y": `${position.y}px`, "--tour-width": `${position.width}px` } : undefined}>
      <p className="business-product-tour-progress">{stepIndex + 1} из {steps.length}</p>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div>
        <button type="button" className="business-product-tour-skip" onClick={close}>Пропустить</button>
        <button type="button" className="primary-button" onClick={advance}>{stepIndex === steps.length - 1 ? "Понятно" : "Дальше"}</button>
      </div>
    </div>
  </aside>;
}
