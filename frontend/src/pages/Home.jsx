import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <div>
      <div className="eyebrow">АРЕНА ПЕРЕГОВОРОВ</div>
      <h1 className="text-4xl font-extrabold">Развивайте навык<br />в реальных диалогах</h1>
      <p className="mt-3 max-w-2xl text-slate-400">Выберите режим практики.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <button onClick={() => nav("/setup")} className="mode-card text-left">
          <span className="mode-icon">◉</span>
          <div className="text-2xl font-bold">Online 1×1</div>
          <p>Настройте сессию и проверьте навыки в переговорах.</p>
          <span className="mode-action">Выбрать формат →</span>
        </button>
        <button onClick={() => nav("/training/path")} className="mode-card text-left">
          <span className="mode-icon">✦</span>
          <div className="text-2xl font-bold">Обучение</div>
          <p>Проходите учебную программу, осваивайте навыки и отслеживайте прогресс.</p>
          <span className="mode-action">Открыть обучение →</span>
        </button>
        <button onClick={() => nav("/practice")} className="mode-card text-left">
          <span className="mode-icon">◌</span>
          <div className="text-2xl font-bold">ИИ-чат</div>
          <p>Тренируйтесь в свободном текстовом диалоге с поддержкой ИИ.</p>
          <span className="mode-action">Начать диалог →</span>
        </button>
      </div>
    </div>
  );
}
