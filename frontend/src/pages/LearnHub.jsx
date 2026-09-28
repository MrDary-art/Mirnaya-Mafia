import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function LearnHub() {
  const [programs, setPrograms] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api("/api/learning/programs").then(setPrograms).catch(() => setPrograms([])); }, []);
  if (!programs) return <div className="text-slate-400">Загружаем программу обучения…</div>;
  return <div><h1 className="text-3xl font-extrabold">Сценарное обучение</h1><p className="mt-2 text-slate-400">Короткие упражнения, затем самостоятельная практика.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{programs.map((p) => <div key={p.id} className="glass rounded-3xl p-6"><div className="text-xs uppercase tracking-widest text-lime-300">{p.completed.length}/{p.total_exercises} упражнений</div><h2 className="mt-2 text-xl font-bold">{p.title}</h2><p className="mt-2 text-sm text-slate-400">{p.subtitle}</p><div className="mt-4 space-y-1 text-sm">{Object.entries(p.mastery || {}).map(([k,v]) => <div key={k}>{k}: <span className="text-lime-200">{v}%</span></div>)}</div><div className="mt-5 flex gap-3"><button onClick={() => nav(`/learn/${p.id}`)} className="rounded-xl bg-lime-400 px-4 py-2 font-semibold text-slate-950">Продолжить</button><button onClick={() => nav(`/learn/${p.id}/errors`)} className="rounded-xl border border-white/15 px-4 py-2">Отработать ошибки</button></div></div>)}</div></div>;
}
