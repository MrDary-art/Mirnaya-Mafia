import { useNavigate } from "react-router-dom";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";

export default function TrainingHub() {
  const nav = useNavigate();
  return <div className="space-y-7"><TrainingNavigation fallback="/" /><div><div className="eyebrow">ТРЕНИРОВКА ПЕРЕГОВОРОВ</div><h1 className="text-4xl font-extrabold">Тренируйте переговоры как навык</h1><p className="mt-3 max-w-xl text-slate-400">Последовательная практика с понятной обратной связью и сохранением прогресса.</p></div><div className="grid gap-5 md:grid-cols-2"><button onClick={() => nav("/training/path")} className="mode-card text-left"><span className="mode-icon">✦</span><div className="text-2xl font-bold">Учебная программа</div><p>Десять глав и шестьдесят уровней: от понимания собеседника до сложных переговоров о цене, границах и ресурсах.</p><span className="mode-action">Открыть программу →</span></button><button onClick={() => nav("/practice")} className="mode-card text-left"><span className="mode-icon">◌</span><div className="text-2xl font-bold">Свободная практика с ИИ</div><p>Тренируйтесь в текстовом диалоге с поддержкой ИИ и автономным режимом.</p><span className="mode-action">Начать практику →</span></button></div></div>;
}
