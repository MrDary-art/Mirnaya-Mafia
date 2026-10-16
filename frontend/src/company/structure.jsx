import { useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";
import { useEffect, Loader, Empty, Notice } from "./shared.jsx";

const emptyDepartment = { name: "", description: "", parent_department_id: "", manager_membership_id: "" };
const nullableId = value => value ? Number(value) : null;

export function Teams({ data }) {
  const companyId = data.company.id;
  const canEdit = Boolean(data.permissions.manage_structure || data.permissions.manage_company);
  const [departments, setDepartments] = useState([]), [people, setPeople] = useState([]), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""), [note, setNote] = useState(""), [q, setQ] = useState(""), [jobTitle, setJobTitle] = useState("");
  const [collapsed, setCollapsed] = useState([]), [draft, setDraft] = useState(null), [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null), [destination, setDestination] = useState(""), [busy, setBusy] = useState(false);
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
  function renderDepartment(department, path = new Set()) {
    if (path.has(department.id) || (visibleDepartments && !visibleDepartments.has(department.id))) return null;
    const branch = new Set([...path, department.id]);
    const members = people.filter(person => person.department_id === department.id);
    const manager = people.find(person => person.membership_id === department.manager_membership_id);
    const nested = children.get(department.id) || [];
    const isCollapsed = collapsed.includes(department.id) && !visibleDepartments;
    return <li key={department.id} className="min-w-0"><article className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2">{nested.length > 0 && <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15" aria-label={`${isCollapsed ? "Развернуть" : "Свернуть"} ${department.name}`} aria-expanded={!isCollapsed} onClick={() => setCollapsed(isCollapsed ? collapsed.filter(id => id !== department.id) : [...collapsed, department.id])}>{isCollapsed ? "+" : "−"}</button>}<h3 className="break-words text-lg font-bold">{department.name}</h3></div><p className="mt-2 text-sm text-slate-400">{members.length} сотрудников · {nested.length} дочерних подразделений</p><p className="mt-1 text-sm">Руководитель: {manager?.name || "Не назначен"}</p>{department.description && <p className="mt-2 text-sm text-slate-400">{department.description}</p>}</div>{canEdit && <div className="flex flex-wrap gap-2"><button className="subtle-button" onClick={() => editDepartment(department)}>Изменить</button><button className="subtle-button" onClick={() => { setDraft(null); setDeleting(department); setDestination(""); setError(""); }}>Удалить</button></div>}</div>{members.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm text-lime-200">Участники подразделения</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{members.map(member => <li key={member.membership_id} className="rounded-xl border border-white/10 p-3"><b className="block text-sm">{member.name}</b><span className="block text-xs text-slate-400">{member.job_title || "Должность не указана"}</span></li>)}</ul></details>}</article>{nested.length > 0 && !isCollapsed && <ul className="ml-2 mt-3 space-y-3 border-l border-lime-300/20 pl-3 sm:ml-5 sm:pl-5">{nested.map(child => renderDepartment(child, branch))}</ul>}</li>;
  }
  if (!loaded && !error) return <Loader />;
  const excluded = editingId ? descendants(editingId) : new Set();
  const deleteExcluded = deleting ? descendants(deleting.id) : new Set();
  const rootDepartments = children.get(null) || [];
  const unassigned = people.filter(person => !person.department_id && (!jobTitle || person.job_title === jobTitle) && (!q.trim() || [person.name, person.username, person.job_title].some(value => value?.toLocaleLowerCase("ru").includes(q.trim().toLocaleLowerCase("ru")))));
  return <section className="business-structure-page space-y-5"><header className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="mt-2 text-3xl font-bold">Оргструктура</h2><p className="mt-2 text-slate-400">{departments.length} подразделений · {people.length} сотрудников в доступной области</p></div>{canEdit && <button className="primary-button" onClick={() => editDepartment()}>Создать подразделение</button>}</header>{error && <Notice tone="red">{error}</Notice>}{note && <Notice>{note}</Notice>}
    {draft && <form onSubmit={save} className="glass grid gap-4 rounded-3xl p-5 md:grid-cols-2"><h3 className="text-xl font-bold md:col-span-2">{editingId ? "Изменить подразделение" : "Новое подразделение"}</h3><label>Название<input required minLength={2} maxLength={160} className="company-input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Родительское подразделение<select aria-label="Родительское подразделение" className="company-input" value={draft.parent_department_id} onChange={event => setDraft({ ...draft, parent_department_id: event.target.value })}><option value="">Напрямую в компании</option>{departments.filter(item => !excluded.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Руководитель<select aria-label="Руководитель" className="company-input" value={draft.manager_membership_id} onChange={event => setDraft({ ...draft, manager_membership_id: event.target.value })}><option value="">Не назначен</option>{activePeople.map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select></label><label>Описание<textarea className="company-input" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><button disabled={busy} className="primary-button">Сохранить подразделение</button><button type="button" className="subtle-button" onClick={() => setDraft(null)}>Отмена</button></div></form>}
    {deleting && <form onSubmit={remove} className="glass rounded-3xl border border-amber-300/30 p-5"><h3 className="text-xl font-bold">Удалить «{deleting.name}»?</h3><p className="mt-3 text-slate-400">Сотрудников и дочерние подразделения нужно перевести. Их история обучения сохранится.</p><label className="mt-3 block">Перевести в<select aria-label="Перевести в" className="company-input" value={destination} onChange={event => setDestination(event.target.value)}><option value="">Напрямую в компанию</option>{departments.filter(item => !deleteExcluded.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className="primary-button">Подтвердить удаление</button><button type="button" className="subtle-button" onClick={() => setDeleting(null)}>Отмена</button></div></form>}
    <div className="business-structure-panel glass rounded-3xl p-5"><div className="business-filter-grid grid gap-3 md:grid-cols-2"><label>Поиск<input type="search" className="company-input" placeholder="Сотрудник или подразделение" value={q} onChange={event => setQ(event.target.value)} /></label><label>Должность<select aria-label="Должность" className="company-input" value={jobTitle} onChange={event => setJobTitle(event.target.value)}><option value="">Все должности</option>{jobs.map(title => <option key={title}>{title}</option>)}</select></label></div><div className="business-structure-root mt-5 rounded-2xl border border-lime-300/25 bg-lime-300/5 p-5"><b className="text-xl">{data.company.name}</b><p className="mt-2 text-sm text-slate-400">Должности и рабочие связи не изменяют роль доступа.</p></div><ul className="mt-4 space-y-3">{rootDepartments.map(department => renderDepartment(department))}</ul>{!departments.length && <div className="mt-4"><Empty>{canEdit ? "Создайте первое подразделение, затем добавьте команды и назначьте руководителей." : "Подразделения ещё не созданы."}</Empty></div>}{visibleDepartments?.size === 0 && !unassigned.length && <div className="mt-4"><Empty>По этим условиям ничего не найдено.</Empty></div>}{unassigned.length > 0 && <details className="business-unassigned mt-5 rounded-2xl border border-dashed border-white/15 p-4"><summary className="cursor-pointer">Без подразделения · {unassigned.length}</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{unassigned.map(person => <li key={person.membership_id} className="text-sm"><b>{person.name}</b><span className="ml-2 text-slate-400">{person.job_title}</span></li>)}</ul></details>}</div>
  </section>;
}

