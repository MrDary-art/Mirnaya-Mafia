import { useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice } from "./shared.jsx";
import PageHeader from "../design/PageHeader.jsx";

export function CompanyApplicationForm({ company }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ desired_job_title: "", specialization: "", message: "" });
  const [submitted, setSubmitted] = useState(() => company.application_status === "PENDING");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/company/${company.id}/applications`, { method: "POST", body: form });
      setSubmitted(true);
      setOpen(false);
    } catch (cause) { setError(cause.message); }
  }
  return <div className="mt-4">{submitted ? <p className="text-sm text-lime-200">Заявка отправлена владельцу компании.</p> : <>{error && <p className="mb-3 text-sm text-rose-200">{error}</p>}{!open ? <button className="primary-button" onClick={() => setOpen(true)}>Подать заявку</button> : <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-lime-300/20 bg-lime-300/5 p-4"><label className="text-sm">Должность<select required className="company-input" value={form.desired_job_title} onChange={(event) => setForm({ ...form, desired_job_title: event.target.value })}><option value="">Выберите должность</option><option>Менеджер по продажам</option><option>HR-специалист</option><option>Руководитель проекта</option><option>Юрист</option><option>Специалист по закупкам</option><option>Финансовый аналитик</option><option>Маркетолог</option><option>Операционный менеджер</option><option>Другая</option></select></label><label className="text-sm">Специализация<input className="company-input" value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })} /></label><label className="text-sm">Сообщение<textarea className="company-input" rows="3" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label><div className="flex gap-3"><button className="primary-button">Отправить</button><button type="button" className="subtle-button" onClick={() => setOpen(false)}>Отмена</button></div></form>}</>}</div>;
}


export function Onboarding({ data, reload }) {
  const [mode, setMode] = useState("create");
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ name: "", industry: "", company_size: "", city: "", logo: null });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (mode === "search") api(`/api/company/search?q=${encodeURIComponent(search)}`).then(setCompanies).catch((e) => setError(e.message)); }, [mode, search]);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/company", { method: "POST", body: form }); await reload(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function invitation(id, action) { await api(`/api/company/memberships/${id}/${action}`, { method: "POST" }); await reload(); }
  function logo(event) { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/") || file.size > 350000) { setError("Выберите изображение до 350 КБ."); return; } const reader = new FileReader(); reader.onload = () => setForm((current) => ({ ...current, logo: String(reader.result) })); reader.readAsDataURL(file); }
  return <section className="space-y-6">
    <PageHeader eyebrow="Корпоративное обучение" title="Компания в Арене" description="Создавайте программы переговорной подготовки, назначайте практики и отслеживайте развитие команды. Личные тренировки сотрудников остаются приватными." />
    {data?.pending_invitations?.map((invite) => <Notice key={invite.membership_id}><b>{invite.company.name}</b> приглашает вас присоединиться.<div className="mt-1 text-slate-300">{invite.job_title} · {invite.role}</div><div className="mt-4 flex gap-3"><button className="primary-button" onClick={() => invitation(invite.membership_id, "accept")}>Принять</button><button className="subtle-button" onClick={() => invitation(invite.membership_id, "decline")}>Отклонить</button></div></Notice>)}
    <div className="flex gap-2"><button className={mode === "create" ? "primary-button" : "subtle-button"} onClick={() => setMode("create")}>Создать компанию</button><button className={mode === "search" ? "primary-button" : "subtle-button"} onClick={() => setMode("search")}>Найти компанию</button></div>
    {error && <Notice tone="red">{error}</Notice>}
    {mode === "create" ? <form onSubmit={create} className="glass grid gap-4 rounded-3xl p-6 md:grid-cols-2">
      <label className="md:col-span-2">Название компании<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="company-input" placeholder="ООО «Альфа»" /></label>
      <label>Отрасль<input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="company-input" placeholder="Информационные технологии" /></label>
      <label>Размер компании<select value={form.company_size} onChange={(e) => setForm({ ...form, company_size: e.target.value })} className="company-input"><option value="">Не выбран</option><option>1–50</option><option>51–200</option><option>201–1000</option><option>Более 1000</option></select></label>
      <label>Город<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="company-input" /></label>
      <label className="md:col-span-2">{ru("logotip kompanii")}<input type="file" accept="image/png,image/jpeg,image/webp" className="company-input" onChange={logo}/><span className="mt-1 block text-xs text-slate-400">{ru("png jpeg ili webp do 350 kb")}</span>{form.logo&&<img src={form.logo} alt={ru("predprosmotr logotipa")} className="mt-3 h-16 w-16 rounded-xl object-cover"/>}</label><div className="md:col-span-2"><button disabled={busy} className="primary-button">{busy ? "Создаём…" : "Создать пространство"}</button></div>
    </form> : <section className="glass rounded-3xl p-6"><input className="company-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название компании" />
      <div className="mt-4 grid gap-3">{companies.map((company) => <article key={company.id} className="rounded-2xl border border-white/10 p-4"><b>{company.name}</b><p className="mt-1 text-sm text-slate-400">{company.industry || "Отрасль не указана"} · {company.members} участников</p><p className="mt-3 text-xs text-slate-500">Доступ выдаёт администратор компании после проверки. Указание названия в профиле само по себе доступ не открывает.</p><CompanyApplicationForm company={company} /></article>)}</div>
    </section>}
  </section>;
}
