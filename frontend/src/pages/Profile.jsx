import { useEffect, useState } from "react";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";

const ACH = {
  no_interrupt: "Ни разу не перебил",
  aggressive_deal: "Сделка с агрессивным клиентом",
  used_batna: "Использовал BATNA",
};

export default function Profile() {
  const [p, setP] = useState(null);
  useEffect(() => {
    api("/api/profile").then(setP);
  }, []);
  if (!p) return null;
  const last = p.metrics_chart?.at(-1);
  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6">
        <div className="text-xs uppercase tracking-widest text-cyan-300">Личный кабинет</div>
        <h1 className="text-3xl font-extrabold">{p.username}</h1>
        <p className="mt-2 text-slate-400">
          Уровень {p.level} · ★ {p.stars} · сессий {p.sessions_total}
        </p>
        <p className="mt-3 text-sm text-slate-300">
          Игровой профиль переговорщика (на основе TKI, не Big Five и не клиническая диагностика): {p.profile || "пока мало данных"}
        </p>
      </div>
      {last && <MetricsBar metrics={last} />}
      <div className="glass rounded-3xl p-5">
        <h2 className="font-semibold">Достижения</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(p.achievements || []).map((c) => (
            <span key={c} className="rounded-full border border-cyan-400/30 px-3 py-1 text-sm">
              {ACH[c] || c}
            </span>
          ))}
          {p.achievements?.length === 0 && <span className="text-sm text-slate-500">Появятся после первой сессии</span>}
        </div>
      </div>
    </div>
  );
}
