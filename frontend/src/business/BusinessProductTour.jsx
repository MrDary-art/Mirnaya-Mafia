import { useMemo } from "react";
import ProductTour from "../components/ProductTour.jsx";

const TOUR_VERSION = "business-product-tour-v1";

function storageKey(companyId, userId) {
  return `${TOUR_VERSION}:${userId || "member"}:${companyId}`;
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

export default function BusinessProductTour({ companyId, userId, section, compact, isManager, replayToken = 0 }) {
  const key = useMemo(() => storageKey(companyId, userId), [companyId, userId]);
  const steps = useMemo(() => compact ? mobileSteps(isManager) : desktopSteps(isManager), [compact, isManager]);
  return <ProductTour
    storageKey={key}
    steps={steps}
    active={section === "overview"}
    ariaLabel="Знакомство с Ареной бизнеса"
    className="business-product-tour"
    activeAttribute="data-business-tour-active"
    replayToken={replayToken}
  />;
}
