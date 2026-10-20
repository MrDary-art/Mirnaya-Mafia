import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import "./mail-action.css";

export default function MailAction({ kind }) {
  const [mail, setMail] = useState(null);
  const [params] = useSearchParams();
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil((until - clock) / 1000));
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const token = params.get("token") || "";
  useEffect(() => { api("/api/mail/status", { auth: false }).then(setMail).catch(() => setMail({ enabled: false, support_email: "" })); }, []);
  useEffect(() => { if (mail?.enabled && kind === "verify" && token) api("/api/auth/email/verify", { method: "POST", body: { token }, auth: false }).then(() => setStatus("Адрес подтверждён. Теперь можно войти по почте.")).catch(e => setStatus(e.message)); }, [mail?.enabled, kind, token]);
  async function submit(event) {
    event.preventDefault();
    if (busy || remaining) return;
    setBusy(true);
    setStatus("");
    try {
      if (kind === "forgot") {
        const result = await api("/api/auth/password/forgot", { method: "POST", body: { identifier: email }, auth: false });
        setStatus(result.detail);
        setClock(Date.now()); setUntil(Date.now() + (result.retry_after || 0) * 1000);
      } else {
        await api("/api/auth/password/reset", { method: "POST", body: { token, password }, auth: false });
        setStatus("Пароль изменён. Войдите с новым паролем.");
      }
    } catch (e) { setStatus(e.message); if (e.retryAfter) { setClock(Date.now()); setUntil(Date.now() + e.retryAfter * 1000); } }
    finally { setBusy(false); }
  }
  if (!mail) return null;
  const support = mail.support_email;
  return <main className="mail-action-page"><section className="mail-action-card"><h1>{kind === "verify" ? "Подтверждение почты" : kind === "forgot" ? "Восстановление доступа" : "Новый пароль"}</h1>
    {kind === "forgot" && <p className="mail-action-description">Укажите логин или почту аккаунта. Ссылка придёт на привязанную и подтверждённую почту. Первая повторная отправка доступна через 30 секунд, после второй отправки за час — через минуту, после третьей и следующих — через 5 минут.</p>}
    {kind === "forgot" && <p className="mail-action-description">Если почта в аккаунте не указана или доступа к ней нет, опишите проблему службе поддержки{support ? <>: <a href={`mailto:${support}`}>{support}</a></> : ". Контакт поддержки появится здесь после настройки почтовых уведомлений."}</p>}
    {kind !== "verify" && (mail.enabled || kind === "forgot" ? <form onSubmit={submit}>{kind === "forgot" ? <label>Логин или почта<input type="text" required maxLength={254} autoComplete="username" placeholder="Логин или name@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label> : <label>Новый пароль<input type="password" required minLength={12} autoComplete="new-password" placeholder="Не менее 12 символов" value={password} onChange={e => setPassword(e.target.value)} /></label>}<button disabled={busy || remaining > 0} aria-busy={busy}>{busy ? "Отправляем…" : remaining ? `Повторить через ${remaining} сек.` : kind === "forgot" ? "Отправить ссылку" : "Сохранить пароль"}</button></form> : <p role="status">Восстановление по ссылке пока недоступно: почтовые уведомления не настроены.</p>)}
    {status && <p role="status">{status}</p>}<Link to="/login">Вернуться ко входу</Link></section></main>;
}
