import { useState } from "react";
import { api } from "../api.js";
import { useEffect, Empty, Notice, formatDate, ManagementSummary, StatusBadge } from "./shared.jsx";

const emptySchedule = { template_assignment_id: "", cadence: "WEEKLY", interval_count: 1, next_run_at: "", deadline_offset_days: 7, membership_ids: [] };

export function GrowthTools({ data, section = "schedules" }) {
  const id = data.company.id;
  const [packs, setPacks] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [people, setPeople] = useState([]);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [league, setLeague] = useState({ title: "", season: String(new Date().getFullYear()), description: "", min_sample_size: 5 });
  const [standings, setStandings] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    const results = await Promise.allSettled([
      api(`/api/company/${id}/industry-packs`),
      api(`/api/company/${id}/assignment-schedules`),
      api(`/api/company/${id}/leagues`),
      api(`/api/company/${id}/assignments/catalog`),
      api(`/api/company/${id}/employees`),
    ]);
    const [packsResult, schedulesResult, leaguesResult, catalogResult, peopleResult] = results;
    setPacks(packsResult.status === "fulfilled" ? packsResult.value : []);
    setSchedules(schedulesResult.status === "fulfilled" ? schedulesResult.value : []);
    setLeagues(leaguesResult.status === "fulfilled" ? leaguesResult.value : []);
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

  async function createLeague(event) {
    event.preventDefault();
    await run(() => api(`/api/company/${id}/leagues`, { method: "POST", body: league }), "Сезон лиги создан.");
    setLeague({ title: "", season: String(new Date().getFullYear()), description: "", min_sample_size: 5 });
  }

  async function showStandings(item) {
    setError("");
    try {
      setStandings(await api(`/api/company/${id}/leagues/${item.id}/standings`));
    } catch (cause) {
      setError(cause.message);
    }
  }

  const toggle = memberId => setSchedule(current => ({ ...current, membership_ids: current.membership_ids.includes(memberId) ? current.membership_ids.filter(value => value !== memberId) : [...current.membership_ids, memberId] }));
  const activeSchedules = schedules.filter(item => item.status === "ACTIVE").length;
  const participatingLeagues = leagues.filter(item => item.joined && item.own_status !== "WITHDRAWN").length;
  return <section className="business-management-page">
    <ManagementSummary description={section === "schedules" ? "Повторяющиеся назначения и сроки выдачи." : section === "packs" ? "Готовые отраслевые подборки для библиотеки компании." : "Сезоны лиг и межкорпоративные турниры."} stats={[]}/>
    {error && <Notice tone="red">{error}</Notice>}{note && <Notice>{note}</Notice>}
    <div className="business-management-card-grid">
      {section === "packs" && <article className="business-management-card"><h3>Отраслевые пакеты</h3><p>Готовые подборки ситуаций для быстрого запуска обучения.</p><div className="mt-4 grid gap-3">{packs.map(pack => <div className="business-management-subcard" key={pack.code}><div className="business-card-heading"><strong>{pack.label}</strong><span className="business-management-note">{pack.situations?.length || 0} ситуаций</span></div><p className="business-management-note mt-2">{pack.situations?.join(" · ")}</p><button type="button" disabled={busy} className="subtle-button mt-3" onClick={() => run(() => api(`/api/company/${id}/industry-packs/${pack.code}/install`, { method: "POST" }), "Пакет установлен. Новые сценарии доступны в библиотеке.")}>Установить пакет</button></div>)}{!packs.length && <Empty>Доступных пакетов пока нет.</Empty>}</div></article>}
      {section === "schedules" && <form className="business-management-card" onSubmit={createSchedule}><h3>Повторяющееся назначение</h3><p>Один раз настройте правило — система создаст задания сама.</p><label className="block mt-4">Задание<select required value={schedule.template_assignment_id} onChange={event => setSchedule({ ...schedule, template_assignment_id: event.target.value })}><option value="">Выберите шаблон</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label>Период<select value={schedule.cadence} onChange={event => setSchedule({ ...schedule, cadence: event.target.value })}><option value="DAILY">Каждый день</option><option value="WEEKLY">Каждую неделю</option><option value="MONTHLY">Каждый месяц</option></select></label><label>Первый запуск<input required type="datetime-local" value={schedule.next_run_at} onChange={event => setSchedule({ ...schedule, next_run_at: event.target.value })} /></label></div><label className="block mt-3">Срок выполнения, дней<input type="number" min="1" max="365" value={schedule.deadline_offset_days} onChange={event => setSchedule({ ...schedule, deadline_offset_days: Number(event.target.value) })} /></label><fieldset className="mt-4"><legend>Получатели · {schedule.membership_ids.length}</legend><div className="business-choice-grid mt-2">{people.map(person => <label key={person.membership_id}><input type="checkbox" checked={schedule.membership_ids.includes(person.membership_id)} onChange={() => toggle(person.membership_id)} /><span>{person.name}<small>{person.job_title || "Должность не указана"}</small></span></label>)}</div>{!people.length && <p className="business-management-note mt-3">Активных сотрудников для назначения пока нет.</p>}</fieldset><button disabled={busy || !schedule.membership_ids.length} className="primary-button mt-4">{busy ? "Создаём…" : "Создать расписание"}</button></form>}
    </div>
    {section === "schedules" && <section className="business-management-card"><div className="business-card-heading"><div><span className="business-management-eyebrow">РАСПИСАНИЯ</span><h3>Активные назначения</h3></div><span className="business-management-note">{schedules.length} правил</span></div>{schedules.length ? <div className="business-management-table-wrap mt-4"><table className="business-management-table"><thead><tr><th>Задание</th><th>Следующий запуск</th><th>Состояние</th><th aria-label="Действия" /></tr></thead><tbody>{schedules.map(item => <tr key={item.id}><td><b>{item.title || item.assignment_title || "Корпоративное задание"}</b><p>Запусков: {item.run_count || 0}</p></td><td>{formatDate(item.next_run_at)}</td><td><StatusBadge status={item.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED"} label={item.status === "ACTIVE" ? "Активно" : "Пауза"} /></td><td><div className="flex flex-wrap gap-2"><button type="button" className="subtle-button" disabled={busy || item.status !== "ACTIVE"} onClick={() => run(() => api(`/api/company/${id}/assignment-schedules/${item.id}/run`, { method: "POST" }), "Задание создано по расписанию.")}>Запустить</button><button type="button" className="subtle-button" disabled={busy} onClick={() => run(() => api(`/api/company/${id}/assignment-schedules/${item.id}`, { method: "PATCH", body: { status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE" } }), item.status === "ACTIVE" ? "Расписание приостановлено." : "Расписание возобновлено.")}>{item.status === "ACTIVE" ? "Пауза" : "Возобновить"}</button></div></td></tr>)}</tbody></table></div> : <Empty>Расписаний пока нет. Создайте первое правило выше.</Empty>}</section>}
    <div className="business-management-card-grid">
      {section === "leagues" && data.membership.role === "COMPANY_OWNER" && <form className="business-management-card" onSubmit={createLeague}><h3>Новый сезон лиги</h3><p>Создайте сезон с заранее понятными сроками и безопасной минимальной выборкой.</p><label className="block mt-4">Название<input required value={league.title} onChange={event => setLeague({ ...league, title: event.target.value })} /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label>Сезон<input required value={league.season} onChange={event => setLeague({ ...league, season: event.target.value })} /></label><label>Минимальная выборка<input type="number" min="3" value={league.min_sample_size} onChange={event => setLeague({ ...league, min_sample_size: Number(event.target.value) })} /></label></div><label className="block mt-3">Описание<textarea rows="3" value={league.description} onChange={event => setLeague({ ...league, description: event.target.value })} /></label><button disabled={busy} className="primary-button mt-4">{busy ? "Создаём…" : "Создать сезон"}</button></form>}
      {section === "leagues" && <section className="business-management-card"><h3>Открытые сезоны</h3><p>Компания сама решает, участвовать ли в публикации агрегированной статистики.</p><div className="mt-4 grid gap-3">{leagues.map(item => <article className="business-management-subcard" key={item.id}><div className="business-card-heading"><strong>{item.title} · {item.season}</strong><StatusBadge status={item.joined ? "ACTIVE" : "INCOMPLETE"} label={item.joined ? item.own_status || "Участвуете" : "Не участвуете"} /></div><p className="business-management-note mt-2">Минимальная выборка: {item.min_sample_size} сотрудников.</p><div className="business-management-actions"><button type="button" className="subtle-button" onClick={() => showStandings(item)}>Открыть таблицу</button>{!item.joined && data.membership.role === "COMPANY_OWNER" && <button type="button" className="subtle-button" disabled={busy} onClick={() => run(() => api(`/api/company/${id}/leagues/${item.id}/join`, { method: "POST", body: { public_name: data.company.short_name || data.company.name, publish_logo: false } }), "Компания присоединилась к лиге.")}>Присоединиться</button>}{item.joined && item.own_status !== "WITHDRAWN" && data.membership.role === "COMPANY_OWNER" && <button type="button" className="subtle-button" disabled={busy} onClick={() => run(() => api(`/api/company/${id}/leagues/${item.id}/membership`, { method: "DELETE" }), "Участие компании отозвано.")}>Отозвать участие</button>}</div></article>)}{!leagues.length && <Empty>Открытых сезонов пока нет.</Empty>}</div></section>}
    </div>
    {section === "leagues" && standings && <section className="business-management-card"><div className="business-card-heading"><div><span className="business-management-eyebrow">ТАБЛИЦА СЕЗОНА</span><h3>{standings.league.title}</h3></div><button type="button" className="subtle-button" onClick={() => setStandings(null)}>Закрыть</button></div><p className="business-management-note mt-2">{standings.privacy}</p>{standings.standings?.length ? <ol className="business-rank-list mt-4">{standings.standings.map(item => <li key={item.id}><span><b>{item.place}.</b> {item.name}</span><strong>{item.score} / 100 · {item.sample_size} чел.</strong>{standings.can_moderate && <button type="button" className="subtle-button" disabled={busy} onClick={() => run(() => api(`/api/company/${id}/leagues/${standings.league.id}/entries/${item.id}`, { method: "PATCH", body: { status: "SUSPENDED" } }), "Участник скрыт модератором.")}>Скрыть</button>}</li>)}</ol> : <Empty>Таблица откроется после формирования безопасной выборки.</Empty>}</section>}
  </section>;
}