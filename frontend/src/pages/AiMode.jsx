import PageHeader from "../design/PageHeader.jsx";
import { Link, useParams } from "react-router-dom";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { businessPracticePath } from "../business/navigation.js";

export default function AiMode() {
  const { companyId } = useParams();
  const aiBase = companyId ? businessPracticePath(companyId, "ai") : "/ai";
  return <div className="practice-page">
    <PageHeader eyebrow="Практика с ИИ" title="Подготовьтесь к важному разговору" description="Одна задача, собеседник в роли и разбор конкретных решений. Пишите или отправляйте голосовые сообщения — формат можно менять в разговоре." />
    <div className="practice-options">
      <article className="practice-choice practice-choice-main"><div className="practice-choice-heading"><ChatCircleDotsIcon size={30} aria-hidden="true" /><span>01 / ПЕРЕГОВОРЫ</span></div><h2>Деловые переговоры</h2><p>Согласуйте сроки, обсудите условия, разрешите рабочее разногласие. Задайте свою цель и условия, которыми не готовы поступиться.</p><Link className="primary-button" to={`${aiBase}/prepare`}>Подготовить ситуацию →</Link></article>
    </div>
  </div>;
}
