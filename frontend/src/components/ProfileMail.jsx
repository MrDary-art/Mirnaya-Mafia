import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function ProfileMail() {
  const [enabled, setEnabled] = useState(false);
  const [current, setCurrent] = useState(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    api("/api/mail/status", { auth: false }).then(value => setEnabled(Boolean(value.enabled))).catch(() => {});
    api("/api/auth/me").then(setCurrent).catch(() => {});
  }, []);
  if (!enabled) return null;
  return <section className="glass rounded-3xl p-6"><h2 className="text-xl font-bold">Почта и доступ</h2>
    <p className="mt-2 text-slate-300">{current?.email ? `${current.email} · ${current.email_verified ? "подтверждена" : "ожидает подтверждения"}` : "Добавьте адрес, чтобы восстановить пароль и получать важные письма."}</p>
    <form className="mt-4 flex flex-wrap gap-3" onSubmit={async e => { e.preventDefault(); setMessage(""); try { const result = await api("/api/auth/email", { method: "POST", body: { email } }); setMessage(result.detail); } catch (err) { setMessage(err.message); } }}>
      <label>Адрес почты<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label><button className="primary-button">{current?.email ? "Изменить адрес" : "Добавить адрес"}</button>
    </form>{message && <p role="status">{message}</p>}
  </section>;
}
