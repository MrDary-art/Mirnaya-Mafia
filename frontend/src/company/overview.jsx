import { useState } from "react";
import { Calendar } from "./engagement.jsx";
import { api } from "../api.js";
import { useEffect, formatDate, metricLabels, Loader, Empty, Notice } from "./shared.jsx";

export function ManagerOverview({ data, setTab }) {
  const id = data.company.id;
  const [overview, setOverview] = useState(null), [error, setError] = useState("");
  async function load() {
    setError("");
    try { const [analytics, employees, programs, cohorts, meetings] = await Promise.all([api(`/api/company/${id}/analytics`), api(`/api/company/${id}/employees`), api(`/api/company/${id}/programs`), api(`/api/company/${id}/cohorts`), api(`/api/company/${id}/online-1x1`)]); setOverview({ analytics, employees, programs, cohorts, meetings }); }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { setOverview(null); load(); }, [id]);
  if (!overview) return <Loader error={error} onRetry={load} />;
  const { analytics, employees, programs, cohorts, meetings } = overview;
  const activePeople = employees.filter(person => person.status === "ACTIVE");
  const newPeople = activePeople.filter(person => person.joined_at && Date.now() - new Date(person.joined_at).getTime() < 30 * 86400000).length;
  const activePrograms = programs.filter(program => ["PUBLISHED", "ACTIVE"].includes(program.status));
  const nextMeetings = meetings.filter(meeting => meeting.scheduled_at && new Date(meeting.scheduled_at).getTime() >= Date.now() && !["COMPLETED", "CANCELLED"].includes(meeting.status)).sort((first, second) => new Date(first.scheduled_at) - new Date(second.scheduled_at)).slice(0, 3);
  const completion = analytics.assigned ? Math.round(analytics.completed * 100 / analytics.assigned) : null;
  return <div className="space-y-6"><header><h2 className="text-3xl font-bold">Обзор компании</h2><p className="mt-3 text-slate-400">Обучение и практика в вашей области доступа.</p></header>
    <section className="glass rounded-3xl p-5"><dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[["Активные сотрудники", activePeople.length], ["Новые за 30 дней", newPeople], ["Опубликованные программы", activePrograms.length], ["Учебные команды", cohorts.length]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-2 text-2xl font-bold tabular-nums">{value}</dd></div>)}</dl></section>
    {analytics.overdue > 0 && <Notice tone="red">Просрочено назначений: {analytics.overdue}. <button className="ml-2 underline underline-offset-4" onClick={() => setTab("assignments")}>Открыть задания</button></Notice>}
    <section className="glass rounded-3xl p-5"><h3 className="text-xl font-bold">Ход обучения</h3><dl className="mt-5 grid gap-4 sm:grid-cols-3">{[["Назначено", analytics.assigned], ["Завершено", analytics.completed], ["Доля завершения", completion == null ? "Нет назначений" : `${completion}%`]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd></div>)}</dl><p className="mt-4 text-sm text-slate-400">{analytics.data_note}</p><div className="mt-5 flex flex-wrap gap-3"><button className="primary-button" onClick={() => setTab("assignments")}>Назначить задание</button>{(data.permissions.invite_members ?? data.permissions.manage_company) && data.company.status !== "DEMO" && <button className="subtle-button" onClick={() => setTab("employees")}>Пригласить сотрудника</button>}{data.permissions.manage_learning && <button className="subtle-button" onClick={() => setTab("program-builder")}>Собрать программу</button>}<button className="subtle-button" onClick={() => setTab("analytics")}>Открыть аналитику</button></div></section>
    <section className="glass rounded-3xl p-5"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-xl font-bold">Ближайшие встречи 1×1</h3><button className="subtle-button" onClick={() => setTab("meetings")}>Все встречи</button></div><div className="mt-4 space-y-3">{nextMeetings.map(meeting => <article key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-4"><div><b>{meeting.title}</b><p className="mt-2 text-sm text-slate-400">{formatDate(meeting.scheduled_at)}</p><p className="mt-1 text-sm text-slate-400">{meeting.participants?.map(person => person.name).join(" и ")}</p></div>{meeting.can_open && <a className="subtle-button" href={`${data.business_base || ""}/room/${meeting.room_id}`}>Открыть встречу</a>}</article>)}{!nextMeetings.length && <Empty>Предстоящих встреч пока нет.</Empty>}</div></section>
    <section className="glass rounded-3xl p-5"><h3 className="text-xl font-bold">Последние события</h3><div className="mt-4 space-y-3">{data.inbox?.slice(0, 5).map(item => <article key={item.id} className="border-t border-white/10 pt-4"><b>{item.title}</b><p className="mt-2 text-sm text-slate-400">{item.text}</p></article>)}{!data.inbox?.length && <Empty>Событий пока нет.</Empty>}</div></section>
    <Calendar data={data} />
  </div>;
}
