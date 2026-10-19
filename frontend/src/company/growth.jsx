import { useState } from "react";
import { api } from "../api.js";
import BusinessDateTimePicker from "../components/BusinessDateTimePicker.jsx";
import { useEffect, Empty, Notice, formatDate, StatusBadge } from "./shared.jsx";

const emptySchedule = { template_assignment_id: "", cadence: "WEEKLY", interval_count: 1, next_run_at: "", deadline_offset_days: 7, membership_ids: [] };

export function GrowthTools({ data }) {
  const id = data.company.id;
  const [packs, setPacks] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [people, setPeople] = useState([]);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    const results = await Promise.allSettled([
      api(`/api/company/${id}/industry-packs`),
      api(`/api/company/${id}/assignment-schedules`),
      api(`/api/company/${id}/assignments/catalog`),
      api(`/api/company/${id}/employees`),
    ]);
    const [packsResult, schedulesResult, catalogResult, peopleResult] = results;
    setPacks(packsResult.status === "fulfilled" ? packsResult.value : []);
    setSchedules(schedulesResult.status === "fulfilled" ? schedulesResult.value : []);
    setCatalog(catalogResult.status === "fulfilled" ? catalogResult.value : []);
    setPeople(peopleResult.status === "fulfilled" ? peopleResult.value.filter(person => person.status === "ACTIVE") : []);
    const requiredFailure = [schedulesResult, catalogResult, peopleResult].find(result => result.status === "rejected");
    if (requiredFailure) setError(requiredFailure.reason?.message || "Не удалось загрузить данные автоматизации.");
  }

  useEffect(() => { load(); }, [id]);

  async function run(action, success) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await action();
      setNote(success);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function createSchedule(event) {
    event.preventDefault();
    if (!schedule.template_assignment_id || !schedule.next_run_at || !schedule.membership_ids.length) {
      setError("Выберите задание, дату запуска и хотя бы одного получателя.");
      return;
    }
    await run(() => api(`/api/company/${id}/assignment-schedules`, {
      method: "POST",
      body: {
        ...schedule,
        template_assignment_id: Number(schedule.template_assignment_id),
        next_run_at: new Date(schedule.next_run_at).toISOString(),
        membership_ids: schedule.membership_ids.map(Number),
      },
    }), "Расписание создано.");
    setSchedule(emptySchedule);
  }

  const toggle = memberId => setSchedule(current => ({
    ...current,
    membership_ids: current.membership_ids.includes(memberId)
      ? current.membership_ids.filter(value => value !== memberId)
      : [...current.membership_ids, memberId],
  }));

  return <section className="business-management-page">
    {error && <Notice tone="red">{error}</Notice>}
    {note && <Notice>{note}</Notice>}
    <div className="business-management-card-grid">
      <article className="business-management-card">
        <h3>Отраслевые пакеты</h3>
        <p>Готовые подборки ситуаций для быстрого запуска обучения.</p>
        <div className="mt-4 grid gap-3">
          {packs.map(pack => <div className="business-management-subcard" key={pack.code}>
            <div className="business-card-heading"><strong>{pack.label}</strong><span className="business-management-note">{pack.situations?.length || 0} ситуаций</span></div>
            <p className="business-management-note mt-2">{pack.situations?.join(" · ")}</p>
            <button type="button" disabled={busy} className="subtle-button mt-3" onClick={() => run(() => api(`/api/company/${id}/industry-packs/${pack.code}/install`, { method: "POST" }), "Пакет установлен. Новые сценарии доступны в библиотеке.")}>Установить пакет</button>
          </div>)}
          {!packs.length && <Empty>Доступных пакетов пока нет.</Empty>}
        </div>
      </article>

      <article className="business-management-card business-recurring-assignments">
        <form onSubmit={createSchedule}>
          <h3>Повторяющееся назначение</h3>
          <p>Один раз настройте правило — система создаст задания сама.</p>
          <label className="block mt-4">Задание<select required value={schedule.template_assignment_id} onChange={event => setSchedule({ ...schedule, template_assignment_id: event.target.value })}><option value="">Выберите шаблон</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label>Период<select value={schedule.cadence} onChange={event => setSchedule({ ...schedule, cadence: event.target.value })}><option value="DAILY">Каждый день</option><option value="WEEKLY">Каждую неделю</option><option value="MONTHLY">Каждый месяц</option></select></label><BusinessDateTimePicker label="Первый запуск" required value={schedule.next_run_at} onChange={value => setSchedule({ ...schedule, next_run_at: value })} /></div>
          <label className="block mt-3">Срок выполнения, дней<input type="number" min="1" max="365" value={schedule.deadline_offset_days} onChange={event => setSchedule({ ...schedule, deadline_offset_days: Number(event.target.value) })} /></label>
          <fieldset className="mt-4"><legend>Получатели · {schedule.membership_ids.length}</legend><div className="business-choice-grid mt-2">{people.map(person => <label key={person.membership_id}><input type="checkbox" checked={schedule.membership_ids.includes(person.membership_id)} onChange={() => toggle(person.membership_id)} /><span>{person.name}<small>{person.job_title || "Должность не указана"}</small></span></label>)}</div>{!people.length && <p className="business-management-note mt-3">Активных сотрудников для назначения пока нет.</p>}</fieldset>
          <button disabled={busy || !schedule.membership_ids.length} className="primary-button mt-4">{busy ? "Создаём…" : "Создать расписание"}</button>
        </form>

        <section className="business-recurring-schedule-list" aria-labelledby="recurring-schedules-title">
          <div className="business-card-heading"><h4 id="recurring-schedules-title">Созданные правила</h4><span className="business-management-note">{schedules.length}</span></div>
          {schedules.length ? <div className="business-management-table-wrap">
            <table className="business-management-table">
              <thead><tr><th>Задание</th><th>Следующий запуск</th><th>Состояние</th><th aria-label="Действия" /></tr></thead>
              <tbody>{schedules.map(item => <tr key={item.id}>
                <td><b>{item.title || item.assignment_title || "Корпоративное задание"}</b><p>Запусков: {item.run_count || 0}</p></td>
                <td>{formatDate(item.next_run_at)}</td>
                <td><StatusBadge status={item.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED"} label={item.status === "ACTIVE" ? "Активно" : "Пауза"} /></td>
                <td><div className="flex flex-wrap gap-2">
                  <button type="button" className="subtle-button" disabled={busy || item.status !== "ACTIVE"} onClick={() => run(() => api(`/api/company/${id}/assignment-schedules/${item.id}/run`, { method: "POST" }), "Задание создано по расписанию.")}>Запустить</button>
                  <button type="button" className="subtle-button" disabled={busy} onClick={() => run(() => api(`/api/company/${id}/assignment-schedules/${item.id}`, { method: "PATCH", body: { status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE" } }), item.status === "ACTIVE" ? "Расписание приостановлено." : "Расписание возобновлено.")}>{item.status === "ACTIVE" ? "Пауза" : "Возобновить"}</button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="business-management-note">Правил пока нет.</p>}
        </section>
      </article>
    </div>
  </section>;
}
