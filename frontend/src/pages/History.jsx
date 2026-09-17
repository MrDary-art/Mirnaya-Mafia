import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function History() {
  const [rows, setRows] = useState([]);
  const nav = useNavigate();
  useEffect(() => {
    api("/api/sessions").then(setRows);
  }, []);
  return (
    <div>
      <h1 className="text-2xl font-bold">История (до 50)</h1>
      <div className="mt-4 space-y-3">
        {rows.map((s) => (
          <button
            key={s.id}
            className="glass flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
            onClick={() => nav(s.status === "finished" ? `/report/${s.id}` : `/play/${s.id}`)}
          >
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-slate-400">
                {s.role} vs {s.opponent_role} · {s.status}
              </div>
            </div>
            <div className="text-sm text-cyan-200">{s.verdict || "в процессе"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
