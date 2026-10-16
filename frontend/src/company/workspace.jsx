import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Loader, Notice } from "./shared.jsx";

function Heading({ title, text, action }) {
  return <header className="enterprise-heading"><div><h2>{title}</h2>{text && <p>{text}</p>}</div>{action}</header>;
}

function Field({ label, children, hint }) {
  return <label className="enterprise-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Status({ children }) { return children ? <Notice>{children}</Notice> : null; }

async function settle(requests) {
  const results = await Promise.allSettled(requests);
  const rejected = results.find(item => item.status === "rejected");
  if (rejected) throw rejected.reason;
  return results.map(item => item.value);
}

export function ProfessionalWorkspace({ data }) {
  const companyId = data.company.id;
  const [profile, setProfile] = useState(null), [catalog, setCatalog] = useState(null), [specialties, setSpecialties] = useState([]);
  const [form, setForm] = useState({ profession_id: "", specialty_id: "", professional_level: 1, share_results: false });
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [nextProfile, nextCatalog, nextSpecialties] = await settle([
        api(`/api/company/${companyId}/me/professional-profile`), api(`/api/company/${companyId}/catalog`), api(`/api/company/${companyId}/catalog/specialties`),
      ]);
      setProfile(nextProfile); setCatalog(nextCatalog); setSpecialties(nextSpecialties);
      setForm({ profession_id: nextProfile.profession?.id || "", specialty_id: nextProfile.specialty?.id || "",
        professional_level: nextProfile.professional_level || 1, share_results: Boolean(nextProfile.share_results) });
    } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { load(); }, [companyId]);
  const availableSpecialties = specialties.filter(item => String(item.profession_id) === String(form.profession_id));
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await api(`/api/company/${companyId}/me/professional-profile`, { method: "PUT", body: {
        profession_id: form.profession_id ? Number(form.profession_id) : null,
        specialty_id: form.specialty_id ? Number(form.specialty_id) : null,
        professional_level: Number(form.professional_level), share_results: form.share_results, policy_version: "company-data-v1",
      }});
      setProfile(result); setMessage("Профессиональный профиль сохранён.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  if (!profile || !catalog) return <Loader />;
  return <section className="enterprise-page">
    <Heading title="Профессиональный профиль" text="Должность, специальность и подтверждённый уровень определяют рекомендации внутри вашей компании." />
    <Status>{message}</Status>
    <div className="enterprise-split">
      <form className="enterprise-surface enterprise-form" onSubmit={save}>
        <Field label="Профессия"><select className="company-input" value={form.profession_id} onChange={event => setForm({...form, profession_id:event.target.value, specialty_id:""})}><option value="">Не выбрана</option>{catalog.professions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Специальность"><select className="company-input" value={form.specialty_id} onChange={event => setForm({...form, specialty_id:event.target.value})}><option value="">Не выбрана</option>{availableSpecialties.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Профессиональный уровень" hint={profile.level_verified ? `Подтверждён руководителем ${new Date(profile.level_verified_at).toLocaleDateString()}` : "После изменения уровень потребуется подтвердить руководителю."}><input className="company-input" type="number" min="1" max="10" value={form.professional_level} onChange={event => setForm({...form, professional_level:event.target.value})} /></Field>
        <label className="enterprise-check"><input type="checkbox" checked={form.share_results} onChange={event => setForm({...form, share_results:event.target.checked})} /><span><b>Передавать корпоративные результаты компании</b><small>Личные тренировки и переписки остаются закрытыми.</small></span></label>
        <button className="primary-button" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить профиль"}</button>
      </form>
      <section className="enterprise-surface">
        <h3>Подобрано по профессии</h3>
        <div className="enterprise-recommendations"><div><b>Программы</b>{profile.recommendations.programs.length ? profile.recommendations.programs.map(item => <p key={item.id}>{item.title}</p>) : <p>Пока нет связанных программ.</p>}</div><div><b>Сценарии</b>{profile.recommendations.scenarios.length ? profile.recommendations.scenarios.map(item => <p key={item.id}>{item.title}</p>) : <p>Пока нет связанных сценариев.</p>}</div></div>
        {profile.history_restored && <p className="enterprise-restored">История профессионального профиля восстановлена после повторного найма.</p>}
      </section>
    </div>
  </section>;
}

export function ProfessionCatalog({ data }) {
  const companyId = data.company.id;
  const [catalog, setCatalog] = useState(null), [specialties, setSpecialties] = useState([]), [scenarios, setScenarios] = useState([]);
  const [profession, setProfession] = useState({code:"",title:"",description:"",catalog_version:"v1"});
  const [specialty, setSpecialty] = useState({profession_id:"",code:"",title:"",description:"",catalog_version:"v1"});
  const [binding, setBinding] = useState({profession_id:"",scenario_ids:[]});
  const [message, setMessage] = useState("");
  async function load(){try{const [c,s,sc]=await settle([api(`/api/company/${companyId}/catalog`),api(`/api/company/${companyId}/catalog/specialties`),api(`/api/company/${companyId}/scenarios`)]);setCatalog(c);setSpecialties(s);setScenarios(sc);}catch(error){setMessage(error.message)}}
  useEffect(()=>{load()},[companyId]);
  async function createProfession(event){event.preventDefault();try{await api(`/api/company/${companyId}/catalog/professions`,{method:"POST",body:profession});setProfession({...profession,code:"",title:"",description:""});setMessage("Профессия добавлена.");await load()}catch(error){setMessage(error.message)}}
  async function createSpecialty(event){event.preventDefault();try{await api(`/api/company/${companyId}/catalog/specialties`,{method:"POST",body:{...specialty,profession_id:Number(specialty.profession_id)}});setSpecialty({...specialty,code:"",title:"",description:""});setMessage("Специальность добавлена.");await load()}catch(error){setMessage(error.message)}}
  async function saveBindings(event){event.preventDefault();try{await api(`/api/company/${companyId}/catalog/professions/${binding.profession_id}/scenarios`,{method:"PUT",body:{scenario_ids:binding.scenario_ids.map(Number)}});setMessage("Сценарии профессии обновлены.")}catch(error){setMessage(error.message)}}
  if(!catalog)return <Loader/>;
  return <section className="enterprise-page"><Heading title="Профессии и специальности" text="Версионный корпоративный справочник связывает роли сотрудников с программами и практическими сценариями."/><Status>{message}</Status>
    <div className="enterprise-catalog-layout"><section className="enterprise-surface"><h3>Каталог</h3><div className="enterprise-table"><div className="enterprise-table-head"><span>Профессия</span><span>Версия</span><span>Специальности</span></div>{catalog.professions.map(item=><div className="enterprise-table-row" key={item.id}><b>{item.title}</b><span>{item.catalog_version}</span><span>{specialties.filter(s=>s.profession_id===item.id).map(s=>s.title).join(", ")||"—"}</span></div>)}</div></section>
    <div className="enterprise-stack"><form className="enterprise-surface enterprise-form" onSubmit={createProfession}><h3>Новая профессия</h3><Field label="Код"><input className="company-input" required value={profession.code} onChange={e=>setProfession({...profession,code:e.target.value})}/></Field><Field label="Название"><input className="company-input" required value={profession.title} onChange={e=>setProfession({...profession,title:e.target.value})}/></Field><Field label="Описание"><textarea className="company-input" value={profession.description} onChange={e=>setProfession({...profession,description:e.target.value})}/></Field><button className="primary-button">Добавить</button></form>
    <form className="enterprise-surface enterprise-form" onSubmit={createSpecialty}><h3>Новая специальность</h3><Field label="Профессия"><select className="company-input" required value={specialty.profession_id} onChange={e=>setSpecialty({...specialty,profession_id:e.target.value})}><option value="">Выберите</option>{catalog.professions.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></Field><Field label="Код"><input className="company-input" required value={specialty.code} onChange={e=>setSpecialty({...specialty,code:e.target.value})}/></Field><Field label="Название"><input className="company-input" required value={specialty.title} onChange={e=>setSpecialty({...specialty,title:e.target.value})}/></Field><button className="primary-button">Добавить</button></form></div></div>
    <form className="enterprise-surface enterprise-form" onSubmit={saveBindings}><h3>Сценарии для профессии</h3><Field label="Профессия"><select className="company-input" required value={binding.profession_id} onChange={e=>setBinding({...binding,profession_id:e.target.value,scenario_ids:[]})}><option value="">Выберите</option>{catalog.professions.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></Field><fieldset className="enterprise-options"><legend>Сценарии</legend>{scenarios.map(item=><label key={item.id}><input type="checkbox" checked={binding.scenario_ids.includes(String(item.id))} onChange={e=>setBinding({...binding,scenario_ids:e.target.checked?[...binding.scenario_ids,String(item.id)]:binding.scenario_ids.filter(id=>id!==String(item.id))})}/><span>{item.title}</span></label>)}</fieldset><button className="primary-button">Сохранить связи</button></form>
  </section>;
}

export function ScenarioGovernance({ data }) {
  const companyId=data.company.id; const [queue,setQueue]=useState(null),[scenarios,setScenarios]=useState([]),[selected,setSelected]=useState(""),[comment,setComment]=useState(""),[snapshots,setSnapshots]=useState([]),[compare,setCompare]=useState({left:"",right:""}),[difference,setDifference]=useState(null),[message,setMessage]=useState("");
  async function load(){try{const [q,s]=await settle([api(`/api/company/${companyId}/scenario-reviews`),api(`/api/company/${companyId}/scenarios`)]);setQueue(q);setScenarios(s)}catch(error){setMessage(error.message)}} useEffect(()=>{load()},[companyId]);
  async function choose(id){setSelected(id);setDifference(null);try{setSnapshots(await api(`/api/company/${companyId}/scenarios/${id}/snapshots`))}catch(error){setMessage(error.message)}}
  async function act(action){if(!selected)return;try{await api(`/api/company/${companyId}/scenarios/${selected}/snapshot`,{method:"POST"});await api(`/api/company/${companyId}/scenarios/${selected}/approval`,{method:"POST",body:{action,comment}});setComment("");setMessage(action==="APPROVE"?"Сценарий согласован.":action==="RETURN"?"Сценарий возвращён на доработку.":"Сценарий отправлен на согласование.");await load();await choose(selected)}catch(error){setMessage(error.message)}}
  async function compareVersions(){try{setDifference(await api(`/api/company/${companyId}/scenario-versions/compare?left_id=${compare.left}&right_id=${compare.right}`))}catch(error){setMessage(error.message)}}
  if(!queue)return <Loader/>; return <section className="enterprise-page"><Heading title="Согласование сценариев" text="Комментарии, экспертная проверка и версии остаются в одной истории."/><Status>{message}</Status><div className="enterprise-split"><section className="enterprise-surface"><h3>Очередь</h3><div className="enterprise-list">{queue.map(item=><button key={item.id} className={String(item.scenario_id)===String(selected)?"is-selected":""} onClick={()=>choose(item.scenario_id)}><span><b>{item.scenario_title}</b><small>Версия {item.version} · {item.status}</small></span><span>→</span></button>)}{!queue.length&&<p>Очередь согласования пуста.</p>}</div></section><section className="enterprise-surface enterprise-form"><h3>Решение</h3><Field label="Сценарий"><select className="company-input" value={selected} onChange={e=>choose(e.target.value)}><option value="">Выберите</option>{scenarios.map(s=><option key={s.id} value={s.id}>{s.title} · v{s.revision}</option>)}</select></Field><Field label="Комментарий проверяющего"><textarea className="company-input" value={comment} onChange={e=>setComment(e.target.value)} /></Field><div className="enterprise-actions"><button type="button" className="subtle-button" onClick={()=>act("REQUEST")}>Запросить проверку</button><button type="button" className="subtle-button" onClick={()=>act("RETURN")}>Вернуть</button><button type="button" className="primary-button" onClick={()=>act("APPROVE")}>Согласовать</button></div></section></div>
    {snapshots.length>1&&<section className="enterprise-surface enterprise-form"><h3>Сравнить версии</h3><div className="enterprise-inline"><select className="company-input" value={compare.left} onChange={e=>setCompare({...compare,left:e.target.value})}><option value="">Исходная версия</option>{snapshots.map(s=><option key={s.id} value={s.id}>Версия {s.revision}</option>)}</select><select className="company-input" value={compare.right} onChange={e=>setCompare({...compare,right:e.target.value})}><option value="">Новая версия</option>{snapshots.map(s=><option key={s.id} value={s.id}>Версия {s.revision}</option>)}</select><button type="button" className="primary-button" disabled={!compare.left||!compare.right} onClick={compareVersions}>Сравнить</button></div>{difference&&<p className="enterprise-diff">Изменены поля: {difference.changed_fields.join(", ")||"изменений нет"}</p>}</section>}
  </section>;
}

export function ModeGovernance({ data }) {
  const companyId=data.company.id; const [policies,setPolicies]=useState(null),[identity,setIdentity]=useState({organization_code:"",email_domain:"",require_verified_email:true}),[sessions,setSessions]=useState([]),[directory,setDirectory]=useState([]),[transferTo,setTransferTo]=useState(""),[confirmation,setConfirmation]=useState(""),[message,setMessage]=useState("");
  async function load(){try{const [p,i,s,d]=await settle([api(`/api/company/${companyId}/mode-policies`),api(`/api/company/${companyId}/corporate-identity`),api(`/api/company/${companyId}/active-sessions`),api(`/api/company/${companyId}/directory`)]);setPolicies(p);setIdentity({organization_code:i.organization_code||"",email_domain:i.email_domain||"",require_verified_email:i.require_verified_email});setSessions(s);setDirectory(d)}catch(error){setMessage(error.message)}} useEffect(()=>{load()},[companyId]);
  const saved=useMemo(()=>Object.fromEntries((policies?.policies||[]).map(item=>[item.mode,item])),[policies]);
  async function saveMode(mode,patch){const current=saved[mode]||{};try{await api(`/api/company/${companyId}/mode-policies/${mode}`,{method:"PUT",body:{enabled:current.enabled??true,allowed_roles:current.allowed_roles||[],allowed_departments:current.allowed_departments||[],limit_per_member:current.limit_per_member||null,voice_video_allowed:current.voice_video_allowed??true,ai_daily_limit:current.ai_daily_limit||null,voice_allowed:current.voice_allowed??true,video_allowed:current.video_allowed??true,experimental_allowed:current.experimental_allowed??false,...patch}});await load()}catch(error){setMessage(error.message)}}
  async function saveIdentity(event){event.preventDefault();try{await api(`/api/company/${companyId}/corporate-identity`,{method:"PUT",body:identity});setMessage("Корпоративный вход настроен.");await load()}catch(error){setMessage(error.message)}}
  async function transfer(){try{const result=await api(`/api/company/${companyId}/ownership-transfers`,{method:"POST",body:{to_membership_id:Number(transferTo)}});setConfirmation(result.confirmation_code);setMessage("Запрос создан. Получатель должен войти и подтвердить код.")}catch(error){setMessage(error.message)}}
  async function revoke(id){try{await api(`/api/company/${companyId}/active-sessions/${id}`,{method:"DELETE"});await load()}catch(error){setMessage(error.message)}}
  if(!policies)return <Loader/>; return <section className="enterprise-page"><Heading title="Режимы и корпоративный доступ" text="Ограничения применяются при реальном запуске задания. Здесь же управляются корпоративный вход и активные сессии."/><Status>{message}</Status>
    <section className="enterprise-surface"><h3>Доступные режимы</h3><div className="enterprise-mode-list">{policies.modes.map(mode=>{const item=saved[mode]||{enabled:true};return <div key={mode}><label className="enterprise-switch"><input type="checkbox" checked={item.enabled} onChange={e=>saveMode(mode,{enabled:e.target.checked})}/><span>{mode}</span></label>{mode==="AI"&&<Field label="Дневной лимит"><input className="company-input" type="number" min="1" key={item.ai_daily_limit ?? "none"} defaultValue={item.ai_daily_limit||""} placeholder="Без лимита" onBlur={e=>saveMode(mode,{ai_daily_limit:e.target.value?Number(e.target.value):null})}/></Field>}</div>})}</div></section>
    <div className="enterprise-split"><form className="enterprise-surface enterprise-form" onSubmit={saveIdentity}><h3>Вход по коду организации</h3><Field label="Код организации"><input className="company-input" required minLength="4" value={identity.organization_code} onChange={e=>setIdentity({...identity,organization_code:e.target.value})}/></Field><Field label="Рабочий домен"><input className="company-input" placeholder="company.ru" value={identity.email_domain||""} onChange={e=>setIdentity({...identity,email_domain:e.target.value})}/></Field><label className="enterprise-check"><input type="checkbox" checked={identity.require_verified_email} onChange={e=>setIdentity({...identity,require_verified_email:e.target.checked})}/><span><b>Требовать подтверждённую рабочую почту</b></span></label><button className="primary-button">Сохранить вход</button></form>
    <section className="enterprise-surface"><h3>Активные сессии</h3><div className="enterprise-list">{sessions.map(item=><div className="enterprise-session" key={item.id}><span><b>Сотрудник #{item.membership_id}</b><small>{item.user_agent||"Неизвестное устройство"}</small></span><button className="subtle-button" onClick={()=>revoke(item.id)}>Завершить</button></div>)}{!sessions.length&&<p>Корпоративных сессий пока нет.</p>}</div></section></div>
    {(data.membership.role||data.membership.corporate_role)==="COMPANY_OWNER"&&<section className="enterprise-surface enterprise-form"><h3>Передача владения</h3><p>Получатель должен подтвердить операцию из собственного аккаунта. До подтверждения владелец не меняется.</p><div className="enterprise-inline"><select className="company-input" value={transferTo} onChange={e=>setTransferTo(e.target.value)}><option value="">Выберите сотрудника</option>{directory.filter(item=>item.membership_id!==data.membership.id).map(item=><option key={item.membership_id} value={item.membership_id}>{item.name||item.username||`Сотрудник #${item.id}`}</option>)}</select><button className="primary-button" disabled={!transferTo} onClick={transfer}>Создать запрос</button></div>{confirmation&&<p className="enterprise-confirmation">Код подтверждения: <b>{confirmation}</b></p>}</section>}
  </section>;
}

export function ProductRequests({ data }) {
  const companyId=data.company.id;const [items,setItems]=useState(null),[form,setForm]=useState({request_type:"SCENARIO",title:"",description:"",materials:""}),[message,setMessage]=useState(""); async function load(){try{setItems(await api(`/api/company/${companyId}/product-requests`))}catch(error){setMessage(error.message)}} useEffect(()=>{load()},[companyId]); async function submit(event){event.preventDefault();try{await api(`/api/company/${companyId}/product-requests`,{method:"POST",body:{...form,materials:form.materials.split("\n").map(v=>v.trim()).filter(Boolean)}});setForm({...form,title:"",description:"",materials:""});setMessage("Заявка отправлена.");await load()}catch(error){setMessage(error.message)}} if(!items)return <Loader/>;return <section className="enterprise-page"><Heading title="Заявки на развитие" text="Запросите новый сценарий, режим или интеграцию и отслеживайте обработку."/><Status>{message}</Status><div className="enterprise-split"><form className="enterprise-surface enterprise-form" onSubmit={submit}><h3>Новая заявка</h3><Field label="Тип"><select className="company-input" value={form.request_type} onChange={e=>setForm({...form,request_type:e.target.value})}><option value="SCENARIO">Сценарий</option><option value="MODE">Режим</option><option value="INTEGRATION">Интеграция</option><option value="OTHER">Другое</option></select></Field><Field label="Название"><input className="company-input" required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Описание"><textarea className="company-input" required minLength="10" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Материалы" hint="По одной защищённой ссылке в строке"><textarea className="company-input" value={form.materials} onChange={e=>setForm({...form,materials:e.target.value})}/></Field><button className="primary-button">Отправить заявку</button></form><section className="enterprise-surface"><h3>История</h3><div className="enterprise-list">{items.map(item=><div className="enterprise-request" key={item.id}><span><b>{item.title}</b><small>{item.request_type} · {item.status}</small></span>{item.admin_note&&<p>{item.admin_note}</p>}</div>)}{!items.length&&<p>Заявок пока нет.</p>}</div></section></div></section>;
}
