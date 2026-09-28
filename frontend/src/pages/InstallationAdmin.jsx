import PageHeader from "../design/PageHeader.jsx";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Admin from "./Admin.jsx";
import AdminRoomReports from "../components/AdminRoomReports.jsx";
import AdminSpeechTest from "../components/AdminSpeechTest.jsx";
import AdminModelDownloads from "../components/AdminModelDownloads.jsx";
import ReportDocument from "../components/ReportDocument.jsx";
import "./installation-admin.css";

const labels = { registered: "Пользователей", new: "Новых за период", active: "Начали тренировку", started: "Тренировок", finished: "Завершено", rooms: "Встреч 1×1" };
const modeLabels = { online: "Диалог с ИИ", scenario: "Готовый сценарий" };

export default function InstallationAdmin() {
  const { user, ready, logout, login } = useAuth();
  const [section, setSection] = useState("analytics");
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("30");
  const [dates, setDates] = useState({ start: "", end: "" });
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [sort, setSort] = useState("newest");
  const [audit, setAudit] = useState(null);
  const [mode, setMode] = useState("");
  const [userId, setUserId] = useState("");
  const [report, setReport] = useState(null);
  const [ai, setAi] = useState({ key: "", scope: "GIGACHAT_API_PERS", model: "GigaChat-3-Ultra" });
  const [speech, setSpeech] = useState({ policy: "local", model: "tiny" });
  const [enrollment, setEnrollment] = useState(null);
  const [workerName, setWorkerName] = useState("Внешний Whisper");
  const [passwords, setPasswords] = useState({ current: "", password: "", confirm: "" });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  function query() {
    const p = new URLSearchParams({ page, q });
    p.set("sort", sort);
    if (companyId) p.set("company_id", companyId);
    if (mode) p.set("mode", mode);
    if (userId) p.set("user_id", userId);
    if (period === "custom") {
      if (dates.start) p.set("start", dates.start);
      if (dates.end) p.set("end", dates.end);
    } else {
      const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
      today.setDate(today.getDate() - Number(period) + 1);
      p.set("start", `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    }
    return p.toString();
  }
  useEffect(() => {
    if (user?.is_admin && !user.must_change_password) api("/api/admin/analytics/companies").then(setCompanies).catch(e => setError(e.message));
  }, [user?.is_admin, user?.must_change_password]);
  useEffect(() => {
    if (!user?.is_admin || user.must_change_password) return;
    let active = true;
    setError(""); setData(null);
    const promise = section === "settings" ? Promise.all([api("/api/admin/installation"), api("/api/admin/stt/workers")]) : api(`/api/admin/analytics/${tab}?${query()}`);
    promise.then(value => {
      if (!active) return;
      if (section === "settings") {
        setCfg(value[0]); setWorkers(value[1]); setAi(old => ({ ...old, key: "", scope: value[0].scope, model: value[0].model }));
        setSpeech({ policy: value[0].stt_policy, model: value[0].stt_model });
      } else setData(value);
    }).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [user?.is_admin, user?.must_change_password, section, tab, page, q, mode, period, dates, refresh, userId, companyId, sort]);

  async function action(work) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function changePassword(e) {
    e.preventDefault();
    await action(async () => {
      if (passwords.password !== passwords.confirm) throw new Error("Пароли не совпадают");
      const result = await api("/api/auth/password", { method: "POST", body: { current: passwords.current, password: passwords.password } });
      login(result); setPasswords({ current: "", password: "", confirm: "" }); setShowPasswordForm(false); setMessage("Пароль изменён. Старые сеансы входа завершены.");
    });
  }
  if (!ready) return <p role="status">Загрузка…</p>;
  if (!user) return <Navigate to="/login?next=%2Fadmin" replace />;
  if (!user.is_admin) return <Navigate to="/app" replace />;
  return <div className="installation-admin">
    <PageHeader eyebrow="Арена переговоров" title="Управление сайтом" description="Пользователи, активность и настройки установки." aside={<div className="ia-header-actions"><button onClick={() => setShowPasswordForm(!showPasswordForm)}>Сменить пароль</button><button onClick={() => { logout(); window.location.replace("/"); }}>Выйти</button></div>} />
    <nav aria-label="Разделы администратора">{[["analytics", "Пользователи и аналитика"], ["settings", "Настройки"]].map(([id, label]) => <button aria-current={section === id ? "page" : undefined} key={id} onClick={() => { setSection(id); setReport(null); }}>{label}</button>)}</nav>
    {error && <p role="alert" className="ia-error">{error} <button onClick={() => setRefresh(n => n + 1)}>Повторить</button></p>}
    {message && <p role="status" className="ia-notice">{message}</p>}
    {(showPasswordForm || user.must_change_password) && <form className="ia-panel" onSubmit={changePassword}><h2>{user.must_change_password ? "Замените стандартный пароль" : "Новый пароль"}</h2>{["current", "password", "confirm"].map((key, i) => <label key={key}>{["Текущий пароль", "Новый пароль — от 12 символов", "Повторите новый пароль"][i]}<input type="password" autoComplete={i === 0 ? "current-password" : "new-password"} required minLength={i ? 12 : 1} value={passwords[key]} onChange={e => setPasswords({ ...passwords, [key]: e.target.value })} /></label>)}<button disabled={busy}>Изменить пароль</button></form>}
    {!user.must_change_password && section === "analytics" && <>
      <div className="ia-toolbar"><div>{[["overview", "Обзор"], ["users", "Пользователи"], ["sessions", "Сессии и отчёты"]].map(([id, title]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setPage(1); setReport(null); }}>{title}</button>)}</div><label>Период · МСК<select value={period} onChange={e => { setPeriod(e.target.value); setPage(1); }}><option value="1">Сегодня</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="custom">Выбрать даты</option></select></label><label>Режим<select value={mode} onChange={e => { setMode(e.target.value); setPage(1); }}><option value="">Все</option><option value="online">Диалог с ИИ</option><option value="scenario">Сценарии</option></select></label>{companies.length > 0 && <label>Организация<select value={companyId} onChange={e => { setCompanyId(e.target.value); setPage(1); }}><option value="">Все</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}{period === "custom" && Object.keys(dates).map(key => <label key={key}>{key === "start" ? "С" : "По"}<input type="date" value={dates[key]} onChange={e => { setDates({ ...dates, [key]: e.target.value }); setPage(1); }} /></label>)}</div>
      {tab === "sessions" && <AdminRoomReports query={query()} />}
      {report ? <section className="ia-panel"><button onClick={() => setReport(null)}>← К списку</button><h2>Сохранённый разбор #{report.id}</h2>{report.report ? <ReportDocument report={report.report} sessionMeta={report} onReturn={() => setReport(null)} /> : <div><p>Отчёт: {{error:"Ошибка анализа",pending:"Готовится",not_requested:"Не запрошен"}[report.report_status] || report.status}</p>{report.report_status === "error" && <button disabled={busy} onClick={() => action(async () => { await api(`/api/admin/analytics/sessions/${report.id}/retry`, { method: "POST" }); setReport(await api(`/api/admin/analytics/sessions/${report.id}`)); setMessage("Разговор сохранён. Повторный анализ поставлен в очередь."); })}>Повторить анализ</button>}<button disabled={busy} onClick={() => action(async () => setReport(await api(`/api/admin/analytics/sessions/${report.id}`)))}>Обновить статус</button></div>}<details><summary>Переписка</summary>{report.messages.map((m, i) => <p key={i}><b>{m.sender === "user" ? "Участник" : "Собеседник"}:</b> {m.text}</p>)}</details></section> : !data ? <p role="status">{error ? "Данные не загружены" : "Загружаем данные…"}</p> : tab === "overview" ? <>
        <div className="ia-stats">{Object.entries(labels).map(([key, label]) => <article key={key}><span>{label}</span><strong>{data[key] ?? "Нет данных"}</strong></article>)}</div>
        <div className="ia-columns"><section className="ia-panel"><h2>Активность по дням</h2>{Object.entries(data.daily).length ? Object.entries(data.daily).sort().map(([day, count]) => <div className="ia-bar" key={day}><span>{day}</span><meter min="0" max={Math.max(...Object.values(data.daily), 1)} value={count} /><b>{count}</b></div>) : <p>За этот период тренировок нет.</p>}</section><section className="ia-panel"><h2>Режимы и отчёты</h2><p>Остановлены или завершены с ошибкой: {data.stopped}</p>{Object.entries(data.modes).map(([key, count]) => <p key={key}>{modeLabels[key] || key}: <b>{count}</b> начато · {data.finished_modes[key] || 0} завершено</p>)}{Object.entries(data.reports).map(([key, count]) => <p key={key}>{{ ready: "Готовы", pending: "Готовятся", error: "Ошибка анализа", not_requested: "Разбор не запрошен" }[key]}: <b>{count}</b></p>)}</section></div>
        <section className="ia-panel"><h2>Распознавание речи</h2><p>Записей: {data.technical.stt_jobs} · Ошибок: {data.technical.stt_failed} · Среднее время: {data.technical.stt_mean_seconds == null ? "нет измерений" : `${data.technical.stt_mean_seconds.toFixed(1)} с`} ({data.technical.stt_sample} измерений)</p><p>В очереди за выбранный период: {data.technical.stt_queue} · Переходов с внешнего на локальный Whisper: {data.technical.stt_fallback}. {data.technical.measured_since ? `Первое измерение: ${new Date(data.technical.measured_since * 1000).toLocaleDateString("ru")}` : "Измерений пока нет."}</p><p>Расход токенов и задержка GigaChat: нет измерений.</p><details><summary>Как считаются показатели</summary>{Object.values(data.definitions).map(text => <p key={text}>{text}</p>)}</details></section>
      </> : <section className="ia-panel">{tab === "users" && <label>Найти по имени или логину<input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></label>}{tab === "users" && <label>Порядок<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{[["newest","Новые сначала"],["name","По логину"],["activity","По последней тренировке"],["completed","По завершённым тренировкам"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>}{userId && <button onClick={() => setUserId("")}>Все пользователи</button>}{userId && <p>Показатели каждой попытки сохранены отдельно. Сравнивайте одинаковые сценарии и версии методики; эти значения не оценивают личность человека.</p>}<div className="ia-table"><table><thead><tr>{(tab === "users" ? ["Пользователь", "Регистрация", "Последняя тренировка за период", "Завершено / отчёты", "Режимы", "История"] : ["Сессия", "Пользователь", "Режим", "Дата", "Статус", "Отчёт"]).map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.items.map(row => tab === "users" ? <tr key={row.id}><td>{row.name || row.username}<small>{row.username}</small></td><td>{new Date(row.created_at + "Z").toLocaleString("ru", { timeZone: "Europe/Moscow" })}</td><td>{row.activity ? new Date(row.activity + "Z").toLocaleString("ru", { timeZone: "Europe/Moscow" }) : "Нет данных"}</td><td>{row.completed} / {row.reports}</td><td>{row.modes.map(m => modeLabels[m] || m).join(", ") || "—"}</td><td><button onClick={() => { setUserId(row.id); setTab("sessions"); setPage(1); }}>Открыть аналитику</button></td></tr> : <tr key={row.id}><td>#{row.id}</td><td>{row.username}</td><td>{modeLabels[row.mode] || row.mode}</td><td>{new Date(row.created_at + "Z").toLocaleString("ru", { timeZone: "Europe/Moscow" })}</td><td>{row.verdict || row.status}<small>Отчёт: {{ ready: "готов", pending: "готовится", error: "ошибка", not_requested: "не запрошен" }[row.report_status]}</small>{userId && row.metrics && <small>Доверие {row.metrics.trust} · Цель {row.metrics.goal} · Контроль {row.metrics.control} · EQ {row.metrics.eq}</small>}</td><td><button onClick={() => action(async () => setReport(await api(`/api/admin/analytics/sessions/${row.id}`)))}>{row.report_ready ? "Открыть" : "Переписка"}</button></td></tr>)}</tbody></table></div>{!data.items.length && <p>Записей нет.</p>}<div className="ia-toolbar"><button disabled={page === 1} onClick={() => setPage(n => n - 1)}>Назад</button><span>Страница {page} · Всего {data.total}</span><button disabled={page * 25 >= data.total} onClick={() => setPage(n => n + 1)}>Далее</button></div></section>}
    </>}
    {!user.must_change_password && section === "settings" && (cfg ? <>
      {!cfg.onboarding_completed && <section className="ia-panel ia-welcome"><h2>Настройте установку</h2><p>Подключите GigaChat для диалогов с ИИ и проверьте голос. Готовые сценарии доступны без ключа. Внешний Whisper можно добавить позже.</p><button disabled={busy} onClick={() => action(async () => setCfg(await api("/api/admin/installation/complete", { method: "POST", body: { revision: cfg.revision } })))}>Понятно, начать работу</button></section>}
      <div className="ia-columns"><form className="ia-panel" onSubmit={e => { e.preventDefault(); action(async () => { setCfg(await api("/api/admin/installation/ai", { method: "PUT", body: { ...ai, revision: cfg.revision } })); setAi({ ...ai, key: "" }); setMessage("GigaChat проверен. Настройки применены к новым запросам."); }); }}><h2>GigaChat</h2><p>{cfg.key_configured ? "Ключ сохранён. Оставьте поле пустым, чтобы использовать его." : "Ключ ещё не настроен"}</p><label>Authorization Key<input type="password" autoComplete="off" value={ai.key} onChange={e => setAi({ ...ai, key: e.target.value })} /></label><label>Scope<select value={ai.scope} onChange={e => setAi({ ...ai, scope: e.target.value })}>{["GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"].map(x => <option key={x}>{x}</option>)}</select></label><label>Модель<input required value={ai.model} onChange={e => setAi({ ...ai, model: e.target.value })} /></label><div className="ia-toolbar"><button type="button" disabled={busy} onClick={() => action(async () => { const r = await api("/api/admin/installation/ai/check", { method: "POST", body: { ...ai, revision: cfg.revision } }); setMessage(`Соединение работает. Доступны: ${r.models.join(", ")}`); })}>Проверить</button><button disabled={busy}>Проверить и сохранить</button></div></form>
      <form className="ia-panel" onSubmit={e => { e.preventDefault(); action(async () => { setCfg(await api("/api/admin/installation/speech", { method: "PUT", body: { ...speech, revision: cfg.revision } })); setMessage("Настройки распознавания сохранены"); }); }}><h2>Распознавание речи</h2><label>Где распознавать<select value={speech.policy} onChange={e => setSpeech({ ...speech, policy: e.target.value })}><option value="local">На этом сервере</option><option value="auto">Внешний Whisper, при сбое — локально</option><option value="remote">Только внешний Whisper</option></select></label><label>Локальная модель<select value={speech.model} onChange={e => setSpeech({ ...speech, model: e.target.value })}>{["tiny", "base", "small"].map(x => <option key={x}>{x}</option>)}</select></label><p>Tiny подходит для небольшого сервера. Base и Small требуют больше памяти и времени. Загрузите выбранную модель в блоке «Файлы речи» ниже.</p><button disabled={busy}>Применить</button><p>Голос: Дмитрий · Piper · русский.</p><p>TURN: {cfg.turn_configured ? "настроен" : "не настроен"}. Внешний Whisper не заменяет соединение видеозвонка.</p></form></div>
      <AdminModelDownloads /><AdminSpeechTest />
      <section className="ia-panel"><h2>Внешний Whisper</h2><p>Worker сам подключается к этому сайту по HTTPS. Входящие порты на его компьютере открывать не нужно.</p><label>Название компьютера<input value={workerName} onChange={e => setWorkerName(e.target.value)} maxLength={80} /></label><button disabled={busy} onClick={() => action(async () => setEnrollment(await api("/api/admin/stt/enrollment", { method: "POST", body: { name: workerName } })))}>Создать код подключения на 10 минут</button>{enrollment && <div className="ia-notice"><p>Одноразовый код — скопируйте и введите в установщике worker:</p><code className="ia-secret">{enrollment.code}</code><p>Адрес сайта: {enrollment.backend_url}</p><button onClick={() => setEnrollment(null)}>Скрыть код</button></div>}<ol><li>На Ubuntu с выделенной NVIDIA GPU запустите установщик с <code>--role whisper-worker</code>.</li><li>Введите адрес сайта и одноразовый код. Дождитесь загрузки модели и проверки GPU.</li><li>Обновите список, проверьте запись и включите автоматический режим выше.</li></ol><button onClick={() => setRefresh(n => n + 1)}>Обновить список</button>{workers.length ? workers.map(w => <article className="ia-worker" key={w.id}><div><b>{w.name}</b><p>{w.revoked ? "Доступ отозван" : w.ready ? "Готов к работе" : "Не готов или отключён"} · {w.diagnostic.model || "Модель ещё не загружена"}</p><small>{w.diagnostic.gpu || "GPU ещё не проверен"}</small></div><button disabled={busy || w.revoked} onClick={() => action(async () => { await api(`/api/admin/stt/workers/${w.id}/revoke`, { method: "POST" }); setRefresh(n => n + 1); })}>Отозвать доступ</button></article>) : <p>Подключённых worker пока нет.</p>}</section>
      <section className="ia-panel"><h2>Изменения настроек</h2><button onClick={() => action(async () => setAudit(await api("/api/admin/installation/audit")))}>Показать последние 25 действий</button>{audit && (audit.length ? audit.map(a => <p key={a.id}>{new Date(a.created * 1000).toLocaleString("ru")} · {a.action} · Администратор #{a.actor_id}</p>) : <p>Изменений пока нет.</p>)}</section><details className="ia-panel"><summary>Настройки сценариев и компании</summary><Admin settingsOnly /></details>
    </> : <p role="status">Загружаем настройки…</p>)}
  </div>;
}
