import {useEffect, useState} from "react";
import {api} from "../api.js";

export default function SupportContactSettings() {
  const [email,setEmail]=useState("");
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{let active=true; api("/api/mail/status").then(value=>{if(active){setEmail(value.support_email || "");setReady(true);}}).catch(reason=>{if(active)setError(reason.message);});return()=>{active=false;};},[]);
  async function save(event) {
    event.preventDefault();setBusy(true);setError("");setNotice("");
    try {const result=await api("/api/admin/mail/support-contact",{method:"PUT",body:{email}});setEmail(result.support_email);setNotice("Публичный контакт поддержки сохранён.");}
    catch(reason){setError(reason.message);} finally{setBusy(false);}
  }
  return <section className="ia-panel"><h2>Публичная почта поддержки</h2><p>Этот адрес увидят пользователи при восстановлении доступа без привязанной почты. Он не меняет SMTP, адрес получения защитных кодов или пароль администратора. Оставьте пустым, чтобы использовать адрес отправителя уведомлений.</p>
    <form className="settings-form" onSubmit={save}><label>Почта поддержки<input type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={!ready || busy}/></label><button disabled={!ready || busy}>{busy?"Сохраняем…":"Сохранить контакт поддержки"}</button></form>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>;
}
