import RolePicker from "./RolePicker.jsx";
import { useMemo, useRef, useState } from "react";
import { InvitationLinks } from "./invitations.jsx";
import { AttemptReport } from "./attempt-report.jsx";
import { api, apiForm } from "../api.js";
import { useEffect, statusLabels, roleLabels, companyJobTitle, ru, Loader, Empty, Notice } from "./shared.jsx";

const nullableId = value => value ? Number(value) : null;

export function Employees({ data }) {
  const companyId = data.company.id;
  const dialogRef = useRef(null), returnFocus = useRef(null);
  const canEdit = Boolean(data.permissions.manage_company);
  const canVerify = Boolean(data.permissions.manage_team || data.permissions.manage_company);
  const canInvite = (data.permissions.invite_members ?? data.permissions.manage_company) && data.company.status !== "DEMO";
  const canAssignExecutive = data.membership.role === "COMPANY_OWNER";
  const assignableRoles = Object.entries(roleLabels).filter(([key]) => key !== "COMPANY_OWNER" || canAssignExecutive);
  const [rows, setRows] = useState([]), [departments, setDepartments] = useState([]);
  const [q, setQ] = useState(""), [department, setDepartment] = useState(""), [role, setRole] = useState("");
  const [visibleEmployeeCount, setVisibleEmployeeCount] = useState(5);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [inviteOpen, setInviteOpen] = useState(false), [inviteMode, setInviteMode] = useState("account");
  const [invite, setInvite] = useState({ username: "", department_id: "", job_title: "", corporate_role: "EMPLOYEE" });
  const [customDepartment, setCustomDepartment] = useState("");
  const [importResult, setImportResult] = useState(null), [pendingFile, setPendingFile] = useState(null);
  const [selected, setSelected] = useState(null), [details, setDetails] = useState(null), [detailError, setDetailError] = useState("");
  const canEditSelected = canEdit && (selected?.role !== "COMPANY_OWNER" || canAssignExecutive);
  const [edit, setEdit] = useState(null), [commentDrafts, setCommentDrafts] = useState({}), [deactivate, setDeactivate] = useState(false);
  const activePeople = rows.filter(person => person.status === "ACTIVE");
  const invitedPeople = rows.filter(person => ["INVITED", "PENDING"].includes(person.status));
  const suspendedPeople = rows.filter(person => person.status === "SUSPENDED");
  const visibleRows = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("ru");
    return rows.filter(person => (!department || String(person.department_id) === department) && (!role || person.role === role) && (!query || [person.name, person.username, person.job_title].some(value => value?.toLocaleLowerCase("ru").includes(query))));
  }, [rows, q, department, role]);
  const displayedRows = visibleRows.slice(0, visibleEmployeeCount);
  useEffect(() => { setVisibleEmployeeCount(5); }, [q, department, role, companyId]);
  async function load() {
    try {
      const [people, deps] = await Promise.all([api(`/api/company/${companyId}/employees`), api(`/api/company/${companyId}/departments`)]);
      setRows(people.map(person => ({ ...person, job_title: companyJobTitle(person) }))); setDepartments(deps); setLoaded(true);
    } catch (cause) { setError(cause.message); }
  }
  useEffect(() => { setLoaded(false); load(); }, [companyId]);
  useEffect(() => {
    if (!selected) return;
    const previousFocus = returnFocus.current, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function trap(event) {
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])].filter(element => element.getClientRects().length);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); };
  }, [selected?.membership_id]);

  async function sendInvite(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      let departmentId = nullableId(invite.department_id === "__new" ? "" : invite.department_id);
      if (invite.department_id === "__new") {
        const name = customDepartment.trim();
        if (!name) throw new Error("Введите название нового подразделения.");
        const existing = departments.find(d => d.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"));
        const created = existing || await api(`/api/company/${companyId}/departments`, { method: "POST", body: { name } });
        departmentId = created.id;
        setDepartments(all => all.some(d => d.id === created.id) ? all : [...all, created]);
        setInvite(old => ({ ...old, department_id: String(created.id) }));
      }
      await api(`/api/company/${companyId}/employees/invite`, { method: "POST", body: { ...invite, department_id: departmentId } }); setInvite(old => ({ ...old, username: "" })); setInviteOpen(false); setNote("Приглашение отправлено. Сотрудник должен подтвердить вступление."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function importCsv(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", file); setImportResult(await apiForm(`/api/company/${companyId}/employees/import-csv/preview`, form)); setPendingFile(file); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); event.target.value = ""; }
  }
  async function confirmImport() {
    if (!pendingFile) return; setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", pendingFile); setImportResult(await apiForm(`/api/company/${companyId}/employees/import-csv`, form)); setPendingFile(null); setNote("CSV обработан. Приглашённые сотрудники подтверждают вступление сами."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function openEmployee(person) {
    returnFocus.current = document.activeElement;
    setSelected(person); setDetails(null); setDetailError(""); setDeactivate(false);
    setEdit({ job_title: person.job_title || "", corporate_role: person.role, department_id: person.department_id || "", manager_membership_id: person.manager_membership_id || "", mentor_membership_id: person.mentor_membership_id || "" });
    try { setDetails(await api(`/api/company/${companyId}/employees/${person.membership_id}/overview`)); }
    catch (cause) { setDetailError(cause.message); }
  }
  async function saveEmployee(event) {
    event.preventDefault(); setBusy(true); setDetailError("");
    try {
      await api(`/api/company/${companyId}/employees/${selected.membership_id}`, { method: "PUT", body: { ...edit, department_id: nullableId(edit.department_id), manager_membership_id: nullableId(edit.manager_membership_id), mentor_membership_id: nullableId(edit.mentor_membership_id) } });
      setNote("Должность, доступ и связи сотрудника сохранены."); setSelected(null); await load();
    } catch (cause) { setDetailError(cause.message); } finally { setBusy(false); }
  }
  async function changeStatus(status) {
    setBusy(true); setDetailError("");
    try { await api(`/api/company/${companyId}/employees/${selected.membership_id}`, { method: "PUT", body: { status } }); setSelected(null); setNote(status === "SUSPENDED" ? "Доступ сотрудника приостановлен. История обучения сохранена." : "Доступ сотрудника восстановлен."); await load(); }
    catch (cause) { setDetailError(cause.message); } finally { setBusy(false); }
  }
  async function verifyProfessionalLevel() {
    const level = details?.professional_profile?.professional_level;
    if (!level) return;
    setBusy(true); setDetailError("");
    try {
      await api(`/api/company/${companyId}/employees/${selected.membership_id}/verify-professional-level`, { method: "POST", body: { professional_level: Number(level) } });
      setDetails(await api(`/api/company/${companyId}/employees/${selected.membership_id}/overview`));
      setNote("Профессиональный уровень сотрудника подтверждён.");
    } catch (cause) { setDetailError(cause.message); } finally { setBusy(false); }
  }
  async function addComment(attemptId) {
    const text = commentDrafts[attemptId]?.trim(); if (!text) return;
    setBusy(true);
    try { await api(`/api/company/${companyId}/attempts/${attemptId}/comments`, { method: "POST", body: { text } }); setCommentDrafts({ ...commentDrafts, [attemptId]: "" }); setDetails(await api(`/api/company/${companyId}/employees/${selected.membership_id}/overview`)); }
    catch (cause) { setDetailError(cause.message); } finally { setBusy(false); }
  }
  if (!loaded && !error) return <Loader />;
  return <section className="business-employees-page space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="mt-2 text-3xl font-bold">Сотрудники</h2></div>{canInvite && <button type="button" className="primary-button" aria-expanded={inviteOpen} aria-controls="company-add-employee" onClick={() => setInviteOpen(!inviteOpen)}>{inviteOpen ? "Закрыть" : "Добавить сотрудника"}</button>}</header>
    {data.company.status === "DEMO" && <Notice>В демо можно управлять подготовленной командой. Приглашения реальных сотрудников и импорт CSV доступны в собственной компании.</Notice>}
    {error && <Notice tone="red">{error}</Notice>}{note && <Notice>{note}</Notice>}
    <dl className="business-people-summary" aria-label="Состояние команды"><div><dt>Активные</dt><dd>{activePeople.length}</dd></div><div><dt>Приглашены</dt><dd>{invitedPeople.length}</dd></div><div><dt>Доступ приостановлен</dt><dd>{suspendedPeople.length}</dd></div></dl>
    {canInvite && inviteOpen && <section id="company-add-employee" className="business-employee-add glass rounded-3xl p-5">
      <nav className="business-invite-method-tabs" role="tablist" aria-label="Способ добавления сотрудника">
        {[["account", "По логину"], ["link", "По ссылке"], ["csv", "Из CSV"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={inviteMode === key} className={inviteMode === key ? "is-active" : ""} onClick={() => setInviteMode(key)}>{label}</button>)}
      </nav>
      {inviteMode === "account" && <form onSubmit={sendInvite} className="business-invite-method-panel grid gap-3 md:grid-cols-2" role="tabpanel"><label>Логин Arena<input required minLength={2} className="company-input" value={invite.username} onChange={event => setInvite({ ...invite, username: event.target.value })} /></label><label>Должность<input required className="company-input" value={invite.job_title} onChange={event => setInvite({ ...invite, job_title: event.target.value })} /></label><label>Подразделение<select aria-label="Подразделение" className="company-input" value={invite.department_id} onChange={event => setInvite({ ...invite, department_id: event.target.value })}><option value="">Без подразделения</option>{canEdit && <option value="__new">+ Ввести своё подразделение</option>}{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{invite.department_id === "__new" && <input aria-label="Название нового подразделения" className="company-input" required maxLength={160} value={customDepartment} onChange={e => setCustomDepartment(e.target.value)} placeholder="Например, цветочная мастерская" />}</label><div><span>Роль доступа</span><RolePicker value={invite.corporate_role} onChange={corporate_role => setInvite({ ...invite, corporate_role })} options={assignableRoles} /></div><p className="text-sm text-slate-400 md:col-span-2">Должность описывает работу человека, роль определяет доступ. Личные тренировки остаются приватными.</p><button disabled={busy} className="primary-button w-fit">Отправить приглашение</button></form>}
      {inviteMode === "link" && <div className="business-invite-method-panel" role="tabpanel"><InvitationLinks data={data} departments={departments} embedded /></div>}
      {inviteMode === "csv" && <div className="business-invite-method-panel" role="tabpanel"><h3>Массовое добавление</h3><p className="mt-2 text-sm text-slate-400">Загрузите CSV с колонками username, department, job_title, corporate_role. Перед отправкой покажем найденные ошибки.</p><label className="subtle-button mt-4 inline-block cursor-pointer">{busy ? "Обработка…" : "Выбрать CSV"}<input className="business-hidden-file-input" type="file" accept=".csv,text/csv" disabled={busy} onChange={importCsv} /></label>{importResult && <div className="mt-4 text-sm"><b>{pendingFile ? "Предпросмотр" : "Результат"}: {importResult.processed} строк</b><div className="mt-3 max-h-48 space-y-1 overflow-auto">{importResult.rows?.map(item => <p key={item.line} className={item.status === "ERROR" ? "text-rose-300" : "text-slate-300"}>Строка {item.line}: @{item.username || "—"} · {statusLabels[item.status] || item.status}{item.reason ? `: ${item.reason}` : ""}</p>)}</div></div>}{pendingFile && <button type="button" className="primary-button mt-4" disabled={busy || !importResult?.ready} onClick={confirmImport}>Подтвердить отправку приглашений</button>}</div>}
    </section>}
    <div className="glass rounded-3xl p-5"><div className="grid gap-3 md:grid-cols-3"><label>Поиск<input type="search" className="company-input" placeholder="Имя, логин или должность" value={q} onChange={event => setQ(event.target.value)} /></label><label>Подразделение<select aria-label="Подразделение" className="company-input" value={department} onChange={event => setDepartment(event.target.value)}><option value="">Все доступные подразделения</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Роль доступа<select aria-label="Роль доступа" className="company-input" value={role} onChange={event => setRole(event.target.value)}><option value="">Все роли</option>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <div className="relative mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-3">Сотрудник</th><th>Должность</th><th>Подразделение</th><th>Роль доступа</th><th>Статус</th><th aria-label="Действия" /></tr></thead><tbody>{displayedRows.map(person => <tr key={person.membership_id} className="border-t border-white/10"><td className="p-3"><b>{person.name}</b><small className="block text-slate-500">@{person.username}</small></td><td>{person.job_title || "—"}</td><td>{person.department || "Не назначено"}</td><td>{person.role_label || roleLabels[person.role]}</td><td>{statusLabels[person.status] || person.status}</td><td><button type="button" className="subtle-button py-2" aria-label={`Открыть карточку ${person.name}`} onClick={() => openEmployee(person)}>Открыть</button></td></tr>)}</tbody></table></div>{!visibleRows.length && <Empty>{rows.length ? "По этим условиям сотрудники не найдены." : "Пригласите первого сотрудника в компанию."}</Empty>}
      {visibleRows.length > 5 && <div className="business-employees-list-footer"><span>Показано {displayedRows.length} из {visibleRows.length}</span><button type="button" className="subtle-button" aria-expanded={visibleEmployeeCount > 5} onClick={() => setVisibleEmployeeCount(count => count >= visibleRows.length ? 5 : Math.min(count + 5, visibleRows.length))}>{visibleEmployeeCount >= visibleRows.length ? "Свернуть" : `Показать ещё ${Math.min(5, visibleRows.length - visibleEmployeeCount)}`}</button></div>}
    </div>
    {selected && <section role="dialog" aria-modal="true" aria-label={`Сотрудник ${selected.name}`} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-4" onMouseDown={() => setSelected(null)} onKeyDown={event => { if (event.key === "Escape") setSelected(null); }}><article ref={dialogRef} className="glass max-h-[85vh] w-full max-w-3xl overflow-auto rounded-3xl p-6" onMouseDown={event => event.stopPropagation()}><button autoFocus type="button" className="subtle-button float-right" onClick={() => setSelected(null)}>Закрыть</button><h3 className="pr-24 text-2xl font-bold">{selected.name}</h3><p className="mt-2 text-slate-400">@{selected.username} · {statusLabels[selected.status]}</p>{detailError && <div className="mt-4"><Notice tone="red">{detailError}</Notice></div>}
      {canEditSelected && edit && <form onSubmit={saveEmployee} className="mt-5 grid gap-3 md:grid-cols-2"><label>Должность<input className="company-input" value={edit.job_title} onChange={event => setEdit({ ...edit, job_title: event.target.value })} /></label><label>Роль доступа<select aria-label="Роль доступа" className="company-input" value={edit.corporate_role} onChange={event => setEdit({ ...edit, corporate_role: event.target.value })}>{assignableRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Подразделение<select aria-label="Подразделение" className="company-input" value={edit.department_id} onChange={event => setEdit({ ...edit, department_id: event.target.value })}><option value="">Без подразделения</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{[["manager_membership_id", "Руководитель"], ["mentor_membership_id", "Наставник"]].map(([key, label]) => <label key={key}>{label}<select aria-label={label} className="company-input" value={edit[key]} onChange={event => setEdit({ ...edit, [key]: event.target.value })}><option value="">Не назначен</option>{activePeople.filter(person => person.membership_id !== selected.membership_id).map(person => <option key={person.membership_id} value={person.membership_id}>{person.name}</option>)}</select></label>)}<button disabled={busy} className="primary-button w-fit md:col-span-2">Сохранить сотрудника</button></form>}
      {canEdit && selected.membership_id !== data.membership.id && selected.status === "ACTIVE" && <div className="mt-5">{!deactivate ? <button type="button" className="subtle-button" onClick={() => setDeactivate(true)}>Приостановить доступ</button> : <div className="rounded-xl border border-amber-300/30 p-4"><p>Приостановить доступ {selected.name}? История обучения сохранится. Если у сотрудника есть подчинённые, сначала назначьте им нового руководителя.</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="primary-button" onClick={() => changeStatus("SUSPENDED")}>Подтвердить приостановку</button><button className="subtle-button" onClick={() => setDeactivate(false)}>Отмена</button></div></div>}</div>}
      {canEdit && selected.status === "SUSPENDED" && <button disabled={busy} className="subtle-button mt-5" onClick={() => changeStatus("ACTIVE")}>Восстановить доступ</button>}
      {!details && !detailError && <div className="mt-5"><Loader /></div>}{details && <><div className="employee-professional-summary"><div><span>Профессия</span><b>{details.professional_profile?.profession?.title || "Не выбрана"}</b></div><div><span>Специальность</span><b>{details.professional_profile?.specialty?.title || "Не выбрана"}</b></div><div><span>Профессиональный уровень</span><b>{details.professional_profile?.professional_level || 1} из 10</b></div><div><span>Подтверждение</span><b>{details.professional_profile?.level_verified ? "Подтверждён" : "Ожидает руководителя"}</b></div>{canVerify && details.professional_profile?.profession && !details.professional_profile?.level_verified && <button type="button" className="subtle-button" disabled={busy} onClick={verifyProfessionalLevel}>Подтвердить уровень</button>}</div><div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4">{[["assigned", "Назначено"], ["completed", "Завершено"], ["average_score", "Средний результат"], ["best_score", "Лучший результат"]].map(([key, label]) => <div key={key} className="rounded-xl bg-white/5 p-3"><b>{details.summary[key] ?? "—"}</b><p className="text-sm text-slate-400">{label}</p></div>)}</div><h4 className="mt-6 text-xl font-bold">Корпоративные результаты</h4>{details.attempts?.map(attempt => <article key={attempt.id} className="mt-3 rounded-xl border border-white/10 p-4"><b>{attempt.assignment_title}</b><p className="mt-2">Результат: {attempt.score ?? "—"}/100</p><div className="mt-3 space-y-2">{attempt.comments?.map(comment => <p key={comment.id} className="rounded-lg bg-lime-300/10 p-2 text-sm"><b>Комментарий руководителя: </b>{comment.text}</p>)}</div><label className="mt-3 block text-sm">Комментарий к попытке<textarea className="company-input" rows={2} value={commentDrafts[attempt.id] || ""} onChange={event => setCommentDrafts({ ...commentDrafts, [attempt.id]: event.target.value })} /></label><button disabled={busy || !commentDrafts[attempt.id]?.trim()} className="subtle-button mt-2" onClick={() => addComment(attempt.id)}>Отправить комментарий</button></article>)}{!details.attempts?.length && <p className="mt-3 text-slate-400">Завершённых корпоративных попыток пока нет.</p>}</>}
    </article></section>}
  </section>;
}

