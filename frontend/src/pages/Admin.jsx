import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";

export default function Admin() {
  const [tab, setTab] = useState("team");
  const [cfg, setCfg] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [team, setTeam] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [msg, setMsg] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [scenarioId, setScenarioId] = useState("");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));

  async function loadSettings() {
    const [settings, recent] = await Promise.all([api("/api/admin/settings"), api("/api/admin/sessions")]);
    setCfg(settings);
    setSessions(recent);
    setScenarioId((current) => current || settings.scenarios?.[0]?.id || "");
  }
  async function loadTeam() {
    const [analytics, tasks] = await Promise.all([api("/api/admin/team-analytics"), api("/api/admin/assignments")]);
    setTeam(analytics);
    setAssignments(tasks);
  }

  useEffect(() => { Promise.all([loadSettings(), loadTeam()]).catch((error) => setMsg(error.message)); }, []);

  async function save() {
    const { scenarios, ...rest } = cfg;
    await api("/api/admin/settings", { method: "PUT", body: rest });
    setMsg("Контекст сохранён. Новые сессии подхватят настройки.");
  }

  function setOverride(id, text) {
    setCfg((current) => ({ ...current, context_overrides: { ...current.context_overrides, [id]: text } }));
  }

  async function assign(event) {
    event.preventDefault();
    if (!selectedUsers.length) return setMsg("Выберите хотя бы одного сотрудника.");
    try {
      await api("/api/admin/assignments", { method: "POST", body: { scenario_id: scenarioId, user_ids: selectedUsers, deadline: new Date(deadline).toISOString() } });
      setSelectedUsers([]);
      setMsg("Сценарий назначен сотрудникам.");
      await loadTeam();
    } catch (error) {
      setMsg(error.message);
    }
  }

  async function removeAssignment(id) {
    await api(`/api/admin/assignments/${id}`, { method: "DELETE" });
    await loadTeam();
  }

  function exportCsv() {
    const header = ["Сотрудник", "Логин", "Команда", "Negotiation IQ", "Уровень", "Сессии", "Средний балл", "Зона роста"];
    const rows = (team?.members || []).map((item) => [item.display_name, item.username, item.organization, item.negotiation_iq, item.rank, item.sessions, item.average_score, item.weakest_skill]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `arena-team-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!cfg || !team) return <div className="text-rose-300">{msg || "Загрузка корпоративного кабинета…"}</div>;

  return <div className="space-y-6">
    <header className="glass rounded-3xl p-6 md:p-8"><div className="eyebrow ui-icon-label"><Icon name="shield-check" size={16} />КОРПОРАТИВНЫЙ КАБИНЕТ</div><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Развитие команды</h1><p className="mt-2 text-slate-400">Назначайте сценарии, отслеживайте прохождение и находите общие зоны роста.</p></div><div className="flex gap-2"><button className="subtle-button ui-icon-label" onClick={exportCsv}><Icon name="arrow-up-right" size={16} />CSV</button><button className="subtle-button ui-icon-label" onClick={() => window.print()}><Icon name="book-open" size={16} />Печать / PDF</button></div></div></header>

    <nav className="flex gap-2 border-b border-white/10"><Tab active={tab === "team"} onClick={() => setTab("team")}>Команда</Tab><Tab active={tab === "assignments"} onClick={() => setTab("assignments")}>Назначения</Tab><Tab active={tab === "settings"} onClick={() => setTab("settings")}>Контекст сценариев</Tab></nav>
    {msg && <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100">{msg}</div>}

    {tab === "team" && <TeamDashboard team={team} />}

    {tab === "assignments" && <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={assign} className="glass h-fit rounded-3xl p-6"><div className="eyebrow">НОВОЕ ЗАДАНИЕ</div><h2 className="mt-1 text-xl font-bold">Назначить сценарий</h2><label className="mt-5 block text-sm text-slate-400">Сценарий<select className="mt-2 w-full rounded-xl bg-slate-950 p-3 text-white" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{cfg.scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="mt-4 block text-sm text-slate-400">Дедлайн<input type="datetime-local" required className="mt-2 w-full rounded-xl bg-slate-950 p-3 text-white" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><fieldset className="mt-5"><legend className="text-sm text-slate-400">Сотрудники</legend><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{team.members.filter((item) => item.username !== "admin").map((item) => <label key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" checked={selectedUsers.includes(item.id)} onChange={(event) => setSelectedUsers((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><b className="block">{item.display_name}</b><small className="text-slate-500">{item.organization}</small></span></label>)}</div></fieldset><button className="primary-button mt-5 w-full">Назначить</button></form>
      <section className="space-y-3"><div><div className="eyebrow">КОНТРОЛЬ ПРОХОЖДЕНИЯ</div><h2 className="mt-1 text-xl font-bold">Активные назначения</h2></div>{assignments.map((item) => <article key={item.id} className="glass rounded-3xl p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><b className="text-lg">{item.scenario_title}</b><p className="mt-1 text-sm text-slate-400">До {new Date(item.deadline).toLocaleString("ru-RU")}</p></div><button className="text-sm text-rose-200" onClick={() => removeAssignment(item.id)}>Отменить</button></div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${item.user_ids.length ? item.completed_user_ids.length / item.user_ids.length * 100 : 0}%` }} /></div><span className="text-sm text-slate-300">{item.completed_user_ids.length}/{item.user_ids.length}</span></div><p className="mt-3 text-sm text-slate-400">{item.user_names.join(", ")}</p></article>)}{!assignments.length && <div className="glass rounded-3xl p-6 text-slate-400">Назначений пока нет.</div>}</section>
    </div>}

    {tab === "settings" && <div className="space-y-5">
      <div className="glass rounded-3xl p-5"><label className="text-sm text-slate-400">Название компании</label><input className="mb-3 w-full rounded-xl bg-black/30 p-3" value={cfg.company_name || ""} onChange={(event) => setCfg({ ...cfg, company_name: event.target.value })} /><label className="text-sm text-slate-400">Брифинг для жюри</label><textarea className="w-full rounded-xl bg-black/30 p-3" rows={3} value={cfg.briefing || ""} onChange={(event) => setCfg({ ...cfg, briefing: event.target.value })} /><label className="mt-3 block text-sm text-slate-400">Сложность по умолчанию</label><input className="w-full rounded-xl bg-black/30 p-3" value={cfg.default_difficulty || ""} onChange={(event) => setCfg({ ...cfg, default_difficulty: event.target.value })} /></div>
      {cfg.scenarios.map((scenario) => <div key={scenario.id} className="glass rounded-3xl p-5"><div className="font-semibold">{scenario.title}</div><p className="text-xs text-slate-500">{scenario.id} · {scenario.steps} шагов</p><textarea className="mt-2 w-full rounded-xl bg-black/30 p-3 text-sm" rows={4} value={cfg.context_overrides?.[scenario.id] ?? scenario.context} onChange={(event) => setOverride(scenario.id, event.target.value)} /></div>)}
      <button onClick={save} className="primary-button">Сохранить</button><h2 className="text-lg font-semibold">Последние сессии</h2><div className="space-y-2 text-sm">{sessions.slice(0, 20).map((session) => <div key={session.id} className="glass rounded-xl px-3 py-2">#{session.id} {session.title} · {session.status} · {session.verdict || "—"}</div>)}</div>
    </div>}
  </div>;
}

function TeamDashboard({ team }) {
  const strongest = useMemo(() => [...team.members].filter((item) => item.sessions).sort((a, b) => b.average_score - a.average_score)[0], [team]);
  return <><div className="grid gap-4 sm:grid-cols-3"><Metric icon="users" value={team.members.length} label="участников" /><Metric icon="target" value={`${team.team_average}%`} label="средний балл команды" /><Metric icon="trophy" value={strongest?.display_name || "—"} label="лучший текущий результат" /></div><section className="glass overflow-hidden rounded-3xl"><div className="border-b border-white/10 p-5"><h2 className="text-xl font-bold">Прогресс сотрудников</h2><p className="mt-1 text-sm text-slate-400">Индекс помогает выбрать обучение и не используется как кадровая оценка.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-4">Сотрудник</th><th className="p-4">Negotiation IQ</th><th className="p-4">Средний балл</th><th className="p-4">Сессии</th><th className="p-4">Зона роста</th></tr></thead><tbody>{team.members.map((item) => <tr key={item.id} className="border-t border-white/5"><td className="p-4"><b className="block">{item.display_name}</b><small className="text-slate-500">{item.organization}</small></td><td className="p-4"><b className="text-cyan-200">{item.negotiation_iq}</b><small className="ml-2 text-slate-500">{item.rank}</small></td><td className="p-4">{item.average_score}%</td><td className="p-4">{item.sessions}</td><td className="p-4 text-slate-300">{item.weakest_skill}</td></tr>)}</tbody></table></div></section></>;
}

function Metric({ icon, value, label }) { return <div className="glass rounded-3xl p-5"><Icon name={icon} size={20} className="text-cyan-200" /><b className="mt-3 block text-2xl">{value}</b><span className="text-sm text-slate-400">{label}</span></div>; }
function Tab({ active, onClick, children }) { return <button onClick={onClick} className={`px-4 py-3 text-sm ${active ? "border-b-2 border-cyan-300 text-cyan-100" : "text-slate-400"}`}>{children}</button>; }
