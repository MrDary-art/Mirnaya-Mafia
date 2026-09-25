import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";

const statCards = [
  ["best_score", "trophy", "Лучший результат"],
  ["average_score", "target", "Средний результат"],
  ["drills_total", "graduation-cap", "Практик выполнено"],
  ["day_streak", "zap", "Дней подряд"],
];

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();

  const load = () => api("/api/analytics/overview").then(setData).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, []);

  const weakest = useMemo(() => data?.dimensions?.reduce((current, item) => !current || item.score < current.score ? item : current, null), [data]);

  async function setGoal(sessions) {
    setSaving(true);
    try {
      await api("/api/analytics/weekly-goal", { method: "PUT", body: { sessions } });
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="text-slate-400">{error || "Собираем аналитику…"}</div>;

  return <section className="space-y-6">
    <header className="glass overflow-hidden rounded-3xl p-6 md:p-8">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="eyebrow ui-icon-label"><Icon name="brain" size={16} />АНАЛИТИКА ПРОГРЕССА</div>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">Ваш Negotiation IQ</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Общая картина навыков по завершённым переговорам и учебным практикам.</p>
        </div>
        <div className="min-w-64 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
          <div className="flex items-end justify-between"><strong className="text-5xl text-cyan-100">{data.negotiation_iq}</strong><span className="pb-1 text-sm text-slate-400">из 1000</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{ width: `${data.negotiation_iq / 10}%` }} /></div>
          <div className="mt-3 text-sm text-cyan-200">Уровень: {data.rank}</div>
        </div>
      </div>
      <p className="mt-5 text-xs text-slate-500">{data.method_note}</p>
    </header>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map(([key, icon, label]) => <article key={key} className="glass rounded-3xl p-5"><Icon name={icon} size={22} className="text-cyan-200" /><strong className="mt-4 block text-3xl">{data[key]}{key.includes("score") ? "%" : ""}</strong><span className="text-sm text-slate-400">{label}</span></article>)}
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
      <section className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3"><div><div className="eyebrow">КАРТА НАВЫКОВ</div><h2 className="mt-1 text-2xl font-bold">Восемь измерений переговоров</h2></div><span className="text-sm text-slate-500">0–100</span></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data.dimensions.map((item) => <div key={item.id} className="rounded-2xl border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><b>{item.label}</b><span className="text-cyan-200">{item.score}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{ width: `${item.score}%` }} /></div><small className={item.change > 0 ? "mt-2 block text-emerald-300" : item.change < 0 ? "mt-2 block text-amber-200" : "mt-2 block text-slate-500"}>{item.change > 0 ? `Рост +${item.change}` : item.change < 0 ? `Изменение ${item.change}` : "Без изменения"}</small></div>)}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="glass rounded-3xl p-6">
          <div className="eyebrow ui-icon-label"><Icon name="calendar-days" size={15} />ЦЕЛЬ НА НЕДЕЛЮ</div>
          <div className="mt-3 flex items-end justify-between"><strong className="text-3xl">{data.weekly_goal.completed} / {data.weekly_goal.target}</strong><span className="text-sm text-cyan-200">{data.weekly_goal.percent}%</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${data.weekly_goal.percent}%` }} /></div>
          <label className="mt-5 block text-sm text-slate-400">Сколько сессий пройти<select disabled={saving} value={data.weekly_goal.target} onChange={(event) => setGoal(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white">{[1, 2, 3, 4, 5, 7, 10].map((value) => <option key={value} value={value}>{value} в неделю</option>)}</select></label>
        </section>
        <section className="glass rounded-3xl p-6">
          <div className="eyebrow">СЛЕДУЮЩИЙ ШАГ</div><h2 className="mt-2 text-xl font-bold">{weakest?.label || "Начните первую практику"}</h2><p className="mt-2 text-sm text-slate-400">Сейчас это направление даёт наибольший запас роста.</p><button className="primary-button mt-5" onClick={() => nav("/training")}>Открыть тренировку</button>
        </section>
      </aside>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="glass rounded-3xl p-6"><div className="eyebrow">СИЛЬНЫЕ КАТЕГОРИИ</div><h2 className="mt-1 text-xl font-bold">Результаты по темам</h2><div className="mt-5 space-y-4">{data.category_strengths.map((item) => <div key={item.category}><div className="flex justify-between gap-3 text-sm"><span>{item.category} · {item.sessions} сесс.</span><b>{item.score}%</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400" style={{ width: `${item.score}%` }} /></div></div>)}{!data.category_strengths.length && <p className="text-sm text-slate-400">Категории появятся после завершённых переговоров.</p>}</div></section>
      <section className="glass rounded-3xl p-6"><div className="eyebrow">ДИНАМИКА</div><h2 className="mt-1 text-xl font-bold">Последние результаты</h2><div className="mt-5 flex min-h-48 items-end gap-2">{data.trend.map((item) => <button title={`${item.title}: ${item.score}%`} key={item.session_id} onClick={() => nav(`/report/${item.session_id}`)} className="group flex min-w-0 flex-1 flex-col justify-end"><span className="mb-2 text-xs text-slate-500 opacity-0 transition group-hover:opacity-100">{item.score}</span><i className="block min-h-2 rounded-t-lg bg-gradient-to-t from-cyan-400 to-violet-400" style={{ height: `${Math.max(8, item.score * 1.5)}px` }} /><small className="mt-2 truncate text-[10px] text-slate-500">{new Date(`${item.date}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</small></button>)}{!data.trend.length && <p className="self-center text-sm text-slate-400">Здесь появится график ваших сессий.</p>}</div></section>
    </div>

    {data.assignments?.length > 0 && <section className="glass rounded-3xl p-6"><div className="eyebrow ui-icon-label"><Icon name="users" size={15} />ЗАДАНИЯ КОМАНДЫ</div><h2 className="mt-1 text-xl font-bold">Назначено руководителем</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{data.assignments.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 p-4"><div className="flex items-start justify-between gap-3"><b>{item.scenario_title}</b><span className={item.completed ? "text-emerald-300" : "text-amber-200"}>{item.completed ? "Выполнено" : "Назначено"}</span></div><p className="mt-2 text-sm text-slate-400">Срок: {new Date(item.deadline).toLocaleString("ru-RU")}</p>{!item.completed && <button className="subtle-button mt-4" onClick={() => nav(`/setup?preset=${item.scenario_id}`)}>Начать</button>}</article>)}</div></section>}
  </section>;
}
