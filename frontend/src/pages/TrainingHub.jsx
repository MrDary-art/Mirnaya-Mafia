import { useNavigate } from "react-router-dom";

export default function TrainingHub() {
  const nav = useNavigate();
  return <div className="space-y-7"><div><div className="eyebrow">AI TRAINING</div><h1 className="text-4xl font-extrabold">Тренируйте переговоры как навык</h1><p className="mt-3 max-w-xl text-slate-400">Выберите структурированное обучение или свободный разговор с AI. Без длинной конфигурации перед стартом.</p></div><div className="grid gap-5 md:grid-cols-2"><button onClick={()=>nav('/training/tree')} className="mode-card text-left"><span className="mode-icon">✦</span><div className="text-2xl font-bold">Learning Tree</div><p>HR и Sales, короткие уровни, финальные сцены, XP и звёзды.</p><span className="mode-action">Открыть карту →</span></button><button onClick={()=>nav('/practice')} className="mode-card text-left"><span className="mode-icon">◌</span><div className="text-2xl font-bold">Free AI Practice</div><p>Свободно тренируйтесь в текстовом диалоге с AI и fallback-режимом.</p><span className="mode-action">Начать практику →</span></button></div><button onClick={()=>nav('/training/errors')} className="subtle-button">Отработать ошибки</button></div>;
}
