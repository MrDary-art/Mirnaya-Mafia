import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";

export default function AiMode() {
  const nav = useNavigate();
  return <div className="mx-auto max-w-5xl space-y-6">
    <button type="button" onClick={() => nav("/")} className="text-sm text-cyan-200">← Главная</button>
    <header><div className="eyebrow">ВЫ И ИИ</div><h1 className="mt-2 text-4xl font-extrabold">Выберите формат разговора</h1><p className="mt-3 max-w-2xl text-slate-400">В обоих форматах можно писать или говорить голосом. После разговора вы получите разбор.</p></header>
    <div className="grid gap-5 md:grid-cols-2">
      <button type="button" onClick={() => nav("/setup?mode=online")} className="mode-card text-left"><span className="mode-icon"><Icon name="message-circle" size={28} /></span><h2 className="text-2xl font-bold">Настройка сессии</h2><p>Укажите свою роль, собеседника, ситуацию и цель переговоров.</p><span className="mode-action">Настроить разговор →</span></button>
      <button type="button" onClick={() => nav("/ai/job")} className="mode-card text-left"><span className="mode-icon"><Icon name="bot" size={28} /></span><h2 className="text-2xl font-bold">Практика трудоустройства</h2><p>Выберите компанию, вакансию и сложность. ИИ проведёт учебное собеседование.</p><span className="mode-action">Подготовиться к собеседованию →</span></button>
    </div>
  </div>;
}
