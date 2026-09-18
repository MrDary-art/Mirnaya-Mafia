import { useEffect, useState } from "react";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";

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
          Уровень {p.level} ({p.level_name}) · {p.xp ?? 0} XP · ★ {p.stars} · сессий {p.sessions_total}
        </p>
        <p className="mt-3 text-sm text-slate-300">
          Игровой профиль переговорщика (на основе TKI, не Big Five и не клиническая диагностика): {p.profile || "пока мало данных"}
        </p>
        {p.current_streak > 0 && (
          <p className="mt-2 text-sm text-orange-400">🔥 Текущий стрик: {p.current_streak} дн.</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-slate-400">Уникальные роли</div>
            <div className="font-semibold">{(p.unique_roles || []).length}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-slate-400">Сценарии пройдено</div>
            <div className="font-semibold">{(p.unique_scenarios || []).length}</div>
          </div>
        </div>
      </div>
      
      {last && <MetricsBar metrics={last} />}
      
      <div className="glass rounded-3xl p-5">
        <h2 className="font-semibold">Достижения ({(p.achievements || []).length})</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(p.achievement_details || []).map((a) => (
            <span key={a.code} className="rounded-full border border-cyan-400/30 px-3 py-1 text-sm" title={a.unlocked_at}>
              ⭐ {a.name}
            </span>
          ))}
          {(p.achievements || []).length === 0 && (
            <span className="text-sm text-slate-500">Появятся после первой сессии</span>
          )}
        </div>
      </div>
      
      <div className="glass rounded-3xl p-5">
        <h2 className="font-semibold">Магазин звёзд</h2>
        <p className="mt-2 text-sm text-slate-400">Тратьте звёзды на подсказки и косметику (в разработке)</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(p.star_costs || {}).map(([code, cost]) => (
            <div key={code} className="flex items-center justify-between rounded-xl border border-white/10 p-3">
              <span className="text-sm capitalize">{code.replace(/_/g, " ")}</span>
              <span className="text-sm font-semibold text-yellow-400">★ {cost}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="glass rounded-3xl p-5">
        <h2 className="font-semibold">Прогресс до следующего уровня</h2>
        <div className="mt-3 text-sm text-slate-400">
          {p.level < 5 ? (
            <>
              <p>Сейчас: {p.level_name}</p>
              <p className="mt-1">Следующий уровень: {p.level === 1 ? "Практик (5 сессий, Trust > 50 в 3 из них)" : 
                  p.level === 2 ? "Переговорщик (15 сессий, 3 победы, все метрики > 60)" :
                  p.level === 3 ? "Мастер (30 сессий, все метрики > 70, 5 сценариев)" :
                  "Гуру (50 сессий, 10 побед, 3 роли)"}</p>
            </>
          ) : (
            <p className="text-green-400">🏆 Максимальный уровень!</p>
          )}
        </div>
      </div>
    </div>
  );
}
