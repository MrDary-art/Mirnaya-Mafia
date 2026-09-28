import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";

export default function IdealDialogue() {
  const { id } = useParams();
  const [dialogue, setDialogue] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api(`/api/sessions/${id}/ideal-dialogue`)
      .then((data) => { if (!cancelled) setDialogue(data); })
      .catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <section className="glass report-load-state" role="alert"><h1>Идеальный сценарий недоступен</h1><p>{error}</p><button className="subtle-button" onClick={() => navigate(`/report/${id}`)}>К отчёту</button></section>;
  if (!dialogue) return <div className="glass report-load-state" role="status">Собираем идеальный диалог…</div>;

  return <section className="mx-auto max-w-4xl space-y-5">
    <header className="glass rounded-3xl p-6">
      <div className="eyebrow">ЭТАЛОННЫЙ ПРОХОД</div>
      <h1 className="mt-2 text-3xl font-extrabold">{dialogue.scenario_title}</h1>
      <p className="mt-3 text-slate-300">{dialogue.goal}</p>
      <p className="mt-3 text-sm text-slate-400">Все варианты ниже выбраны по максимальному суммарному вкладу в доверие, цель, контроль и EQ.</p>
    </header>

    <div className="space-y-3" aria-label="Идеальная переписка">
      {dialogue.messages.map((message, index) => {
        const player = message.speaker === "player";
        const name = player ? dialogue.roles?.player || "Вы" : dialogue.roles?.opponent || "Собеседник";
        return <article key={`${message.speaker}-${index}`} className={`rounded-3xl border p-5 ${player ? "ml-4 border-lime-300/30 bg-lime-300/10 md:ml-16" : "mr-4 border-white/10 bg-slate-950/50 md:mr-16"}`}>
          <div className={`text-xs font-semibold uppercase tracking-widest ${player ? "text-lime-200" : "text-slate-400"}`}>{name}{player && " · правильный выбор"}</div>
          <p className="mt-2 whitespace-pre-wrap text-slate-100">{message.text}</p>
          {player && <div className="mt-4 border-t border-lime-200/15 pt-3 text-sm"><p className="text-lime-100">Почему: {message.reason}</p>{message.techniques?.length > 0 && <p className="mt-2 text-slate-400">Инструменты: {message.techniques.join(" · ")}</p>}</div>}
        </article>;
      })}
    </div>

    <section className="glass rounded-3xl p-6"><div className="eyebrow">ИТОГ ЭТАЛОННОГО ДИАЛОГА</div><h2 className="mt-2 text-xl font-bold">{dialogue.ending?.verdict}</h2><div className="mt-5"><MetricsBar metrics={dialogue.metrics} /></div></section>
  </section>;
}
