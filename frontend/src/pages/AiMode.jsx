import { Link } from "react-router-dom";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { BriefcaseIcon } from "@phosphor-icons/react/dist/csr/Briefcase";
import ModeGuideEntry from "../components/ModeGuideEntry.jsx";

export default function AiMode() {
  return <div className="practice-page">
    <header className="practice-intro"><div className="eyebrow">ПРАКТИКА С ИИ</div><h1>Подготовьтесь к важному разговору</h1><p>Одна задача, собеседник в роли и разбор конкретных решений. Пишите или отправляйте голосовые сообщения — формат можно менять в разговоре.</p></header>
    <ModeGuideEntry to="/ai/demo" eyebrow="ОБЗОР ИИ-ДИАЛОГА · БЕЗ ЗАПУСКА" title="Первый разговор с ИИ?" description="Посмотрите оба формата — от подготовки ситуации до разбора после диалога." />
    <div className="practice-options">
      <article className="practice-choice"><ChatCircleDotsIcon size={32} /><h2>Деловые переговоры</h2><p>Согласуйте сроки, обсудите условия, разрешите рабочее разногласие. Задайте свою цель и условия, которыми не готовы поступиться.</p><Link className="primary-button" to="/ai/prepare">Подготовить ситуацию →</Link></article>
      <article className="practice-choice"><BriefcaseIcon size={32} /><h2>Учебное собеседование</h2><p>Ответьте на вопросы по вашей специальности и уровню. Получите разбор примеров, обоснований и своего вклада.</p><Link className="primary-button" to="/ai/prepare?kind=job">Подготовить интервью →</Link></article>
    </div><p className="text-sm text-slate-400">Подсказки доступны по желанию. Все завершённые разговоры и разборы сохраняются в истории.</p>
  </div>;
}
