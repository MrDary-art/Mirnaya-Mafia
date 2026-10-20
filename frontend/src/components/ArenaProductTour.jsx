import { useEffect, useMemo, useState } from "react";
import ProductTour from "./ProductTour.jsx";
import "./product-tour.css";

const TOUR_VERSION = "arena-product-tour-v1";

const desktopSteps = [
  {
    target: ".practice-home .forest-section-header",
    title: "Начните с первого разговора",
    text: "Выберите практику с ИИ, встречу 1 на 1 или готовый сценарий. После прохождения откройте разбор и попробуйте следующий подход.",
  },
  {
    target: '.nova-rail a[href="/training"]',
    title: "Подготовьте приёмы",
    text: "В обучении собраны теория и программа: изучайте инструменты переговоров и сразу закрепляйте их на практике.",
  },
  {
    target: '.nova-rail a[href="/lab"]',
    title: "Отработайте сложные моменты",
    text: "Игровая лаборатория помогает тренировать реакцию после напряжённых слов, границы и точность ответа.",
  },
  {
    target: '.nova-rail a[href="/feed"]',
    title: "Сохраняйте полезный контекст",
    text: "В сообществе находятся публикации, сообщения, друзья, подборки и уведомления.",
  },
  {
    target: '.nova-rail a[href="/analytics"]',
    title: "Смотрите, что меняется",
    text: "Аналитика собирает завершённые практики и подробные отчёты, чтобы было понятно, что попробовать в следующем разговоре.",
  },
];

const mobileSteps = [
  {
    target: ".practice-home .forest-section-header",
    title: "Начните с первого разговора",
    text: "Выберите практику с ИИ, встречу 1 на 1 или готовый сценарий. После прохождения откройте разбор своих решений.",
  },
  {
    target: '.nova-mobile-nav a[href="/training"]',
    title: "Все разделы всегда рядом",
    text: "Практика, обучение, лаборатория, сообщество и аналитика открываются из нижней панели.",
  },
  {
    target: '.nova-mobile-nav a[href="/analytics"]',
    title: "Возвращайтесь к разбору",
    text: "В аналитике сохраняются завершённые практики и подробные отчёты с идеями для следующего разговора.",
  },
];

export default function ArenaProductTour({ userIdentity, active }) {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width:767px)").matches);
  const steps = useMemo(() => compact ? mobileSteps : desktopSteps, [compact]);

  useEffect(() => {
    const media = window.matchMedia("(max-width:767px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!userIdentity) return null;
  return <ProductTour
    storageKey={`${TOUR_VERSION}:${userIdentity}`}
    steps={steps}
    active={active}
    ariaLabel="Знакомство с Ареной переговоров"
    className="arena-product-tour"
    activeAttribute="data-arena-tour-active"
  />;
}
