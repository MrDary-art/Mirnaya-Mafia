import { useMemo, useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice, ManagementSummary, StatusBadge } from "./shared.jsx";

export function Applications({ data }) {
  const companyId = data.company.id;
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState("PENDING");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [declineConfirm, setDeclineConfirm] = useState(null);

  async function load() {
    setError("");
    try {
      const [applications, departmentList, catalog] = await Promise.all([
        api("/api/company/" + companyId + "/applications"),
        api("/api/company/" + companyId + "/departments"),
        api("/api/company/" + companyId + "/catalog"),
      ]);
      setItems(applications);
      setDepartments(departmentList);
      setProfessions((catalog.professions || []).filter(item => item.status === "ACTIVE"));
      setLoaded(true);
    } catch (cause) {
      setError(cause.message);
    }
  }

  useEffect(() => {
    setLoaded(false);
    setSelected(null);
    setDeclineConfirm(null);
    load();
  }, [companyId]);

  const pending = items.filter(item => item.status === "PENDING");
  const approved = items.filter(item => ["ACCEPTED", "APPROVED"].includes(item.status));
  const declined = items.filter(item => ["DECLINED", "REJECTED"].includes(item.status));
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return items.filter(item => {
      const statusMatch = status === "ALL"
        || (status === "PENDING" && item.status === "PENDING")
        || (status === "ACCEPTED" && ["ACCEPTED", "APPROVED"].includes(item.status))
        || (status === "DECLINED" && ["DECLINED", "REJECTED"].includes(item.status));
      const textMatch = !normalized || [item.name, item.username, item.specialization, item.job_title, item.message]
        .some(value => value?.toLocaleLowerCase("ru").includes(normalized));
      return statusMatch && textMatch;
    });
  }, [items, query, status]);

  useEffect(() => {
    if (!visible.some(item => item.id === selected)) {
      setSelected(visible[0]?.id ?? null);
      setDeclineConfirm(null);
    }
  }, [visible, selected]);

  const selectedItem = items.find(item => item.id === selected);
  const draft = selectedItem ? (drafts[selectedItem.id] || {
    job_title: selectedItem.job_title || "",
    corporate_role: selectedItem.corporate_role || "EMPLOYEE",
    department_id: selectedItem.department_id || "",
    profession_id: selectedItem.profession_id || professions.find(item => item.title === selectedItem.specialization)?.id || "",
  }) : null;
  const roleOptions = Object.entries(roleLabels)
    .filter(([key]) => key !== "COMPANY_OWNER" || data.membership?.role === "COMPANY_OWNER");
  const statusTabs = [
    ["PENDING", "Новые", pending.length],
    ["ALL", "Все", items.length],
    ["ACCEPTED", "Одобрены", approved.length],
    ["DECLINED", "Отклонены", declined.length],
  ];
  const statusHeading = { PENDING: "Новые заявки", ALL: "Все заявки", ACCEPTED: "Одобренные заявки", DECLINED: "Отклонённые заявки" }[status];
  const listCountLabel = status === "PENDING"
    ? (pending.length ? pending.length + " новых" : "Очередь чиста")
    : visible.length + " показано";

  function updateDraft(patch) {
    if (!selectedItem) return;
    setDrafts(current => ({ ...current, [selectedItem.id]: { ...draft, ...patch } }));
  }

  async function review(item, action) {
    const value = drafts[item.id] || {};
    setBusy(true);
    setError("");
    try {
      await api("/api/company/" + companyId + "/applications/" + item.id + "/review", {
        method: "POST",
        body: {
          action,
          job_title: value.job_title || item.job_title,
          corporate_role: value.corporate_role || "EMPLOYEE",
          department_id: value.department_id ? Number(value.department_id) : null,
          profession_id: value.profession_id ? Number(value.profession_id) : null,
        },
      });
      setSelected(null);
      setDeclineConfirm(null);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && !error) return <Loader />;

  return <section className="business-management-page">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="mt-2 text-3xl font-bold">Заявки</h2></div></header>
    <ManagementSummary
      stats={[
        { label: "Ожидают решения", value: pending.length },
        { label: "Одобрены", value: approved.length },
        { label: "Отклонены", value: declined.length },
      ]}
    />
    {error && <Notice tone="red">{error}</Notice>}
    <div className="business-application-controls">
      <div className="business-application-tabs" role="tablist" aria-label="Фильтр заявок">
        {statusTabs.map(([key, label, count]) => <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? "is-active" : ""} onClick={() => setStatus(key)}><span>{label}</span><b>{count}</b></button>)}
      </div>
      <div className="business-application-search-row">
        <label>Поиск по заявкам<input type="search" placeholder="Имя, логин, должность или сообщение" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <span className="business-management-toolbar-meta">{visible.length} из {items.length}</span>
      </div>
    </div>
    <div className="business-management-split">
      <section className="business-management-list" aria-label="Список заявок">
        <header className="business-management-list-header"><div><span className="business-management-eyebrow">ОБРАБОТКА</span><h3>{statusHeading}</h3></div><span className={status === "PENDING" ? "business-status business-status-warning" : "business-management-note"}>{listCountLabel}</span></header>
        <div className="business-management-list-items">
          {visible.map(item => <button type="button" key={item.id} className={"business-management-list-item" + (selected === item.id ? " is-selected" : "")} aria-current={selected === item.id ? "true" : undefined} onClick={() => setSelected(item.id)}>
            <span className="business-application-list-main"><span className="business-application-avatar" aria-hidden="true">{(item.name || item.username || "A").slice(0, 1).toUpperCase()}</span><span className="business-application-list-copy"><span className="business-management-list-item-top"><strong>{item.name || item.username || "Без имени"}</strong><StatusBadge status={item.status} /></span><span className="business-application-list-role">{[item.specialization, item.job_title].filter(Boolean).join(" · ") || "Должность не указана"}</span><span className="business-application-list-meta">{formatDate(item.created_at || item.submitted_at)}{item.message ? " · " + item.message.slice(0, 90) + (item.message.length > 90 ? "…" : "") : ""}</span></span></span>
          </button>)}
          {!visible.length && <div className="business-application-empty"><Empty>{status === "PENDING" && items.length ? "Новых заявок нет." : "По выбранным условиям заявок нет."}</Empty>{status === "PENDING" && items.length > 0 && <button type="button" className="subtle-button" onClick={() => setStatus("ALL")}>Показать все заявки</button>}</div>}
        </div>
      </section>
      <aside className="business-management-detail" aria-live="polite">
        {!selectedItem ? <div className="business-management-detail-empty"><span className="business-application-detail-icon" aria-hidden="true">✓</span><p>Выберите заявку слева, чтобы прочитать сообщение кандидата и назначить доступ.</p></div> : <>
          <div className="business-application-detail-profile"><span className="business-application-avatar business-application-avatar-large" aria-hidden="true">{(selectedItem.name || selectedItem.username || "A").slice(0, 1).toUpperCase()}</span><div><span className="business-management-eyebrow">ПРОФИЛЬ КАНДИДАТА</span><h3>{selectedItem.name || selectedItem.username}</h3><p className="business-management-note">@{selectedItem.username || "логин не указан"} · заявка от {formatDate(selectedItem.created_at || selectedItem.submitted_at)}</p></div><StatusBadge status={selectedItem.status} /></div>
          {selectedItem.message && <div className="business-application-message"><span className="business-management-eyebrow">СООБЩЕНИЕ КАНДИДАТА</span><p>{selectedItem.message}</p></div>}
          <div className="business-application-facts"><div><span>Специализация</span><strong>{selectedItem.specialization || "Не указана"}</strong></div><div><span>Желаемая должность</span><strong>{selectedItem.job_title || "Не указана"}</strong></div></div>
          {selectedItem.status === "PENDING" ? <div className="business-management-detail-section business-application-decision"><div className="business-application-section-heading"><div><h4>Назначить доступ</h4><p>Условия можно изменить до подтверждения заявки.</p></div><span className="business-application-step">1 шаг</span></div><div className="grid gap-3"><label>Должность в компании<input value={draft.job_title} onChange={event => updateDraft({ job_title: event.target.value })} /></label><label>Специальность<select value={draft.profession_id} onChange={event => updateDraft({ profession_id: event.target.value })}><option value="">Не назначена</option>{professions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Подразделение<select value={draft.department_id} onChange={event => updateDraft({ department_id: event.target.value })}><option value="">Без подразделения</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Роль доступа<select value={draft.corporate_role} onChange={event => updateDraft({ corporate_role: event.target.value })}>{roleOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className="business-application-access-note">После одобрения кандидат появится в «Сотрудниках» с выбранной специальностью, подразделением, ролью и доступом.</div>{declineConfirm === selectedItem.id ? <div className="business-application-confirm" role="alert"><p>Отклонить заявку без добавления в компанию?</p><div><button type="button" className="subtle-button" disabled={busy} onClick={() => setDeclineConfirm(null)}>Вернуться</button><button type="button" className="business-danger-button" disabled={busy} onClick={() => review(selectedItem, "decline")}>{busy ? "Сохраняем…" : "Отклонить заявку"}</button></div></div> : <div className="business-management-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => review(selectedItem, "accept")}>{busy ? "Сохраняем…" : "Одобрить и добавить"}</button><button type="button" className="subtle-button" disabled={busy} onClick={() => setDeclineConfirm(selectedItem.id)}>Отклонить</button></div>}</div> : <div className="business-management-detail-section business-application-history"><h4>История решения</h4><p>Заявка уже обработана. Изменить условия доступа можно в разделах «Сотрудники» и «Доступ и лицензии».</p></div>}
        </>}
      </aside>
    </div>
  </section>;
}
export function Directory({ data }) { const [q, setQ] = useState(""); const [items, setItems] = useState([]); const [error, setError] = useState(""); useEffect(() => { api(`/api/company/${data.company.id}/directory?q=${encodeURIComponent(q)}`).then(setItems).catch((e) => setError(e.message)); }, [data.company.id, q]); return <section className="space-y-5"><div><div className="eyebrow">КОЛЛЕГИ</div><h2 className="mt-1 text-3xl font-bold">Сотрудники компании</h2><p className="mt-2 text-slate-400">Справочник доступен только подтверждённым участникам этой компании.</p></div><input className="company-input max-w-xl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, ник или должность" />{error && <Notice tone="red">{error}</Notice>}<div className="grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.membership_id} className="glass rounded-2xl p-4"><b>{item.name}</b><p className="text-sm text-lime-200">@{item.username}</p><p className="mt-2 text-sm text-slate-400">{[item.department, item.job_title].filter(Boolean).join(" · ") || item.role_label}</p></article>)}</div>{!items.length && !error && <Empty>Сотрудники не найдены.</Empty>}</section>; }



export { Employees } from "./employees.jsx";
export { Teams } from "./structure.jsx";
export { Cohorts } from "./cohorts.jsx";
