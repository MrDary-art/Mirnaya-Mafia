import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import "./mail-action.css";

export default function MailAction({ kind }) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [params] = useSearchParams();
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const token = params.get("token") || "";
  useEffect(() => { api("/api/mail/status", { auth: false }).then(result => { if (result.enabled) setEnabled(true); else navigate("/", { replace: true }); }).catch(() => navigate("/", { replace: true })); }, [navigate]);
  useEffect(() => { if (enabled && kind === "verify" && token) api("/api/auth/email/verify", { method: "POST", body: { token }, auth: false }).then(() => setStatus("Адрес подтверждён. Теперь можно войти по почте.")).catch(e => setStatus(e.message)); }, [enabled, kind, token]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (kind === "forgot") {
        await api("/api/auth/password/forgot", { method: "POST", body: { email }, auth: false });
        setStatus("Если адрес подтверждён, мы отправили ссылку для смены пароля.");
      } else {
        await api("/api/auth/password/reset", { method: "POST", body: { token, password }, auth: false });
        setStatus("Пароль изменён. Войдите с новым паролем.");
      }
    } catch (e) { setStatus(e.message); }
    finally { setBusy(false); }
  }
  if (!enabled) return null;
  return <main className="mail-action-page"><section className="mail-action-card"><h1>{kind === "verify" ? "Подтверждение почты" : kind === "forgot" ? "Восстановление доступа" : "Новый пароль"}</h1>
    {kind === "forgot" && <p className="mail-action-description">Укажите подтверждённую почту аккаунта. Мы отправим ссылку для смены пароля.</p>}
    {kind !== "verify" && <form onSubmit={submit}>{kind === "forgot" ? <label>Почта<input type="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label> : <label>Новый пароль<input type="password" required minLength={12} autoComplete="new-password" placeholder="Не менее 12 символов" value={password} onChange={e => setPassword(e.target.value)} /></label>}<button disabled={busy} aria-busy={busy}>{busy ? "Отправляем…" : kind === "forgot" ? "Отправить ссылку" : "Сохранить пароль"}</button></form>}
    {status && <p role="status">{status}</p>}<Link to="/login">Вернуться ко входу</Link></section></main>;
}
