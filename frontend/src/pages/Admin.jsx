import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Admin() {
  const [cfg, setCfg] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setCfg(await api("/api/admin/settings"));
    setSessions(await api("/api/admin/sessions"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  if (!cfg) return <div className="text-rose-300">{msg || "Загрузка…"}</div>;

  async function save() {
    const { scenarios, ...rest } = cfg;
    await api("/api/admin/settings", { method: "PUT", body: rest });
    setMsg("Контекст сохранён. Новые сессии подхватят override.");
  }

  function setOverride(id, text) {
    setCfg((c) => ({ ...c, context_overrides: { ...c.context_overrides, [id]: text } }));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Админ: контекст демо</h1>
      <div className="glass rounded-3xl p-5">
        <label className="text-sm text-slate-400">Название компании</label>
        <input className="mb-3 w-full rounded-xl bg-black/30 p-3" value={cfg.company_name || ""} onChange={(e) => setCfg({ ...cfg, company_name: e.target.value })} />
        <label className="text-sm text-slate-400">Брифинг для жюри</label>
        <textarea className="w-full rounded-xl bg-black/30 p-3" rows={3} value={cfg.briefing || ""} onChange={(e) => setCfg({ ...cfg, briefing: e.target.value })} />
        <label className="mt-3 block text-sm text-slate-400">Сложность по умолчанию</label>
        <input className="w-full rounded-xl bg-black/30 p-3" value={cfg.default_difficulty || ""} onChange={(e) => setCfg({ ...cfg, default_difficulty: e.target.value })} />
      </div>
      {(cfg.scenarios || []).map((s) => (
        <div key={s.id} className="glass rounded-3xl p-5">
          <div className="font-semibold">{s.title}</div>
          <p className="text-xs text-slate-500">{s.id} · {s.steps} шагов</p>
          <textarea
            className="mt-2 w-full rounded-xl bg-black/30 p-3 text-sm"
            rows={4}
            value={cfg.context_overrides?.[s.id] ?? s.context}
            onChange={(e) => setOverride(s.id, e.target.value)}
          />
        </div>
      ))}
      <button onClick={save} className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">
        Сохранить
      </button>
      {msg && <div className="text-emerald-300">{msg}</div>}
      <h2 className="text-lg font-semibold">Последние сессии</h2>
      <div className="space-y-2 text-sm">
        {sessions.map((s) => (
          <div key={s.id} className="glass rounded-xl px-3 py-2">
            #{s.id} {s.title} · {s.status} · {s.verdict || "—"}
          </div>
        ))}
      </div>
    </div>
  );
}
