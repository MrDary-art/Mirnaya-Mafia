import { useState } from "react";
import "./company-join-code.css";

export default function CompanyJoinCode({ data }) {
  const [message, setMessage] = useState("");
  const code = data.company.join_code;
  if (!code || !data.permissions?.invite_members) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(code); setMessage("Код скопирован."); }
    catch { setMessage("Выделите и скопируйте код из поля."); }
  }
  return <section className="company-join-code" aria-label="Код компании для заявок">
    <div><h3>Код компании</h3><p>Передайте код коллегам. При регистрации они смогут отправить заявку; доступ появится после вашего одобрения в разделе «Команда → Заявки».</p></div>
    <div className="company-join-code-controls"><label>10 символов<input readOnly value={code} spellCheck={false} onFocus={event => event.currentTarget.select()} /></label><button type="button" className="subtle-button" onClick={copy}>Скопировать код</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
