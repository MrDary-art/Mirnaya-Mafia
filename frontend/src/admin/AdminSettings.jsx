import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import PageHeader from "../design/PageHeader.jsx";
import MailAdmin from "../components/MailAdmin.jsx";
import SupportContactSettings from "./SupportContactSettings.jsx";
import AiSettings from "./AiSettings.jsx";
import SpeechSettings from "./SpeechSettings.jsx";
import { PasswordSettings, AuditSettings, SecuritySettings } from "./SecuritySettings.jsx";
import "../pages/installation-admin.css";
import "./settings.css";

const tabs=[["ai","Искусственный интеллект"],["speech","Речь и видеосвязь"],["mail","Почта"],["audit","Журнал изменений"],["password","Смена пароля"],["security","Безопасность"]];
export default function AdminSettings(){
  const {user,ready}=useAuth();const [params,setParams]=useSearchParams();
  const tab=tabs.some(([id])=>id===params.get("tab"))?params.get("tab"):"ai";
  useEffect(()=>{if(user?.is_admin&&!user.must_change_password)api("/api/admin/activity",{method:"POST",body:{path:"/admin/settings",view:tab}}).catch(()=>{});},[tab,user?.id,user?.must_change_password]);
  if(!ready)return <p role="status">Загружаем настройки…</p>;
  if(!user)return <Navigate to="/login?next=%2Fadmin%2Fsettings" replace/>;
  if(!user.is_admin)return <Navigate to="/app" replace/>;
  return <main className="installation-admin settings-workspace"><PageHeader title="Настройки"/>
    {!user.must_change_password&&<nav className="admin-local-tabs" aria-label="Категории настроек">{tabs.map(([id,title])=><button key={id} aria-pressed={tab===id} onClick={()=>setParams({tab:id})}>{title}</button>)}</nav>}
    {user.must_change_password?<PasswordSettings bootstrap/>:tab==="ai"?<AiSettings/>:tab==="speech"?<SpeechSettings/>:tab==="mail"?<><SupportContactSettings/><MailAdmin/></>:tab==="audit"?<AuditSettings/>:tab==="password"?<PasswordSettings/>:<SecuritySettings/>}
  </main>;
}
