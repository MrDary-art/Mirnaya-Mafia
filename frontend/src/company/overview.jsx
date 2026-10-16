import { useState } from "react";
import { Calendar } from "./engagement.jsx";
import { api } from "../api.js";
import { useEffect, formatDate, Loader, Empty, Notice } from "./shared.jsx";

export function ManagerOverview({ data, setTab }) {
  const id = data.company.id;
  const [overview, setOverview] = useState(null), [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const results = await Promise.allSettled([
        api(`/api/company/${id}/analytics`),
        api(`/api/company/${id}/employees`),
        api(`/api/company/${id}/programs`),
        api(`/api/company/${id}/cohorts`),
        api(`/api/company/${id}/online-1x1`),
      ]);
      const [analyticsResult, employeesResult, programsResult, cohortsResult, meetingsResult] = results;
      if (analyticsResult.status === "rejected" || employeesResult.status === "rejected") {
        throw analyticsResult.reason || employeesResult.reason;
      }
      setOverview({
        analytics: analyticsResult.value,
        employees: employeesResult.value,
        programs: programsResult.status === "fulfilled" ? programsResult.value : [],
        cohorts: cohortsResult.status === "fulfilled" ? cohortsResult.value : [],
        meetings: meetingsResult.status === "fulfilled" ? meetingsResult.value : [],
      });
    } catch (cause) {
      setError(cause.message);
    }
  }

  useEffect(() => { setOverview(null); load(); }, [id]);
  if (!overview) return <Loader error={error} onRetry={load} />;

  const { analytics, employees, programs, cohorts, meetings } = overview;
  const activePeople = employees.filter((person) => person.status === "ACTIVE");
  const newPeople = activePeople.filter((person) => person.joined_at && Date.now() - new Date(person.joined_at).getTime() < 30 * 86400000).length;
  const activePrograms = programs.filter((program) => ["PUBLISHED", "ACTIVE"].includes(program.status));
  const nextMeetings = meetings
    .filter((meeting) => meeting.scheduled_at && new Date(meeting.scheduled_at).getTime() >= Date.now() && !["COMPLETED", "CANCELLED"].includes(meeting.status))
    .sort((first, second) => new Date(first.scheduled_at) - new Date(second.scheduled_at))
    .slice(0, 3);
  const completion = analytics.assigned ? Math.round((analytics.completed * 100) / analytics.assigned) : 0;
  const remaining = Math.max(0, (analytics.assigned || 0) - (analytics.completed || 0));
  const signals = [
    ["Активные сотрудники", activePeople.length, newPeople ? `+${newPeople} за месяц` : "Состав без изменений"],
    ["Программы", activePrograms.length, activePrograms.length ? "доступны команде" : "нужна публикация"],
    ["Учебные команды", cohorts.length, cohorts.length ? "сформированы" : "ещё не созданы"],
  ];

  return <div className="business-overview-page">
    {analytics.overdue > 0 && <Notice tone="red">Просрочено заданий: {analytics.overdue}. <button className="ml-2 underline underline-offset-4" onClick={() => setTab("assignments")}>Посмотреть задания</button></Notice>}

    <section className="business-overview-command">
      <div className="business-overview-primary">
        <div className="business-overview-primary-head">
          <div>
            <h2>Ход обучения команды</h2>
          </div>
          <strong className="business-overview-percent">{completion}%</strong>
        </div>
        <div className="business-progress-track" aria-label={`Завершено ${completion}% назначений`}>
          <span style={{ width: `${completion}%` }} />
        </div>
        <dl className="business-overview-progress">
          <div><dt>Назначено</dt><dd>{analytics.assigned}</dd></div>
          <div><dt>Завершено</dt><dd>{analytics.completed}</dd></div>
          <div><dt>Осталось</dt><dd>{remaining}</dd></div>
        </dl>
        <p className="business-overview-note">{analytics.data_note}</p>
        <div className="business-actions">
          <button className="primary-button" onClick={() => setTab("assignments")}>Назначить задание</button>
          {data.permissions.manage_learning && <button className="subtle-button" onClick={() => setTab("program-builder")}>Собрать программу</button>}
          <button className="subtle-button" onClick={() => setTab("analytics")}>Открыть аналитику</button>
        </div>
      </div>

      <dl className="business-overview-signals" aria-label="Состояние компании">
        {signals.map(([label, value, hint]) => <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          <small>{hint}</small>
        </div>)}
      </dl>
    </section>

    <div className="business-overview-columns">
      <section className="business-overview-feed">
        <div className="business-section-heading-row">
          <div><h2>Ближайшие встречи</h2><p>Запланированные разговоры 1×1</p></div>
          <button className="business-text-action" onClick={() => setTab("meetings")}>Все встречи <span aria-hidden="true">→</span></button>
        </div>
        <div className="business-list-stack">
          {nextMeetings.map((meeting) => <article key={meeting.id} className="business-list-row">
            <div><b>{meeting.title}</b><p>{formatDate(meeting.scheduled_at)}</p><small>{meeting.participants?.map((person) => person.name).join(" и ")}</small></div>
            {meeting.can_open && <a className="subtle-button" href={`${data.business_base || ""}/room/${meeting.room_id}`}>Открыть</a>}
          </article>)}
          {!nextMeetings.length && <Empty>Встреч пока нет. Запланируйте разговор с сотрудником, когда он будет нужен.</Empty>}
        </div>
      </section>

      <section className="business-overview-feed">
        <div className="business-section-heading-row">
          <div><h2>Последние события</h2><p>Что изменилось в рабочем пространстве</p></div>
        </div>
        <div className="business-list-stack">
          {data.inbox?.slice(0, 5).map((item) => <article key={item.id} className="business-list-row">
            <div><b>{item.title}</b><p>{item.text}</p></div>
          </article>)}
          {!data.inbox?.length && <Empty>Новых событий пока нет.</Empty>}
        </div>
      </section>
    </div>

    <Calendar data={data} />
  </div>;
}
