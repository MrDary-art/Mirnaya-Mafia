import { useMemo, useState } from "react";
import { api } from "../api.js";
import { useEffect, formatDate, Loader, Empty, Notice, ManagementSummary, StatusBadge } from "./shared.jsx";

const fields = {
  teams: [["webhook_url", "Webhook URL"]], slack: [["webhook_url", "Webhook URL"]],
  webhook: [["webhook_url", "Webhook URL"]],
  hris: [["base_url", "Адрес HRIS"], ["api_token", "API-токен", true]],
  lms: [["base_url", "Адрес LMS"], ["client_id", "Client ID"], ["client_secret", "Client secret", true]],
  crm: [["base_url", "Адрес CRM"], ["api_token", "API-токен", true]],
  calendar: [["base_url", "Адрес календаря"], ["api_token", "API-токен", true]],
  sso_oidc: [["issuer", "Issuer URL"], ["client_id", "Client ID"], ["client_secret", "Client secret", true]],
  sso_saml: [["metadata_url", "Metadata URL"], ["entity_id", "Entity ID"], ["certificate", "Сертификат", true]],
};

const categoryLabels = {
  identity: "Доступ и идентификация",
  people: "Сотрудники и обучение",
  workflow: "Рабочие процессы",
  other: "Уведомления и сервисы",
};

const statusLabel = { NOT_CONFIGURED: "Не настроено", INCOMPLETE: "Нужны данные", CONFIGURED: "Готово к проверке", ERROR: "Ошибка" };
const statusKey = status => status === "CONFIGURED" ? "CONFIGURED" : status === "ERROR" ? "ERROR" : status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "INCOMPLETE";

function categoryOf(provider) {
  if (provider.startsWith("sso_")) return "identity";
  if (["hris", "lms"].includes(provider)) return "people";
  if (["crm", "calendar"].includes(provider)) return "workflow";
  return "other";
}

export function Integrations({ data }) {
  const [items, setItems] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [integrations, history] = await Promise.all([
        api(`/api/company/${data.company.id}/integrations`),
        api(`/api/company/${data.company.id}/integrations/runs`),
      ]);
      setItems(integrations);
      setRuns(history);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { load(); }, [data.company.id]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return items.filter(item => {
      const statusMatch = status === "ALL" || item.status === status;
      const textMatch = !normalized || [item.label, item.provider, ...(item.capabilities || [])].some(value => value?.toLocaleLowerCase("ru").includes(normalized));
      return statusMatch && textMatch;
    });
  }, [items, query, status]);

  const configured = items.filter(item => item.status === "CONFIGURED").length;
  const errors = items.filter(item => item.status === "ERROR").length;
  const needsSetup = items.filter(item => ["NOT_CONFIGURED", "INCOMPLETE"].includes(item.status)).length;
  const selectedItem = items.find(item => item.provider === selected);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    try {
      await api(`/api/company/${data.company.id}/integrations/${selected}`, { method: "PUT", body: { enabled: true, settings: form } });
      setNote("Конфигурация сохранена. Запустите проверку соединения.");
      setSelected("");
      setForm({});
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function check(provider) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const result = await api(`/api/company/${data.company.id}/integrations/${provider}/check`, { method: "POST" });
      setNote(result.message);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function configure(item) {
    setSelected(item.provider);
    setForm({});
    setError("");
    setNote("");
  }

  if (!loaded && !error) return <Loader />;

  const grouped = Object.keys(categoryLabels).map(category => [category, visible.filter(item => categoryOf(item.provider) === category)]).filter(([, group]) => group.length);
  return <section className="business-management-page">
    <ManagementSummary description="Подключайте корпоративные системы без передачи личных данных. Сначала сохраните конфигурацию, затем отдельно проверьте соединение и отслеживайте обмен в журнале." stats={[{ label: "Готовы к работе", value: configured }, { label: "Нужна настройка", value: needsSetup }, { label: "С ошибками", value: errors }]} />
    {error && <Notice tone="red">{error}</Notice>}{note && <Notice>{note}</Notice>}
    <div className="business-management-toolbar"><label>Поиск интеграции<input type="search" placeholder="SSO, HRIS, LMS, CRM…" value={query} onChange={event => setQuery(event.target.value)} /></label><label>Состояние<select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Все состояния</option><option value="NOT_CONFIGURED">Не настроено</option><option value="INCOMPLETE">Нужны данные</option><option value="CONFIGURED">Готово к проверке</option><option value="ERROR">Ошибка</option></select></label><span className="business-management-toolbar-meta">{visible.length} интеграций</span></div>
    {selectedItem && <form className="business-inline-form" onSubmit={save}><div className="business-card-heading"><div><h3>{selectedItem.label}</h3><p className="business-management-note mt-1">{(selectedItem.capabilities || []).join(" · ")}</p></div><button type="button" className="subtle-button" onClick={() => setSelected("")}>Закрыть</button></div>{(fields[selected] || []).map(([key, label, secret]) => <label key={key}>{label}<input required type={secret ? "password" : (["webhook_url", "base_url", "issuer", "metadata_url"].includes(key) ? "url" : "text")} autoComplete="off" value={form[key] || ""} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}<p className="business-management-note">Секреты шифруются на сервере и больше не возвращаются в браузер.</p><div className="business-inline-form-actions"><button className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить конфигурацию"}</button><button type="button" className="subtle-button" onClick={() => setSelected("")}>Отмена</button></div></form>}
    {!grouped.length && <Empty>По выбранным условиям интеграции не найдены.</Empty>}
    {grouped.map(([category, group]) => <section className="business-management-card-grid" key={category} aria-labelledby={`integration-${category}`}><div className="business-management-section-heading"><div><span className="business-management-eyebrow">{categoryLabels[category]}</span><h3 id={`integration-${category}`}>{category === "identity" ? "Доступ для команды" : category === "people" ? "Сотрудники и обучение" : category === "workflow" ? "Рабочие процессы" : "Уведомления и сервисы"}</h3></div></div>{group.map(item => <article className="business-management-card" key={item.provider}><div className="business-card-heading"><h3>{item.label}</h3><StatusBadge status={statusKey(item.status)} label={statusLabel[item.status] || item.status} /></div><p>{(item.capabilities || []).join(" · ")}</p>{item.last_error && <p className="text-rose-200 mt-3 text-sm">{item.last_error}</p>}<div className="business-management-actions"><button type="button" className="subtle-button" onClick={() => configure(item)}>Настроить</button>{item.configured && <button type="button" className="subtle-button" disabled={busy} onClick={() => check(item.provider)}>Проверить</button>}</div></article>)}</section>)}
    <section className="business-management-card"><div className="business-card-heading"><div><span className="business-management-eyebrow">ИСТОРИЯ</span><h3>Последние проверки</h3></div><span className="business-management-note">{runs.length} операций</span></div>{runs.length ? <div className="business-management-table-wrap mt-4"><table className="business-management-table"><thead><tr><th>Операция</th><th>Состояние</th><th>Дата</th></tr></thead><tbody>{runs.slice(0, 12).map(run => <tr key={run.id}><td>{run.operation}</td><td><StatusBadge status={run.status === "SUCCESS" ? "ACTIVE" : run.status === "ERROR" ? "ERROR" : undefined} label={run.status} /></td><td>{formatDate(run.created_at)}</td></tr>)}</tbody></table></div> : <Empty>Проверок ещё не было.</Empty>}</section>
    <p className="business-management-note">Синхронизируются только корпоративные данные, необходимые выбранному провайдеру. Личные тренировки, сообщения и личный архив не передаются.</p>
  </section>;
}
