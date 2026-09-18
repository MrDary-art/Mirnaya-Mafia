import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <div>
      <div className="eyebrow">АРЕНА ПЕРЕГОВОРОВ</div>
      <h1 className="text-4xl font-extrabold">Развивайте навык<br />в реальных диалогах</h1>
      <p className="mt-3 max-w-2xl text-slate-400">Выберите способ практики.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <button onClick={() => nav("/setup")} className="mode-card text-left">
          <span className="mode-icon">◉</span>
          <div className="text-2xl font-bold">Online 1×1</div>
          <p>Настройте сессию и проверьте навыки в переговорах.</p>
          <span className="mode-action">Выбрать формат →</span>
        </button>
        <button onClick={() => nav("/training")} className="mode-card text-left">
          <span className="mode-icon">✦</span>
          <div className="text-2xl font-bold">AI Training</div>
          <p>Уровни, ошибки, финальные сцены и свободная практика.</p>
          <span className="mode-action">Начать тренировку →</span>
        </button>
      </div>
    </div>
  );
}
