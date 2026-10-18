import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { AssignmentCard } from "./learning.jsx";
import { AttemptReport } from "./attempt-report.jsx";
import { Loader, Notice } from "./shared.jsx";

export default function AssignmentFocus({ data, start }) {
  const [params, setParams] = useSearchParams();
  const assignment = params.get("assignment"), target = params.get("target"), attempt = params.get("attempt");
  const [rows, setRows] = useState(null), [error, setError] = useState("");
  const manager = Boolean(data.permissions?.manage_assignments || data.permissions?.manage_team);
  useEffect(() => { let alive = true; setRows(null); setError("");
    if (!assignment && !target) return () => { alive = false; };
    api(`/api/company/${data.company.id}/assignments`).then(value => { if (alive) setRows(value); }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [assignment, target, data.company.id]);
  if (!assignment && !target && !attempt) return null;
  const items = rows?.filter(item => target ? String(item.target_id) === target : String(item.id) === assignment) || [];
  const close = () => setParams(current => { const next = new URLSearchParams(current); for (const key of ["assignment", "target", "attempt"]) next.delete(key); return next; });
  return <section className="workspace-focus"><header><h2>{attempt ? "Результат выбранной попытки" : "Выбранное назначение"}</h2><button className="subtle-button" onClick={close}>Вернуться к списку</button></header>{error && <Notice tone="red">{error}</Notice>}{attempt ? <AttemptReport key={attempt} data={data} attempt={{ id: Number(attempt) }} initiallyOpen/> : rows ? items.length ? items.map(item => <AssignmentCard key={item.target_id || item.id} item={item} data={data} start={start} manager={manager && item.membership_id !== data.membership.id}/>) : <Notice>Назначение не найдено или недоступно вашему аккаунту.</Notice> : !error && <Loader/>}</section>;
}
