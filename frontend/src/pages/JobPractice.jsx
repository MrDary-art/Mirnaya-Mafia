import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";

const DIFFICULTIES = [
  ["easy", "Лёгкий — поддерживающее собеседование"],
  ["medium", "Средний — обычные вопросы и уточнения"],
  ["hard", "Сложный — подробная проверка опыта"],
  ["brutal", "Жёсткий — стресс-вопросы без грубости"],
];

export default function JobPractice() {
  const nav = useNavigate();
  const [form, setForm] = useState({ display_name: "", company: "", position: "", difficulty: "medium" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function start(event) {
    event.preventDefault();
    const displayName = form.display_name.trim();
    const company = form.company.trim();
    const position = form.position.trim();
    if (!displayName || !company || !position || busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await api("/api/sessions", { method: "POST", body: {
        mode: "online", practice_kind: "job_interview", display_name: displayName,
        target_company: company, target_position: position, difficulty: form.difficulty,
        role: "Кандидат", opponent_role: `Интервьюер компании ${company}`,
        problem: `Собеседование на позицию «${position}» в компании «${company}»`,
        goal: `Успешно пройти собеседование на позицию «${position}»`, tone: "нейтральный",
      } });
      nav(`/practice?session=${session.id}`);
    } catch (exc) {
      setError(exc.message);
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300/60";
  return <div className="job-layout"><div className="job-main">
    <Link to="/ai" className="text-sm text-cyan-200">← Форматы разговора</Link>
    <header><div className="eyebrow">ПРАКТИКА ТРУДОУСТРОЙСТВА</div><h1 className="mt-2 text-4xl font-extrabold">Подготовьтесь к собеседованию</h1><p className="mt-3 text-slate-400">Укажите компанию и позицию. ИИ сыграет роль интервьюера; вы сможете отвечать голосом или текстом.</p></header>
    <form onSubmit={start} className="glass grid gap-5 rounded-3xl p-6 sm:grid-cols-2">
      <label className="text-sm text-slate-300 sm:col-span-2">Как к вам обращаться<input className={input} maxLength={60} required value={form.display_name} onChange={(event) => set("display_name", event.target.value)} placeholder="Например, Алексей" /></label>
      <label className="text-sm text-slate-300">В какую компанию хотите устроиться<input className={input} maxLength={120} required value={form.company} onChange={(event) => set("company", event.target.value)} placeholder="Например, GitHub" /></label>
      <label className="text-sm text-slate-300">На какую позицию<input className={input} maxLength={120} required value={form.position} onChange={(event) => set("position", event.target.value)} placeholder="Например, разработчик" /></label>
      <label className="text-sm text-slate-300 sm:col-span-2">Уровень сложности<select className={input} value={form.difficulty} onChange={(event) => set("difficulty", event.target.value)}>{DIFFICULTIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p role="alert" className="text-sm text-rose-300 sm:col-span-2">{error}</p>}
      <button type="submit" aria-busy={busy} disabled={busy || !form.display_name.trim() || !form.company.trim() || !form.position.trim()} className="primary-button justify-self-start sm:col-span-2">{busy ? "Создаём собеседование…" : "Начать собеседование →"}</button>
    </form>
  </div><aside className="job-visual"><span>02 / КОНТЕКСТ ВАКАНСИИ</span><p>Ситуация собирается из ваших ответов. Сессия начнётся только после нажатия кнопки и подтверждения сервера.</p></aside></div>;
}
