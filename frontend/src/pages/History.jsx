import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function History() {
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState("all");
  const [state, setState] = useState("all");
  const nav = useNavigate();
  useEffect(() => {
    api("/api/history").then(setRows);
  }, []);
  const visibleRows = rows.filter((row) => (kind === "all" || row.kind === kind) && (state === "all" || (state === "finished" ? row.finished : !row.finished)));
  return (
    <div>
      <h1 className="text-2xl font-bold">История обучения и переговоров</h1>
      <p className="mt-2 text-sm text-slate-400">Здесь сохраняются все переговоры и все начатые курсы.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Filter active={kind === "all"} onClick={() => setKind("all")}>Все сессии</Filter>
        <Filter active={kind === "negotiation"} onClick={() => setKind("negotiation")}>Переговоры</Filter>
        <Filter active={kind === "course"} onClick={() => setKind("course")}>Обучение</Filter>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Filter active={state === "all"} onClick={() => setState("all")}>Все состояния</Filter>
        <Filter active={state === "finished"} onClick={() => setState("finished")}>Завершённые</Filter>
        <Filter active={state === "unfinished"} onClick={() => setState("unfinished")}>Незавершённые</Filter>
      </div>
      <div className="mt-4 space-y-3">
        {visibleRows.map((s) => (
          <button
            key={s.id}
            className="glass flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
            onClick={() => nav(s.kind === "course" ? `/learn/${s.program_id}` : s.finished ? `/report/${s.session_id}` : `/play/${s.session_id}`)}
          >
            <div>
              <div className="font-medium">{s.kind === "course" ? "Курс: " : "Переговоры: "}{s.title}</div>
              <div className="text-xs text-slate-400">
                {s.subtitle} · {s.status}
              </div>
            </div>
            <div className="text-sm text-cyan-200">{s.verdict || (s.finished ? "Открыть" : "Продолжить")}</div>
          </button>
        ))}
        {!visibleRows.length && <p className="text-slate-400">В этой категории пока нет записей.</p>}
      </div>
    </div>
  );
}

function Filter({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm ${active ? "bg-cyan-400/20 text-cyan-100" : "bg-white/5 text-slate-400"}`}>{children}</button>;
}
