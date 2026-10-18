import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import { Calendar } from "./engagement.jsx";
import { buildPersonalPlan, planEventPath } from "./personal-plan.js";
import { widgetLabels, moveWidget } from "./workspace-navigation.js";
import { formatDate, Loader, Notice, Empty } from "./shared.jsx";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import "./workspace-redesign.css";

export default function Dashboard({ data, start }) {
  const { user } = useAuth(), base = `/business/${data.company.id}`, apiBase = `/api/company/${data.company.id}`;
  const [settings, setSettings] = useState(null), [draft, setDraft] = useState([]), [editing, setEditing] = useState(false);
  const [events, setEvents] = useState([]), [company, setCompany] = useState(null), [attempts, setAttempts] = useState([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  async function load() {
    setError("");
    try { const value = await api(`${apiBase}/workspace-preferences`); setSettings(value); setDraft(value.widgets); }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { let alive = true; setSettings(null); load();
    const requests = [api(`${apiBase}/calendar?personal=true`), api(`${apiBase}/attempts?membership_id=${data.membership.id}`), data.permissions.view_analytics ? api(`${apiBase}/analytics`) : Promise.resolve(null)];
    Promise.allSettled(requests).then(results => { if (!alive) return; if (results[0].status === "fulfilled") setEvents(results[0].value); if (results[1].status === "fulfilled") setAttempts(results[1].value); if (results[2].status === "fulfilled") setCompany(results[2].value); const failed = results.find(result => result.status === "rejected"); if (failed) setError(failed.reason.message); });
    return () => { alive = false; };
  }, [apiBase, data.membership.id, revision]);
  async function save(widgets) {
    setBusy(true); setError("");
    try { const value = await api(`${apiBase}/workspace-preferences`, { method: "PUT", body: { widgets } }); setSettings(value); setDraft(value.widgets); setEditing(false); setMessage("Главная сохранена для вашего аккаунта в этой компании."); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  const plan = buildPersonalPlan(data.assignments || [], events, Date.now(), data.membership.id);
  const completed = (data.assignments || []).filter(item => ["COMPLETED", "PASSED", "FAILED"].includes(item.status)).length;
  const passed = (data.assignments || []).filter(item => ["COMPLETED", "PASSED"].includes(item.status)).length;
  const render = key => {
    if (key === "plan") return <><p>Ваши задания, встречи и поручения в порядке сроков.</p><div className="dashboard-plan">{plan.slice(0, 6).map(item => <div key={item.id}><div><b>{item.title}</b><small>{item.kind} · {item.date ? formatDate(item.date) : "Без срока"}{item.retry ? " · Нужна повторная попытка" : item.status === "OVERDUE" || item.overdue ? " · Просрочено" : ""}</small></div>{item.targetId && item.startable ? <button className="subtle-button" onClick={() => start(item.assignmentId)}>{item.retry ? "Повторить" : "Начать"}</button> : <Link className="subtle-button" to={planEventPath(data.company.id, item)}>Открыть</Link>}</div>)}{!plan.length && <Empty>Назначенные вам задачи и приглашения появятся здесь. Чужие задания в личный план не попадают.</Empty>}</div><Link to={`${base}/calendar?personal=true`}>Открыть мой календарь →</Link></>;
    if (key === "calendar") return <Calendar data={data} compact/>;
    if (key === "company") return <><p>Корпоративные результаты в вашей области доступа. Личные результаты показаны отдельным блоком.</p><dl className="dashboard-metrics">{[["Сотрудников", data.summary?.employees], ["Назначений", company?.assigned], ["Завершено", company?.completed], ["Просрочено", company?.overdue]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl><div className="profile-results-actions"><Link className="primary-button" to={`${base}/learning?view=manage`}>Управлять обучением</Link><Link className="subtle-button" to={`${base}/settings?setting=profile`}>Настройки компании</Link></div></>;
    if (key === "practice") return <><p>Выполняйте личные назначения в обучении. Свободная практика не заменяет назначенное задание.</p><div className="profile-results-actions"><Link className="primary-button" to={`${base}/learning?view=mine`}>Мои задания</Link><Link className="subtle-button" to={`${base}/learning/scenarios`}>Практика по сценариям</Link>{data.company.settings?.modes?.ai_enabled && <Link className="subtle-button" to={`${base}/learning/ai`}>Диалог с ИИ</Link>}</div></>;
    if (key === "progress") return <><dl className="dashboard-metrics"><div><dt>Завершено</dt><dd>{completed} / {data.assignments?.length || 0}</dd></div><div><dt>Успешно пройдено</dt><dd>{passed}</dd></div><div><dt>Попыток</dt><dd>{attempts.length}</dd></div></dl><p>Завершение учитывает и неуспешные попытки. Успешность показана отдельно.</p><Link to={`${base}/profile?view=analytics`}>Мои результаты →</Link></>;
    if (key === "colleagues") return <><p>Найдите коллегу, посмотрите структуру и начните разговор из карточки сотрудника.</p><Link className="subtle-button" to={`${base}/team`}>Открыть команду</Link></>;
    return <ProfileWall companyId={data.company.id} canPublish={false}/>;
  };
  return <section className="workspace-dashboard"><header className="workspace-page-heading"><div><span className="business-eyebrow">МОЁ РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>Здравствуйте, {user?.display_name || user?.username}</h2><p>Соберите главную из нужных вам блоков. Настройка не меняет главную коллег.</p></div><button className="primary-button" disabled={!settings || editing} onClick={() => { setDraft(settings.widgets); setEditing(true); }}>Настроить главную</button></header>
    {error && <Notice tone="red">{error}<button className="subtle-button" onClick={() => setRevision(value => value + 1)}>Повторить загрузку</button></Notice>}{message && <Notice>{message}</Notice>}
    {editing && <section className="dashboard-editor" aria-label="Настройка главной"><h3>Блоки и порядок</h3><p>Добавляйте блоки галочками. Порядок изменяется кнопками вверх и вниз.</p>{draft.map((key, index) => <div className="dashboard-editor-row" key={key}><b>{index + 1}. {widgetLabels[key]}</b><button type="button" className="subtle-button" disabled={index === 0 || busy} aria-label={`Выше: ${widgetLabels[key]}`} onClick={() => setDraft(moveWidget(draft, key, -1))}>↑</button><button type="button" className="subtle-button" disabled={index === draft.length - 1 || busy} aria-label={`Ниже: ${widgetLabels[key]}`} onClick={() => setDraft(moveWidget(draft, key, 1))}>↓</button></div>)}<fieldset><legend>Показывать на главной</legend>{settings.available.map(key => <label key={key}><input type="checkbox" checked={draft.includes(key)} onChange={event => setDraft(event.target.checked ? [...draft, key] : draft.filter(value => value !== key))}/>{widgetLabels[key]}</label>)}</fieldset><div className="profile-results-actions"><button className="primary-button" disabled={busy} onClick={() => save(draft)}>{busy ? "Сохраняем…" : "Сохранить главную"}</button><button className="subtle-button" disabled={busy} onClick={() => setDraft(settings.defaults)}>Стандартный набор</button><button className="subtle-button" disabled={busy} onClick={() => setEditing(false)}>Отмена</button></div></section>}
    {!settings ? !error && <Loader/> : <div className="dashboard-blocks">{settings.widgets.map(key => <article className={`dashboard-block dashboard-block--${key}`} key={key}><h3>{widgetLabels[key]}</h3>{render(key)}</article>)}{!settings.widgets.length && <Empty>Главная пока пустая. Нажмите «Настроить главную», чтобы добавить блоки.</Empty>}</div>}
  </section>;
}
