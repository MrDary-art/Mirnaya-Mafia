import { useMemo, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { api } from "../api.js";
import { useEffect, Loader, Empty, Notice } from "./shared.jsx";

const emptyDepartment = { name: "", description: "", parent_department_id: "", manager_membership_id: "" };
const nullableId = value => value ? Number(value) : null;

export function Teams({ data }) {
  const companyId = data.company.id;
  const canEdit = Boolean(data.permissions.manage_structure || data.permissions.manage_company);
  const [departments, setDepartments] = useState([]), [people, setPeople] = useState([]), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""), [note, setNote] = useState(""), [q, setQ] = useState(""), [jobTitle, setJobTitle] = useState("");
  const [draft, setDraft] = useState(null), [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null), [destination, setDestination] = useState(""), [busy, setBusy] = useState(false);
  const [distribution, setDistribution] = useState({ membership_id: "", department_id: "" });
  const departmentsDisclosure = useRef(null);
  useEffect(() => {
    if (departmentsDisclosure.current && (q.trim() || jobTitle)) departmentsDisclosure.current.open = true;
  }, [q, jobTitle]);
  async function load() {
    try { const [deps, employees] = await Promise.all([api(`/api/company/${companyId}/departments`), api(`/api/company/${companyId}/employees`)]); setDepartments(deps); setPeople(employees); setLoaded(true); }
    catch (cause) { setError(cause.message); }
  }
  useEffect(() => { setLoaded(false); load(); }, [companyId]);
  const jobs = [...new Set(people.map(person => person.job_title).filter(Boolean))].sort();
  const activePeople = people.filter(person => person.status === "ACTIVE");
  const byId = useMemo(() => new Map(departments.map(item => [item.id, item])), [departments]);
  const children = useMemo(() => {
    const result = new Map();
    departments.forEach(item => { const parent = byId.has(item.parent_department_id) ? item.parent_department_id : null; result.set(parent, [...(result.get(parent) || []), item]); });
    return result;
  }, [departments, byId]);
  function descendants(id, visited = new Set()) {
    if (visited.has(id)) return visited;
    visited.add(id); (children.get(id) || []).forEach(child => descendants(child.id, visited)); return visited;
  }
  const visibleDepartments = useMemo(() => {
    if (!q.trim() && !jobTitle) return null;
    const matches = new Set(), query = q.trim().toLocaleLowerCase("ru");
    for (const dep of departments) {
      const matchingPeople = people.filter(person => person.department_id === dep.id && (!jobTitle || person.job_title === jobTitle) && (!query || [person.name, person.username, person.job_title].some(value => value?.toLocaleLowerCase("ru").includes(query))));
      if (matchingPeople.length || (!jobTitle && dep.name.toLocaleLowerCase("ru").includes(query))) {
        let current = dep;
        const visited = new Set();
        while (current && !visited.has(current.id)) { matches.add(current.id); visited.add(current.id); current = byId.get(current.parent_department_id); }
      }
    }
    return matches;
  }, [q, jobTitle, departments, people, byId]);
  const orderedDepartments = useMemo(() => {
    const result = [], visited = new Set();
    function visit(department) {
      if (!department || visited.has(department.id)) return;
      visited.add(department.id);
      result.push(department);
      (children.get(department.id) || []).forEach(visit);
    }
    (children.get(null) || []).forEach(visit);
    departments.forEach(visit);
    return result;
  }, [departments, children]);
  function editDepartment(department = null) {
    setEditingId(department?.id ?? null);
    setDraft(department ? { name: department.name, description: department.description || "", parent_department_id: department.parent_department_id || "", manager_membership_id: department.manager_membership_id || "" } : { ...emptyDepartment });
    setDeleting(null); setError("");
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/company/${companyId}/departments${editingId ? `/${editingId}` : ""}`, { method: editingId ? "PUT" : "POST", body: { ...draft, parent_department_id: nullableId(draft.parent_department_id), manager_membership_id: nullableId(draft.manager_membership_id) } }); setDraft(null); setNote(editingId ? "Подразделение обновлено." : "Подразделение создано."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function remove(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/company/${companyId}/departments/${deleting.id}`, { method: "DELETE", body: { move_members_to_department_id: nullableId(destination) } }); setDeleting(null); setNote("Подразделение удалено. Сотрудники и дочерние подразделения переведены, история обучения сохранена."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function assignDepartment(event) {
    event.preventDefault();
    if (!distribution.membership_id || !distribution.department_id) return;
    setBusy(true); setError("");
    try {
      await api(`/api/company/${companyId}/employees/${distribution.membership_id}`, { method: "PUT", body: { department_id: Number(distribution.department_id) } });
      setDistribution({ membership_id: "", department_id: "" });
      setNote("Сотрудник добавлен в подразделение.");
      await load();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  function scrollToDepartment(id) {
    const target = document.querySelector(`[data-department-id="${id}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }
  function renderDepartment(department) {
    if (visibleDepartments && !visibleDepartments.has(department.id)) return null;
    const members = people.filter(person => person.department_id === department.id);
    const manager = people.find(person => person.membership_id === department.manager_membership_id);
    const parent = byId.get(department.parent_department_id);
    const nested = children.get(department.id) || [];
    return <li key={department.id} className="business-department-node">
      <article className="business-department-card" data-department-id={department.id} tabIndex={-1}>
        <header className="business-department-card-header">
          <div className="business-department-heading">
            <div><span className="business-management-eyebrow">{parent ? `В составе · ${parent.name}` : "Напрямую в компании"}</span><h3>{department.name}</h3></div>
          </div>
          {canEdit && <div className="business-department-actions"><button type="button" className="subtle-button" onClick={() => editDepartment(department)}>Изменить</button><button type="button" className="subtle-button" onClick={() => { setDraft(null); setDeleting(department); setDestination(""); setError(""); }}>Удалить</button></div>}
        </header>
        {department.description && <p className="business-department-description">{department.description}</p>}
        <dl className="business-department-facts">
          <div><dt>Руководитель</dt><dd>{manager?.name || "Не назначен"}</dd></div>
          <div><dt>Сотрудников</dt><dd>{members.length}</dd></div>
          <div><dt>Подчиняется</dt><dd>{parent?.name || data.company.name}</dd></div>
        </dl>
        {nested.length > 0 && <div className="business-department-relations"><span>Включает</span><div>{nested.map(child => <button type="button" key={child.id} onClick={() => scrollToDepartment(child.id)}>{child.name}</button>)}</div></div>}
        {members.length > 0 && <details className="business-department-members"><summary>Показать сотрудников <span>{members.length}</span></summary><ul className="business-department-member-grid">{members.map(member => <li key={member.membership_id} className="business-department-member"><b>{member.name}</b><span>{member.job_title || "Должность не указана"}</span></li>)}</ul></details>}
      </article>
    </li>;
  }
  if (!loaded && !error) return <Loader />;
  const excluded = editingId ? descendants(editingId) : new Set();
  const deleteExcluded = deleting ? descendants(deleting.id) : new Set();
  const unassigned = people.filter(person => !person.department_id && (!jobTitle || person.job_title === jobTitle) && (!q.trim() || [person.name, person.username, person.job_title].some(value => value?.toLocaleLowerCase("ru").includes(q.trim().toLocaleLowerCase("ru")))));
  return <section className="business-structure-page space-y-5"><header className="business-structure-header"><div><h2>Подразделения</h2><p>{departments.length} подразделений · {activePeople.length} активных сотрудников</p></div>{canEdit && <button className="primary-button" onClick={() => editDepartment()}>Создать подразделение</button>}</header>{error && <Notice tone="red">{error}</Notice>}{note && <Notice>{note}</Notice>}
    {draft && <form onSubmit={save} className="glass grid gap-4 rounded-3xl p-5 md:grid-cols-2"><h3 className="text-xl font-bold md:col-span-2">{editingId ? "Изменить подразделение" : "Новое подразделение"}</h3><label>Название<input required minLength={2} maxLength={160} className="company-input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Родительское подразделение<select aria-label="Родительское подразделение" className="company-input" value={draft.parent_department_id} onChange={event => setDraft({ ...draft, parent_department_id: event.target.value })}><option value="">Напрямую в компании</option>{departments.filter(item => !excluded.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Руководитель<select aria-label="Руководитель" className="company-input" value={draft.manager_membership_id} onChange={event => setDraft({ ...draft, manager_membership_id: event.target.value })}><option value="">Не назначен</option>{activePeople.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select></label><label>Описание<textarea className="company-input" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><button disabled={busy} className="primary-button">Сохранить подразделение</button><button type="button" className="subtle-button" onClick={() => setDraft(null)}>Отмена</button></div></form>}
    {deleting && <form onSubmit={remove} className="glass rounded-3xl border border-amber-300/30 p-5"><h3 className="text-xl font-bold">Удалить «{deleting.name}»?</h3><p className="mt-3 text-slate-400">Сотрудников и дочерние подразделения нужно перевести. Их история обучения сохранится.</p><label className="mt-3 block">Перевести в<select aria-label="Перевести в" className="company-input" value={destination} onChange={event => setDestination(event.target.value)}><option value="">Напрямую в компанию</option>{departments.filter(item => !deleteExcluded.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className="primary-button">Подтвердить удаление</button><button type="button" className="subtle-button" onClick={() => setDeleting(null)}>Отмена</button></div></form>}
    <div className="business-structure-panel">
      <div className="business-structure-toolbar"><label>Поиск<input type="search" className="company-input" placeholder="Сотрудник или подразделение" value={q} onChange={event => setQ(event.target.value)} /></label><label>Должность<select aria-label="Должность" className="company-input" value={jobTitle} onChange={event => setJobTitle(event.target.value)}><option value="">Все должности</option>{jobs.map(title => <option key={title}>{title}</option>)}</select></label></div>
      <details className="business-company-departments" ref={departmentsDisclosure}>
        <summary className="business-structure-company"><span className="business-structure-company-title"><span className="business-management-eyebrow">Компания</span><b>{data.company.name}</b></span><span className="business-structure-company-toggle"><span>{departments.length} подразделений</span><CaretDownIcon size={20} aria-hidden="true" /></span></summary>
        <ul className="business-department-tree">{orderedDepartments.map(department => renderDepartment(department))}</ul>
        {!departments.length && <div className="business-structure-empty"><Empty>{canEdit ? "Создайте первое подразделение, затем добавьте команды и назначьте руководителей." : "Подразделения ещё не созданы."}</Empty></div>}
        {visibleDepartments?.size === 0 && !unassigned.length && <div className="business-structure-empty"><Empty>По этим условиям ничего не найдено.</Empty></div>}
      </details>
      {unassigned.length > 0 && <section className="business-unassigned"><header><div><span className="business-management-eyebrow">Нужно распределить</span><h3>Без подразделения · {unassigned.length}</h3><p>Назначьте подразделение, чтобы сотрудник появился в нужной команде.</p></div></header>{canEdit && <form className="business-unassigned-form" onSubmit={assignDepartment}><label>Сотрудник<select className="company-input" required value={distribution.membership_id} onChange={event => setDistribution({ ...distribution, membership_id: event.target.value })}><option value="">Выберите сотрудника</option>{unassigned.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}{person.job_title ? ` · ${person.job_title}` : ""}</option>)}</select></label><label>Подразделение<select className="company-input" required value={distribution.department_id} onChange={event => setDistribution({ ...distribution, department_id: event.target.value })}><option value="">Выберите подразделение</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary-button" disabled={busy || !departments.length}>Распределить</button></form>}{!departments.length && canEdit && <p className="business-management-note">Сначала создайте подразделение, затем вернитесь к распределению сотрудников.</p>}<ul className="business-unassigned-list">{unassigned.map(person => <li key={person.membership_id} className="business-unassigned-person"><b>{person.name}</b><span>{person.job_title || "Должность не указана"}</span></li>)}</ul></section>}
    </div>
  </section>;
}

