import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const PRESETS = [
  {
    id: "hr_firing_01",
    title: "Увольнение без конфликта",
    tag: "HR vs подчинённый",
    text: "Ключевой сценарий MVP. 6 шагов, ветвление, TKI и BATNA.",
  },
  {
    id: "sales_discount_01",
    title: "Торг за скидку",
    tag: "Продавец vs клиент",
    text: "ZOPA, якорь конкурента, закрытие сделки без обнуления маржи.",
  },
  {
    id: "salary_talk_01",
    title: "Переговоры о зарплате",
    tag: "Сотрудник vs руководитель",
    text: "Интересы vs позиции, письменный план, спокойная BATNA.",
  },
];

export default function Home() {
  const nav = useNavigate();
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    api("/api/sessions")
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  const active = sessions.filter((s) => s.status === "active");

  return (
    <div>
      <div className="eyebrow">АРЕНА ПЕРЕГОВОРОВ</div><h1 className="text-4xl font-extrabold">Развивайте навык<br/>в реальных диалогах</h1>
      <p className="mt-3 max-w-2xl text-slate-400">Выберите способ практики — без длинной формы перед началом.</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2"><button onClick={()=>nav('/setup')} className="mode-card text-left"><span className="mode-icon">◎</span><div className="text-2xl font-bold">Online 1×1</div><p>Настройте сессию и проверьте навыки в переговорах.</p><span className="mode-action">Найти формат →</span></button><button onClick={()=>nav('/training')} className="mode-card text-left"><span className="mode-icon">✦</span><div className="text-2xl font-bold">AI Training</div><p>Уровни, ошибки, финальные сцены и свободная практика.</p><span className="mode-action">Начать тренировку →</span></button></div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => nav(`/setup?preset=${p.id}`)}
            className="glass rounded-3xl p-5 text-left transition hover:shadow-neon"
          >
            <div className="text-xs uppercase tracking-widest text-cyan-300">{p.tag}</div>
            <div className="mt-2 text-xl font-bold">{p.title}</div>
            <p className="mt-2 text-sm text-slate-400">{p.text}</p>
          </button>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={() => nav("/setup")} className="rounded-2xl border border-white/15 px-5 py-3">
          Своя настройка
        </button>
        <button onClick={() => nav("/history")} className="rounded-2xl border border-white/15 px-5 py-3">
          История сессий
        </button>
      </div>
      {active.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Активные переговоры ({active.length}/10)</h2>
          <div className="mt-3 grid gap-3">
            {active.map((s) => (
              <button key={s.id} onClick={() => nav(`/play/${s.id}`)} className="glass flex justify-between rounded-2xl px-4 py-3 text-left">
                <span>
                  {s.title} · {s.role}
                </span>
                <span className="text-cyan-300">Продолжить</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
