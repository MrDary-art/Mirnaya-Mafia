import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/csr/Briefcase";
import ModeGuideEntry from "../components/ModeGuideEntry.jsx";

export default function AiMode() {
  return <div className="ai-selection">
    <Link to="/" className="ai-selection-back">← Главная</Link>
    <header className="ai-selection-head">
      <div>
        <div className="eyebrow">ВЫ И ИИ · ДВА СПОСОБА ПРАКТИКОВАТЬСЯ</div>
        <h1>Выберите формат разговора</h1>
        <p>Подготовьте деловую ситуацию или проведите учебное собеседование. После разговора получите разбор решений.</p>
      </div>
      <div className="ai-selection-scene" aria-hidden="true"><span>01 / ЯДРО ДИАЛОГА</span></div>
    </header>
    <ModeGuideEntry to="/ai/demo" eyebrow="ОБЗОР ИИ-ДИАЛОГА · БЕЗ ЗАПУСКА" title="Первый разговор с ИИ?" description="Посмотрите оба формата — от подготовки ситуации до разбора после диалога." />
    <div className="ai-selection-options">
      <Link to="/setup?mode=online" className="ai-choice ai-choice-main">
        <span className="ai-choice-number">01 / СВОБОДНЫЙ ДИАЛОГ</span>
        <ChatCircleDotsIcon size={34} weight="duotone" aria-hidden="true" />
        <div><h2>Своя ситуация</h2><p>Опишите роли, собеседника и цель. ИИ ответит как другая сторона переговоров.</p></div>
        <span className="ai-choice-action">Настроить разговор <ArrowUpRightIcon size={20} aria-hidden="true" /></span>
      </Link>
      <Link to="/ai/job" className="ai-choice ai-choice-job">
        <span className="ai-choice-number">02 / СОБЕСЕДОВАНИЕ</span>
        <BriefcaseIcon size={32} weight="duotone" aria-hidden="true" />
        <div><h2>Практика трудоустройства</h2><p>Укажите компанию и позицию. Проведите интервью с ИИ-рекрутером.</p></div>
        <span className="ai-choice-action">Подготовиться <ArrowUpRightIcon size={20} aria-hidden="true" /></span>
      </Link>
    </div>
    <p className="ai-selection-note">Выбор формата не запускает сессию. Перед разговором можно проверить и изменить настройки.</p>
  </div>;
}
