import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const KIND_LABELS = { negotiation: "Переговоры", course: "Курсы", training: "Тренировка" };

export default function History() {
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState("all");
  const [state, setState] = useState("all");
  const nav = useNavigate();

  useEffect(() => { api("/api/history").then(setRows).catch((error) => alert(error.message)); }, []);

  const visibleRows = rows.filter((row) => (kind === "all" || row.kind === kind) && (state === "all" || (state === "finished" ? row.finished : !row.finished)));
  function open(row) {
    if (row.kind === "course") return nav(`/learn/${row.program_id}`);
    if (row.kind === "training") return nav(row.finished ? `/training/path/attempt/${row.attempt_id}/report` : row.status === "В процессе" ? `/training/path/attempt/${row.attempt_id}` : `/training/path/level/${row.level_id}`);
    return nav(row.finished ? `/report/${row.session_id}` : `/play/${row.session_id}`);
  }

  return <section>
    <div className="eyebrow">МОЯ АКТИВНОСТЬ</div>
    <h1 className="mt-1 text-2xl font-bold">История обучения и переговоров</h1>
    <p className="mt-2 text-sm text-slate-400">Здесь сохраняются все переговоры, курсы и попытки в тренировке.</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <Filter active={kind === "all"} onClick={() => setKind("all")}>Все</Filter>
      <Filter active={kind === "negotiation"} onClick={() => setKind("negotiation")}>Переговоры</Filter>
      <Filter active={kind === "course"} onClick={() => setKind("course")}>Курсы</Filter>
      <Filter active={kind === "training"} onClick={() => setKind("training")}>Тренировка</Filter>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Filter active={state === "all"} onClick={() => setState("all")}>Все состояния</Filter>
      <Filter active={state === "finished"} onClick={() => setState("finished")}>Завершённые</Filter>
      <Filter active={state === "unfinished"} onClick={() => setState("unfinished")}>Незавершённые</Filter>
    </div>
    <div className="mt-4 space-y-3">
      {visibleRows.map((row) => <button key={row.id} className="glass flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left" onClick={() => open(row)}>
        <div><div className="font-medium">{KIND_LABELS[row.kind] || "Активность"}: {row.title}</div><div className="text-xs text-slate-400">{row.subtitle} · {row.status}</div></div>
        <div className="text-sm text-cyan-200">{row.verdict || (row.finished ? "Открыть" : row.status === "В процессе" ? "Продолжить" : "Открыть")}</div>
      </button>)}
      {!visibleRows.length && <p className="text-slate-400">В этой категории пока нет записей.</p>}
    </div>
  </section>;
}

function Filter({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm ${active ? "bg-cyan-400/20 text-cyan-100" : "bg-white/5 text-slate-400"}`}>{children}</button>;
}
