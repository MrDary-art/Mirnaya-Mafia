import { useMemo, useState } from "react";
import { api } from "../api.js";
import { useEffect, roleLabels, formatDate, Loader, Empty, Notice, ManagementSummary, StatusBadge } from "./shared.jsx";

const defaultPolicies = {
  learning: { default_attempts: 3, attempt_policy: "BEST", show_result_immediately: true, ghost_coach: true },
  kpi: { arena_weight: 50, company_weight: 50 },
  ratings: { enabled: false, visibility: "MANAGERS_ONLY", show_percentile: false },
  notifications: { reminders_3d: true, reminders_24h: true, reminders_3h: true },
  privacy: { records: "company_only", leaderboard: "managers", retention_days: 365 },
  modes: { ai_enabled: true, experimental_enabled: false, voice_enabled: false, video_enabled: false },
};

const companySizeOptions = ["1–20", "21–50", "51–200", "201–500", "501–1 000", "Более 1 000"];

function companySizeRange(value) {
  if (companySizeOptions.includes(value)) return value;
  const count = Number(String(value || "").match(/\d+/)?.[0]);
  if (!count) return "";
  if (count <= 20) return "1–20";
  if (count <= 50) return "21–50";
  if (count <= 200) return "51–200";
  if (count <= 500) return "201–500";
  if (count <= 1000) return "501–1 000";
  return "Более 1 000";
}

function mergePolicies(value = {}) {
  return {
    ...value,
    ...Object.fromEntries(Object.entries(defaultPolicies).map(([group, defaults]) => [group, { ...defaults, ...(value[group] || {}) }])),
  };
}

function Toggle({ checked, label, help, onChange }) {
  return <label className="business-toggle-row"><span><b>{label}</b>{help && <small>{help}</small>}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}

const auditActionLabels = {
  COMPANY_CREATED: "Создана компания", COMPANY_SETTINGS_UPDATED: "Изменены настройки компании", PILOT_UPDATED: "Изменён фокус команды",
  DEPARTMENT_CREATED: "Создано подразделение", DEPARTMENT_UPDATED: "Изменено подразделение", DEPARTMENT_DELETED: "Удалено подразделение",
  MEMBER_INVITED: "Приглашён сотрудник", MEMBER_UPDATED: "Изменены данные сотрудника", MEMBER_LEFT: "Сотрудник исключён",
  ASSIGNMENT_CREATED: "Назначена практика", ASSIGNMENT_UPDATED: "Изменена практика", RESULTS_RELEASED: "Опубликованы результаты",
  MEETING_CREATED: "Создана встреча", MEETING_REPORT_DRAFTED: "Подготовлен отчёт встречи", MEETING_REPORT_SENT: "Отчёт встречи отправлен",
  EPISODE_CREATED: "Создана рабочая ситуация", EPISODE_UPDATED: "Изменена рабочая ситуация", EPISODE_STATUS_UPDATED: "Изменён статус ситуации",
  PROGRAM_CREATED: "Создана программа", PROGRAM_STATUS_CHANGED: "Изменён статус программы", SURVEY_CREATED: "Создан опрос",
};

const auditEntityLabels = {
  company: "Компания", department: "Подразделение", membership: "Сотрудник", assignment: "Практика",
  company_meeting: "Встреча", company_work_episode: "Рабочая ситуация", program: "Программа", survey: "Опрос",
  scenario: "Сценарий", material: "Материал", integration: "Интеграция", cohort: "Учебная команда",
};

const auditActionTitle = action => auditActionLabels[action] || "Изменение в компании";
const auditEntityTitle = row => auditEntityLabels[row.entity_type] || "Корпоративный объект";

export function Policies({ data, reload, section = "all" }) {
  const [settings, setSettings] = useState(() => mergePolicies(data.company.settings || {}));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState([]);
  const [auditFilter, setAuditFilter] = useState("");
  const [auditVisibleCount, setAuditVisibleCount] = useState(5);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const update = (group, key, value) => setSettings(current => ({ ...current, [group]: { ...current[group], [key]: value } }));

  useEffect(() => {
    if (section !== "all" && section !== "audit") return undefined;
    let active = true;
    setAuditLoaded(false);
    api(`/api/company/${data.company.id}/audit?limit=100`)
      .then(result => { if (active) setAudit(result); })
      .catch(cause => { if (active) setMessage(cause.message); })
      .finally(() => { if (active) setAuditLoaded(true); });
    return () => { active = false; };
  }, [data.company.id, section]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/company/${data.company.id}/settings`, { method: "PUT", body: { settings } });
      setMessage("Правила сохранены.");
      await reload();
    } catch (cause) {
      setMessage(cause.message);
    } finally {
      setBusy(false);
    }
  }

  const messageTone = message.includes("сохранены") ? "success" : "red";
  const normalizedAuditFilter = auditFilter.trim().toLocaleLowerCase("ru");
  const visibleAudit = useMemo(() => audit.filter(row => !normalizedAuditFilter || [row.actor, auditActionTitle(row.action), auditEntityTitle(row)].some(value => value?.toLocaleLowerCase("ru").includes(normalizedAuditFilter))), [audit, normalizedAuditFilter]);
  const displayedAudit = visibleAudit.slice(0, auditVisibleCount);
  const show = key => ["notifications", "privacy", "audit"].includes(key) && (section === "all" || section === key);
  useEffect(() => { setAuditVisibleCount(5); }, [auditFilter, section]);
  return <section className="business-management-page">
    {section === "all" && <ManagementSummary
      description="Здесь задаются напоминания о сроках и правила хранения корпоративных данных. Личные данные сотрудников остаются закрытыми."
      stats={[
        { label: "Напоминания", value: Object.values(settings.notifications).some(Boolean) ? "Включены" : "Выключены" },
        { label: "Результаты", value: settings.privacy.records === "employee_only" ? "Личные" : "Командные" },
        { label: "Хранение", value: `${settings.privacy.retention_days} дней` },
      ]}
      action={<button className="primary-button" disabled={busy} onClick={save}>{busy ? "Сохраняем…" : "Сохранить правила"}</button>}
    />}
    {message && <Notice tone={messageTone}>{message}</Notice>}
    <div className="business-management-card-grid">
      {show("learning") && <article className="business-management-card">
        <div className="business-card-heading"><h3>Параметры обучения</h3><StatusBadge label="По умолчанию" status="CONFIGURED" /></div>
        <p>Определите базовые условия прохождения корпоративных заданий.</p>
        <label className="block mt-4">Попыток<input type="number" min="1" max="20" value={settings.learning.default_attempts} onChange={event => update("learning", "default_attempts", Number(event.target.value))} /></label>
        <label className="block mt-3">Учитывать результат<select value={settings.learning.attempt_policy} onChange={event => update("learning", "attempt_policy", event.target.value)}><option value="BEST">Лучший результат</option><option value="LAST">Последний результат</option></select></label>
        <div className="mt-4 grid gap-2"><Toggle checked={settings.learning.show_result_immediately} label="Показывать результат сразу" onChange={value => update("learning", "show_result_immediately", value)} /><Toggle checked={settings.learning.ghost_coach} label="Разрешить Ghost Coach" onChange={value => update("learning", "ghost_coach", value)} /></div>
      </article>}
      {show("kpi") && <article className="business-management-card">
        <h3>Вес показателей</h3>
        <p>Разделите учебный результат и внутреннюю оценку эффективности.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label>Вес Arena, %<input type="number" min="0" max="100" value={settings.kpi.arena_weight} onChange={event => update("kpi", "arena_weight", Number(event.target.value))} /></label><label>Вес KPI, %<input type="number" min="0" max="100" value={settings.kpi.company_weight} onChange={event => update("kpi", "company_weight", Number(event.target.value))} /></label></div>
        <p className="business-management-note mt-3">Сумма двух значений должна быть 100%.</p>
      </article>}
      {show("ratings") && <article className="business-management-card">
        <h3>Видимость рейтинга</h3>
        <p>Показывайте сравнение только при достаточном количестве данных.</p>
        <div className="mt-4 grid gap-2"><Toggle checked={settings.ratings.enabled} label="Включить корпоративные рейтинги" onChange={value => update("ratings", "enabled", value)} /><Toggle checked={settings.ratings.show_percentile} label="Показывать перцентиль" onChange={value => update("ratings", "show_percentile", value)} /></div>
        <label className="block mt-3">Кто видит рейтинг<select value={settings.ratings.visibility} onChange={event => update("ratings", "visibility", event.target.value)}><option value="MANAGERS_ONLY">Только руководители</option><option value="COMPANY">Все сотрудники</option></select></label>
      </article>}
      {show("notifications") && <article className="business-management-card">
        <h3>Сроки напоминаний</h3>
        <p>Управляйте уведомлениями о назначениях и сроках.</p>
        <div className="mt-4 grid gap-2"><Toggle checked={settings.notifications.reminders_3d} label="За 3 дня" onChange={value => update("notifications", "reminders_3d", value)} /><Toggle checked={settings.notifications.reminders_24h} label="За 24 часа" onChange={value => update("notifications", "reminders_24h", value)} /><Toggle checked={settings.notifications.reminders_3h} label="За 3 часа" onChange={value => update("notifications", "reminders_3h", value)} /></div>
      </article>}
      {show("privacy") && <article className="business-management-card">
        <h3>Хранение результатов</h3>
        <p>Компания получает только корпоративные данные в пределах выданных прав.</p>
        <label className="block mt-4">Доступ к результатам<select value={settings.privacy.records} onChange={event => update("privacy", "records", event.target.value)}><option value="company_only">Сотрудник и руководители</option><option value="employee_only">Только сотрудник</option></select></label>
        <label className="block mt-3">Срок хранения, дней<input type="number" min="1" max="3650" value={settings.privacy.retention_days} onChange={event => update("privacy", "retention_days", Number(event.target.value))} /></label>
      </article>}
      {show("modes") && <article className="business-management-card">
        <h3>Доступные режимы</h3>
        <p>Экспериментальные и медийные функции включаются отдельно.</p>
        <div className="mt-4 grid gap-2"><Toggle checked={settings.modes.ai_enabled} label="AI-режимы" onChange={value => update("modes", "ai_enabled", value)} /><Toggle checked={settings.modes.experimental_enabled} label="Экспериментальные режимы" onChange={value => update("modes", "experimental_enabled", value)} /><Toggle checked={settings.modes.voice_enabled} label="Голосовые функции" onChange={value => update("modes", "voice_enabled", value)} /><Toggle checked={settings.modes.video_enabled} label="Видео-функции" onChange={value => update("modes", "video_enabled", value)} /></div>
      </article>}
    </div>
    {section !== "all" && section !== "audit" && <div className="business-settings-form-actions"><button type="button" className="primary-button" disabled={busy} onClick={save}>{busy ? "Сохраняем…" : "Сохранить изменения"}</button></div>}
    {show("audit") && <section className="business-management-card">
      <div className="business-card-heading"><div><span className="business-management-eyebrow">ЖУРНАЛ</span><h3>История изменений</h3></div><span className="business-management-note">{audit.length} событий</span></div>
      <p>Здесь видны только действия внутри рабочего пространства. Личный архив и личные сообщения в журнал не попадают.</p>
      <div className="business-management-toolbar mt-4"><label>Поиск по действию или сотруднику<input type="search" placeholder="Например, настройки или имя" value={auditFilter} onChange={event => setAuditFilter(event.target.value)} /></label></div>
      {!auditLoaded ? <Loader /> : visibleAudit.length ? <><div className="business-audit-list mt-4">{displayedAudit.map(row => <details key={row.id} className="business-audit-item"><summary><span><b>{auditActionTitle(row.action)}</b><small>{row.actor || "Сотрудник"} · {formatDate(row.created_at)}</small></span><i aria-hidden="true">›</i></summary><div className="business-audit-details"><span>Объект</span><b>{auditEntityTitle(row)}</b>{row.entity_id && <small>Запись #{row.entity_id}</small>}</div></details>)}</div>{visibleAudit.length > 5 && <div className="business-employees-list-footer"><span>Показано {displayedAudit.length} из {visibleAudit.length}</span><button type="button" className="subtle-button" aria-expanded={auditVisibleCount >= visibleAudit.length} onClick={() => setAuditVisibleCount(count => count >= visibleAudit.length ? 5 : Math.min(count + 5, visibleAudit.length))}>{auditVisibleCount >= visibleAudit.length ? "Свернуть" : `Показать ещё ${Math.min(5, visibleAudit.length - auditVisibleCount)}`}</button></div>}</> : <Empty>Событий по выбранному фильтру пока нет.</Empty>}
    </section>}
    {section === "all" && <section className="business-management-note">Личный архив, личные сообщения и индивидуальные тренировки сотрудника не становятся доступными компании автоматически.</section>}
  </section>;
}

export function Settings({ data, reload, section = "all" }) {
  const initial = {
    name: data.company.name,
    description: data.company.description || "",
    industry: data.company.industry || "",
    company_size: companySizeRange(data.company.company_size),
    country: data.company.country || "",
    city: data.company.city || "",
    website: data.company.website || "",
    timezone: data.company.timezone || "Europe/Moscow",
    logo: data.company.logo || "",
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const update = patch => setForm(current => ({ ...current, ...patch }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/api/company/${data.company.id}/settings`, { method: "PUT", body: form });
      setMessage("Настройки компании сохранены.");
      await reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function chooseLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 350000) {
      setError("Выберите PNG, JPEG или WebP до 350 КБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return <section className="business-management-page">
    {error && <Notice tone="red">{error}</Notice>}{message && <Notice>{message}</Notice>}
    <form id="company-settings-form" className={`business-management-card-grid business-settings-grid${section !== "all" ? " is-single" : ""}`} onSubmit={save}>
      {(section === "all" || section === "profile") && <article className="business-management-card business-settings-profile-card">
        <h3>Основные сведения</h3><p>Данные, которые видят участники рабочего пространства.</p>{data.company.name_locked && <Notice>Название закреплено администрацией. Для изменения напишите на почту создателей платформы.</Notice>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label>Название<input required disabled={data.company.name_locked} value={form.name} onChange={event => update({ name: event.target.value })} /></label><label>Отрасль<input value={form.industry} onChange={event => update({ industry: event.target.value })} /></label><label>Размер команды<select value={form.company_size} onChange={event => update({ company_size: event.target.value })}><option value="">Выберите диапазон</option>{companySizeOptions.map(option => <option key={option} value={option}>{option} сотрудников</option>)}</select></label><label>Страна<input value={form.country} onChange={event => update({ country: event.target.value })} /></label><label>Город<input value={form.city} onChange={event => update({ city: event.target.value })} /></label><label className="sm:col-span-2">Сайт<input type="url" value={form.website} onChange={event => update({ website: event.target.value })} /></label><label className="sm:col-span-2">Описание<textarea rows="4" value={form.description} onChange={event => update({ description: event.target.value })} /></label></div>
      </article>}
      {(section === "all" || section === "logo") && <article className="business-management-card business-settings-logo-card">
        <h3>Файл логотипа</h3><p>Логотип отображается в корпоративном пространстве и материалах компании.</p>
        <div className="business-settings-preview mt-4">{form.logo ? <img src={form.logo} alt={`Логотип ${form.name}`} /> : <span className="business-settings-preview-mark" aria-hidden="true">{(form.name || "A").slice(0, 1)}</span>}<div><strong>{form.name || "Название компании"}</strong><span>{form.logo ? "Логотип загружен" : "Логотип пока не выбран"}</span></div></div>
        <label className="business-logo-field mt-4"><span>Файл логотипа</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /><small>PNG, JPEG или WebP до 350 КБ</small></label>
        {form.logo && <button type="button" className="subtle-button mt-4" onClick={() => update({ logo: "" })}>Удалить логотип</button>}
      </article>}
      {(section === "all" || section === "workspace") && <article className="business-management-card business-settings-time-card">
        <h3>Рабочее время</h3><p>Часовой пояс используется для сроков, напоминаний и расписаний.</p>
        <label className="block mt-4">Часовой пояс<select value={form.timezone} onChange={event => update({ timezone: event.target.value })}><option value="Europe/Moscow">Москва (UTC+3)</option><option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option><option value="Asia/Almaty">Алматы (UTC+5)</option><option value="Asia/Vladivostok">Владивосток (UTC+10)</option></select></label>
        <p className="business-management-note mt-4">Изменение часового пояса влияет на новые назначения и автоматические запуски.</p>
      </article>}
      {section === "all" && <article className="business-management-card business-settings-privacy-card">
        <h3>Граница приватности</h3><p>Настройки доступа к результатам находятся в разделе «Правила и аудит».</p>
        <div className="business-management-note mt-4">Компания видит корпоративные задания, результаты, сертификаты и корпоративные встречи. Личные чаты, друзья, тренировки, покупки и личная валюта остаются закрытыми.</div>
      </article>}
      <div className="business-settings-form-actions"><button type="submit" className="primary-button" disabled={busy || !dirty}>{busy ? "Сохраняем…" : "Сохранить изменения"}</button></div>
    </form>
  </section>;
}

export { Integrations } from "./integrations.jsx";

const capabilityLabels = {
  manage_company: "Управление компанией", manage_learning: "Программы и контент",
  manage_team: "Команда в своей области", view_analytics: "Просмотр аналитики",
  manage_structure: "Структура компании", invite_members: "Приглашение сотрудников",
  manage_assignments: "Назначение практик", view_audit: "Журнал действий",
  review_results: "Просмотр результатов", comment_results: "Комментарии к результатам",
};

export function AccessAndBilling({ data }) {
  const [value, setValue] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState("");
  const [visibleMemberCount, setVisibleMemberCount] = useState(5);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = () => api(`/api/company/${data.company.id}/access`).then(result => {
    setValue(result);
    setDrafts(Object.fromEntries((result.members || []).map(member => [member.id, { role: member.role, overrides: member.overrides || {} }])));
  }).catch(error => setMessage(error.message)).finally(() => setLoaded(true));
  useEffect(() => {
    setLoaded(false);
    setValue(null);
    load();
  }, [data.company.id]);
  useEffect(() => { setVisibleMemberCount(5); }, [query, data.company.id]);

  async function saveMember(member) {
    const draft = drafts[member.id];
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const restrictions = Object.fromEntries(Object.entries(draft.overrides || {}).filter(([, enabled]) => enabled === false));
      await api(`/api/company/${data.company.id}/access/${member.id}`, { method: "PUT", body: { corporate_role: draft.role, capability_overrides: restrictions } });
      setMessage("Права сотрудника сохранены.");
      await load();
    } catch (cause) {
      setMessage(cause.message);
    } finally {
      setBusy(false);
    }
  }

  const members = value?.members || [];
  const visibleMembers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return members.filter(member => !normalized || [member.name, member.username, member.role_label, member.status].some(value => value?.toLocaleLowerCase("ru").includes(normalized)));
  }, [members, query]);
  const displayedMembers = visibleMembers.slice(0, visibleMemberCount);
  if (!loaded) return <Loader />;
  if (!value) return <section className="business-management-page"><Notice tone="red">{message || "Не удалось загрузить права доступа."}</Notice><button type="button" className="subtle-button" onClick={() => { setLoaded(false); setMessage(""); load(); }}>Повторить загрузку</button></section>;
  return <section className="business-management-page">
    <ManagementSummary description="Роли определяют доступ к корпоративным данным и действиям. Личные архивы и сообщения сотрудников не открываются руководителю автоматически." stats={[{ label: "Участники", value: members.length }]} />
    {message && <Notice tone={message.includes("сохранены") ? "success" : "red"}>{message}</Notice>}
    <div className="business-management-toolbar"><label>Поиск участника<input type="search" placeholder="Имя, логин или роль" value={query} onChange={event => setQuery(event.target.value)} /></label><span className="business-management-toolbar-meta">{visibleMembers.length} из {members.length}</span></div>
    <div className="business-management-table-wrap"><table className="business-management-table"><thead><tr><th>Участник</th><th>Роль</th><th>Статус</th><th>Права</th><th aria-label="Действие" /></tr></thead><tbody>{displayedMembers.map(member => { const draft = drafts[member.id] || { role: member.role, overrides: {} }; const roleProfile = (value.roles || []).find(role => role.code === draft.role); return <tr key={member.id}><td><b>{member.name}</b><p>@{member.username}</p></td><td><select aria-label={`Роль ${member.name}`} value={draft.role} onChange={event => setDrafts(current => ({ ...current, [member.id]: { ...draft, role: event.target.value } }))}>{(value.roles || []).map(role => <option key={role.code} value={role.code}>{role.label}</option>)}</select></td><td><StatusBadge status={member.status} /></td><td><details><summary>Показать права</summary><div className="business-permission-list mt-3">{(value.capabilities || []).map(key => { const allowed = Boolean(roleProfile?.capabilities?.[key]); const checked = allowed && draft.overrides[key] !== false; return <label key={key}><span>{capabilityLabels[key] || key}</span><input type="checkbox" checked={checked} disabled={!allowed} onChange={event => { const overrides = { ...draft.overrides }; if (event.target.checked) delete overrides[key]; else overrides[key] = false; setDrafts(current => ({ ...current, [member.id]: { ...draft, overrides } })); }} /></label>; })}</div></details></td><td><button type="button" className="subtle-button" disabled={busy} onClick={() => saveMember(member)}>Сохранить</button></td></tr>; })}</tbody></table>{!visibleMembers.length && <Empty>Участники не найдены.</Empty>}</div>
    {visibleMembers.length > 5 && <div className="business-employees-list-footer"><span>Показано {displayedMembers.length} из {visibleMembers.length}</span><button type="button" className="subtle-button" aria-expanded={visibleMemberCount > 5} onClick={() => setVisibleMemberCount(count => count >= visibleMembers.length ? 5 : Math.min(count + 5, visibleMembers.length))}>{visibleMemberCount >= visibleMembers.length ? "Свернуть" : `Показать ещё ${Math.min(5, visibleMembers.length - visibleMemberCount)}`}</button></div>}
  </section>;
}
