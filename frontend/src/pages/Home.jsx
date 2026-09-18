import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <div>
      <div className="eyebrow">АРЕНА ПЕРЕГОВОРОВ</div>
      <h1 className="text-4xl font-extrabold">Развивайте навык<br />в реальных диалогах</h1>
      <p className="mt-3 max-w-2xl text-slate-400">Выберите режим практики.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <button onClick={() => nav("/ai")} className="mode-card text-left">
          <span className="mode-icon">◉</span>
          <div className="text-2xl font-bold">Вы и ИИ</div>
          <p>Личный тренажёр переговоров с голосом и разбором.</p>
          <span className="mode-action">Выбрать формат →</span>
        </button>
        <button onClick={() => nav("/rooms")} className="mode-card text-left">
          <span className="mode-icon">◎</span>
          <div className="text-2xl font-bold">Практика вдвоём</div>
          <p>Живые переговоры с видео или два собеседования с ИИ.</p>
          <span className="mode-action">Создать комнату →</span>
        </button>
        <button onClick={() => nav("/training/path")} className="mode-card text-left">
          <span className="mode-icon">✦</span>
          <div className="text-2xl font-bold">Обучение</div>
          <p>Проходите учебную программу, осваивайте навыки и отслеживайте прогресс.</p>
          <span className="mode-action">Открыть обучение →</span>
        </button>
      </div>
    </div>
  );
}
