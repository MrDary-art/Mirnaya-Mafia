import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import { businessPath } from "./navigation.js";
import "./business.css";
const KEY="arena_business_demo_session";
export function demoSession() { try{return JSON.parse(sessionStorage.getItem(KEY)||"null");}catch{return null;} }
export async function leaveBusinessDemo(refresh,navigate) {
 const saved=demoSession();setToken(saved?.previousToken||null);sessionStorage.removeItem(KEY);await refresh();navigate("/business",{replace:true});
}
export function DemoToolbar({companyId}) {
 const {login,refresh}=useAuth(),navigate=useNavigate(),saved=demoSession();
 if(!saved||String(saved.company_id)!==String(companyId))return null;
 return <aside className="business-demo-toolbar" aria-label="Учебный кабинет"><div><b>Демонстрационный кабинет</b><p>Данные учебные. Результаты появятся после настоящего прохождения.</p></div><label>Роль<select aria-label="Роль в демо" value={getToken()||""} onChange={e=>{const role=saved.roles.find(r=>r.access_token===e.target.value);if(role){login(role);window.location.assign(businessPath(companyId));}}}>{saved.roles.map(role=><option key={role.role} value={role.access_token}>{role.label||role.corporate_role}</option>)}</select></label><button className="subtle-button" onClick={()=>leaveBusinessDemo(refresh,navigate)}>Завершить демо</button></aside>;
}
export default function BusinessDemo(){
 const {login}=useAuth(),navigate=useNavigate();const[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function start(){setBusy(true);setError("");try{let value=demoSession();if(!value||new Date(value.expires_at)<=new Date()){const result=await api("/api/business/demo",{method:"POST",body:{},auth:false});value={...result,previousToken:value ? value.previousToken : getToken()};sessionStorage.setItem(KEY,JSON.stringify(value));}login(value.roles.find(r=>r.role==="owner")||value.roles[0]);navigate(businessPath(value.company_id),{replace:true});}catch(e){setError(e.message);setBusy(false);}}
 return <div className="business-public business-workspaces"><header><BusinessBrand/><Link to="/business">О продукте</Link></header><main><h1>Попробуйте работу компании</h1><p className="business-lead">Отдельный учебный кабинет: два подразделения, пять участников и реальные задания без заранее выставленных баллов.</p><ol className="business-demo-guide"><li><b>Владелец и HR</b><p>Посмотрите структуру и назначьте кейс команде.</p></li><li><b>Сотрудник</b><p>Пройдите офлайн-сценарий. Внешний ИИ для него не нужен.</p></li><li><b>Руководитель</b><p>Откройте результат и сертификат после прохождения.</p></li></ol><p>Кабинет действует 45 минут. Приглашения настоящих пользователей, внешние интеграции и загрузки в демо отключены. Ваш аккаунт можно восстановить кнопкой «Завершить демо».</p>{error&&<p className="business-alert" role="alert">{error}</p>}<div className="business-actions"><button disabled={busy} className="primary-button" onClick={start}>{busy?"Создаём учебную компанию…":"Открыть учебный кабинет"}</button><Link className="subtle-button" to="/business">Вернуться</Link></div></main></div>;
}
