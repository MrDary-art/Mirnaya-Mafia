import { useState } from "react";
import { api } from "../api.js";
import { useEffect, Notice, formatDate } from "./shared.jsx";

const fields = {
  teams: [["webhook_url", "Webhook URL"]], slack: [["webhook_url", "Webhook URL"]],
  webhook: [["webhook_url", "Webhook URL"]],
  hris: [["base_url", "Адрес HRIS"], ["api_token", "API токен", true]],
  lms: [["base_url", "Адрес LMS"], ["client_id", "Client ID"], ["client_secret", "Client secret", true]],
  crm: [["base_url", "Адрес CRM"], ["api_token", "API токен", true]],
  calendar: [["base_url", "Адрес календаря"], ["api_token", "API токен", true]],
  sso_oidc: [["issuer", "Issuer URL"], ["client_id", "Client ID"], ["client_secret", "Client secret", true]],
  sso_saml: [["metadata_url", "Metadata URL"], ["entity_id", "Entity ID"], ["certificate", "Сертификат", true]],
};
const statusLabel = { NOT_CONFIGURED:"Не настроено", INCOMPLETE:"Нужны данные", CONFIGURED:"Конфигурация готова", ERROR:"Ошибка" };

export function Integrations({ data }) {
  const [items,setItems]=useState([]), [runs,setRuns]=useState([]), [selected,setSelected]=useState(""), [form,setForm]=useState({});
  const [error,setError]=useState(""), [note,setNote]=useState(""), [busy,setBusy]=useState(false);
  const load = () => Promise.all([
    api(`/api/company/${data.company.id}/integrations`),
    api(`/api/company/${data.company.id}/integrations/runs`),
  ]).then(([integrations,history]) => { setItems(integrations); setRuns(history); }).catch(cause => setError(cause.message));
  useEffect(load,[data.company.id]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setNote("");
    try {
      await api(`/api/company/${data.company.id}/integrations/${selected}`, {method:"PUT",body:{enabled:true,settings:form}});
      setSelected(""); setForm({}); setNote("Конфигурация зашифрована и сохранена. Выполните локальную проверку."); await load();
    } catch(cause){setError(cause.message);} finally{setBusy(false);}
  }
  async function check(provider) {
    setBusy(true); setError(""); setNote("");
    try { const result=await api(`/api/company/${data.company.id}/integrations/${provider}/check`,{method:"POST"});setNote(result.message);await load(); }
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  return <section className="space-y-5"><header><div className="eyebrow">ВНЕШНИЕ СИСТЕМЫ</div><h2 className="mt-2 text-3xl font-bold">Интеграции</h2><p className="mt-3 text-slate-400">SSO, HRIS, LMS, CRM, календари и уведомления подключаются отдельными учётными данными. «Конфигурация готова» означает проверку полей, а не успешный обмен с провайдером.</p></header>
    {error&&<Notice tone="red">{error}</Notice>}{note&&<Notice>{note}</Notice>}
    <div className="grid gap-4 md:grid-cols-2">{items.map(item=><article key={item.provider} className="glass rounded-3xl p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-xl font-bold">{item.label}</h3><span className="text-sm text-lime-200">{statusLabel[item.status]||item.status}</span></div><p className="mt-3 text-sm text-slate-400">{item.capabilities.join(" · ")}</p>{item.last_error&&<p className="mt-2 text-sm text-rose-200">{item.last_error}</p>}<div className="mt-4 flex flex-wrap gap-3"><button className="subtle-button" onClick={()=>{setSelected(item.provider);setForm({});}}>Настроить</button>{item.configured&&<button disabled={busy} className="subtle-button" onClick={()=>check(item.provider)}>Проверить</button>}</div></article>)}</div>
    {selected&&<form className="glass space-y-4 rounded-3xl p-5" onSubmit={save}><h3 className="text-xl font-bold">{items.find(item=>item.provider===selected)?.label}</h3>{fields[selected].map(([key,label,secret])=><label className="block" key={key}>{label}<input required type={secret?"password":(["webhook_url","base_url","issuer","metadata_url"].includes(key)?"url":"text")} autoComplete="off" className="company-input" value={form[key]||""} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}<p className="text-sm text-slate-400">Секреты шифруются на сервере и больше не возвращаются в браузер.</p><div className="flex flex-wrap gap-3"><button disabled={busy} className="primary-button">Сохранить</button><button type="button" className="subtle-button" onClick={()=>setSelected("")}>Отмена</button></div></form>}
    <section className="glass rounded-3xl p-5"><h3 className="text-xl font-bold">Журнал проверок</h3>{runs.length?<div className="mt-4 space-y-2">{runs.map(run=><div className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm" key={run.id}><span>{run.operation} · {run.status}</span><time className="text-slate-400">{formatDate(run.created_at)}</time></div>)}</div>:<p className="mt-3 text-slate-400">Проверок ещё не было.</p>}</section>
  </section>;
}
