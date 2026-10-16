import { useMemo, useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice, ManagementSummary, StatusBadge } from "./shared.jsx";

export function Applications({ data }) {
  const companyId = data.company.id;
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('PENDING');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [applications, departmentList] = await Promise.all([
        api(`/api/company/${companyId}/applications`),
        api(`/api/company/${companyId}/departments`),
      ]);
      setItems(applications);
      setDepartments(departmentList);
      setLoaded(true);
    } catch (cause) {
      setError(cause.message);
    }
  }

  useEffect(() => { setLoaded(false); load(); }, [companyId]);

  const pending = items.filter(item => item.status === 'PENDING');
  const approved = items.filter(item => ['ACCEPTED', 'APPROVED'].includes(item.status));
  const declined = items.filter(item => ['DECLINED', 'REJECTED'].includes(item.status));
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return items.filter(item => {
      const statusMatch = status === 'ALL' || (status === 'DECLINED' ? ['DECLINED', 'REJECTED'].includes(item.status) : item.status === status);
      const textMatch = !normalized || [item.name, item.username, item.specialization, item.job_title, item.message]
        .some(value => value?.toLocaleLowerCase('ru').includes(normalized));
      return statusMatch && textMatch;
    });
  }, [items, query, status]);
  const selectedItem = items.find(item => item.id === selected);
  const draft = selectedItem ? (drafts[selectedItem.id] || {
    job_title: selectedItem.job_title || '',
    corporate_role: selectedItem.corporate_role || 'EMPLOYEE',
    department_id: selectedItem.department_id || '',
  }) : null;

  function updateDraft(patch) {
    if (!selectedItem) return;
    setDrafts(current => ({ ...current, [selectedItem.id]: { ...draft, ...patch } }));
  }

  async function review(item, action) {
    const value = drafts[item.id] || {};
    setBusy(true);
    setError('');
    try {
      await api(`/api/company/${companyId}/applications/${item.id}/review`, {
        method: 'POST',
        body: {
          action,
          job_title: value.job_title || item.job_title,
          corporate_role: value.corporate_role || 'EMPLOYEE',
          department_id: value.department_id ? Number(value.department_id) : null,
        },
      });
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && !error) return <Loader />;

  return <section className="business-management-page">
    <ManagementSummary
      description="Проверяйте запросы на вступление до того, как человек получит корпоративный доступ. Назначьте должность, подразделение и роль прямо во время решения."
      stats={[
        { label: 'Ожидают решения', value: pending.length },
        { label: 'Одобрены', value: approved.length },
        { label: 'Отклонены', value: declined.length },
      ]}
    />
    {error && <Notice tone="red">{error}</Notice>}
    <div className="business-management-toolbar">
      <label>Поиск заявки<input type="search" placeholder="Имя, логин или должность" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Статус<select value={status} onChange={event => setStatus(event.target.value)}><option value="PENDING">Ожидают решения</option><option value="ALL">Все заявки</option><option value="ACCEPTED">Одобрены</option><option value="DECLINED">Отклонены</option></select></label>
      <span className="business-management-toolbar-meta">{visible.length} из {items.length}</span>
    </div>
    <div className="business-management-split">
      <section className="business-management-list" aria-label="Список заявок">
        <header className="business-management-list-header"><h3>Входящие заявки</h3><span className="business-status business-status-warning">{pending.length} новых</span></header>
        <div className="business-management-list-items">
          {visible.map(item => <button type="button" key={item.id} className={`business-management-list-item${selected === item.id ? ' is-selected' : ''}`} onClick={() => setSelected(item.id)}>
            <div className="business-management-list-item-top"><strong>{item.name || item.username || 'Без имени'}</strong><StatusBadge status={item.status} /></div>
            <p>{[item.specialization, item.job_title].filter(Boolean).join(' · ') || 'Должность не указана'}</p>
            <small>{formatDate(item.created_at || item.submitted_at)}{item.message ? ` · ${item.message.slice(0, 90)}${item.message.length > 90 ? '…' : ''}` : ''}</small>
          </button>)}
          {!visible.length && <Empty>По выбранным условиям заявок нет.</Empty>}
        </div>
      </section>
      <aside className="business-management-detail" aria-live="polite">
        {!selectedItem ? <div className="business-management-detail-empty"><p>Выберите заявку, чтобы увидеть сообщение кандидата и назначить условия доступа.</p></div> : <>
          <div className="business-management-detail-header"><div><h3>{selectedItem.name || selectedItem.username}</h3><p className="business-management-note">@{selectedItem.username || 'логин не указан'}</p></div><StatusBadge status={selectedItem.status} /></div>
          <dl className="business-management-definition business-management-detail-section"><div><dt>Специализация</dt><dd>{selectedItem.specialization || 'Не указана'}</dd></div><div><dt>Дата заявки</dt><dd>{formatDate(selectedItem.created_at || selectedItem.submitted_at)}</dd></div><div><dt>Сообщение</dt><dd>{selectedItem.message || 'Кандидат не добавил сообщение.'}</dd></div></dl>
          {selectedItem.status === 'PENDING' ? <div className="business-management-detail-section"><h4>Условия вступления</h4><div className="grid gap-3"><label>Должность<input value={draft.job_title} onChange={event => updateDraft({ job_title: event.target.value })} /></label><label>Подразделение<select value={draft.department_id} onChange={event => updateDraft({ department_id: event.target.value })}><option value="">Без подразделения</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Роль доступа<select value={draft.corporate_role} onChange={event => updateDraft({ corporate_role: event.target.value })}>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><p className="business-management-note mt-3">После одобрения человек появится в разделе «Сотрудники» и получит только выбранные права.</p><div className="business-management-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => review(selectedItem, 'accept')}>Одобрить</button><button type="button" className="subtle-button" disabled={busy} onClick={() => review(selectedItem, 'decline')}>Отклонить</button></div></div> : <div className="business-management-detail-section"><h4>История решения</h4><p className="business-management-note">Заявка уже обработана. Изменить условия можно в разделе «Сотрудники» или «Доступ и лицензии».</p></div>}
        </>}
      </aside>
    </div>
  </section>;
}

export function Directory({ data }) { const [q, setQ] = useState(""); const [items, setItems] = useState([]); const [error, setError] = useState(""); useEffect(() => { api(`/api/company/${data.company.id}/directory?q=${encodeURIComponent(q)}`).then(setItems).catch((e) => setError(e.message)); }, [data.company.id, q]); return <section className="space-y-5"><div><div className="eyebrow">КОЛЛЕГИ</div><h2 className="mt-1 text-3xl font-bold">Сотрудники компании</h2><p className="mt-2 text-slate-400">Справочник доступен только подтверждённым участникам этой компании.</p></div><input className="company-input max-w-xl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, ник или должность" />{error && <Notice tone="red">{error}</Notice>}<div className="grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.membership_id} className="glass rounded-2xl p-4"><b>{item.name}</b><p className="text-sm text-lime-200">@{item.username}</p><p className="mt-2 text-sm text-slate-400">{[item.department, item.job_title].filter(Boolean).join(" · ") || item.role_label}</p></article>)}</div>{!items.length && !error && <Empty>Сотрудники не найдены.</Empty>}</section>; }



export { Employees } from "./employees.jsx";
export { Teams } from "./structure.jsx";
export { Cohorts } from "./cohorts.jsx";
