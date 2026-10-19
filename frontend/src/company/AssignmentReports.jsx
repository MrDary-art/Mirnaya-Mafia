import { useState } from "react";
import { api } from "../api.js";
import { AttemptReport } from "./attempt-report.jsx";
import { Notice, Loader, formatDate } from "./shared.jsx";

export default function AssignmentReports({ data, item, onToggle }) {
  const [opened, setOpened] = useState(false), [attempts, setAttempts] = useState(null), [error, setError] = useState("");
  async function open() {
    if (opened) { setOpened(false); onToggle?.(false); return; }
    setOpened(true); onToggle?.(true); setError("");
    if (attempts?.length) return;
    setAttempts(null);
    try {
      const rows = await api(`/api/company/${data.company.id}/attempts?limit=500&membership_id=${item.membership_id || data.membership.id}`);
      setAttempts(rows.filter(row => row.assignment_id === item.id && row.status === "COMPLETED"));
    } catch (cause) { setError(cause.message); }
  }
  return <section className="assignment-reports">
    <button type="button" className="subtle-button" aria-expanded={opened} onClick={open}>{opened ? "Скрыть отчёт" : "Показать отчёт"}</button>
    {opened && <div className="assignment-report-history" aria-live="polite">
      {error && <Notice tone="red">{error}</Notice>}
      {!attempts && !error && <Loader />}
      {attempts?.map(attempt => <article className="assignment-report-attempt" key={attempt.id}>
        <time dateTime={attempt.completed_at}>{formatDate(attempt.completed_at)}</time>
        <AttemptReport data={data} attempt={attempt} initiallyOpen hideToggle />
      </article>)}
      {attempts?.length === 0 && <Notice>Отчёт ещё формируется. Закройте блок и откройте снова через несколько секунд.</Notice>}
    </div>}
  </section>;
}
