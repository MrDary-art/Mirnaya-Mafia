import { useState } from "react";
import { api } from "../api.js";
import { AttemptReport } from "./attempt-report.jsx";
import { Notice, Loader, formatDate } from "./shared.jsx";

export default function AssignmentReports({ data, item }) {
  const [opened, setOpened] = useState(false), [attempts, setAttempts] = useState(null), [error, setError] = useState("");
  async function open() {
    if (opened) { setOpened(false); return; }
    setOpened(true); setError("");
    if (attempts?.length) return;
    setAttempts(null);
    try {
      const rows = await api(`/api/company/${data.company.id}/attempts?limit=500&membership_id=${item.membership_id || data.membership.id}`);
      setAttempts(rows.filter(row => row.assignment_id === item.id && row.status === "COMPLETED"));
    } catch (cause) { setError(cause.message); }
  }
  return <div className="assignment-reports"><button type="button" className="subtle-button" aria-expanded={opened} onClick={open}>{opened ? "Скрыть отчёт" : "Посмотреть отчёт"}</button>{opened && <div className="mt-4 space-y-3">{error && <Notice tone="red">{error}</Notice>}{!attempts && !error && <Loader />}{attempts?.map(attempt => <section key={attempt.id}><p>{formatDate(attempt.completed_at)}</p><AttemptReport data={data} attempt={attempt} initiallyOpen /></section>)}{attempts?.length === 0 && <Notice>Отчёт ещё формируется. Закройте блок и откройте снова через несколько секунд.</Notice>}</div>}</div>;
}
