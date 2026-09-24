import { useNavigate } from "react-router-dom";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import Icon from "../components/Icon.jsx";

export default function TrainingHub() {
  const nav = useNavigate();
  return <div className="space-y-7"><TrainingNavigation fallback="/" /><div><div className="eyebrow">ОБУЧЕНИЕ ПЕРЕГОВОРАМ</div><h1 className="text-4xl font-extrabold">Изучайте и закрепляйте навыки</h1><p className="mt-3 max-w-xl text-slate-400">Короткая теория с мини-практикой и существующая последовательная программа.</p></div><div className="grid gap-5 md:grid-cols-2"><button onClick={() => nav("/theory")} className="mode-card text-left"><span className="mode-icon"><Icon name="book-open" size={28} /></span><div className="text-2xl font-bold">Теория</div><p>Два коротких урока о сильном диалоге: объяснение, примеры, ошибки и три задания.</p><span className="mode-action">Открыть теорию →</span></button><button onClick={() => nav("/training/path")} className="mode-card text-left"><span className="mode-icon"><Icon name="route" size={28} /></span><div className="text-2xl font-bold">Практика</div><p>Десять глав и шестьдесят уровней: от понимания собеседника до сложных переговоров.</p><span className="mode-action">Открыть программу →</span></button></div></div>;
}
