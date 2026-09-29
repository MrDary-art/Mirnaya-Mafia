import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function MailAdmin() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ host: "smtp.mirea.ru", port: 587, security: "starttls", sender: "", username: "", password: "" });
  const [mirea, setMirea] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState(null);
  useEffect(() => { api("/api/admin/mail").then(value => {
    setConfig(value);
    if (value.host) { setForm(old => ({ ...old, ...value, password: "" })); setMirea(value.host === "smtp.mirea.ru"); }
  }).catch(e => setMessage(e.message)); }, []);
  async function run(path, method = "POST") {
    setBusy(true); setMessage("");
    try {
      const result = await api(path, { method, body: { ...form, revision: config.revision } });
      if (method === "PUT") { setConfig(result); setForm(old => ({ ...old, password: "" })); }
      setMessage(result.detail || (method === "PUT" ? "Почта подключена." : "Проверка прошла."));
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  if (!config) return <section className="ia-panel"><h2>Почта</h2><p>{message || "Загрузка…"}</p></section>;
  return <section className="ia-panel"><h2>Почта</h2>
    <p>{config.enabled ? "Почта включена. Пользователи могут подтвердить адрес и восстановить доступ." : "Почта отключена. Вход и уведомления внутри сайта работают как обычно."}</p>
    <fieldset><legend>Откуда отправлять письма?</legend>
      <label><input type="radio" checked={mirea} onChange={() => { setMirea(true); setForm(f => ({ ...f, host: "smtp.mirea.ru", port: 587, security: "starttls" })); }} /> У меня почта МИРЭА</label>
      <label><input type="radio" checked={!mirea} onChange={() => { setMirea(false); setForm(f => ({ ...f, host: "", sender: "", username: "", password: "" })); }} /> Другая почта или свой домен</label>
    </fieldset>
    <form onSubmit={e => { e.preventDefault(); run("/api/admin/mail", "PUT"); }}>
      <label>Адрес отправителя<input type="email" required value={form.sender} onChange={e => setForm({ ...form, sender: e.target.value, username: mirea ? e.target.value : form.username })} placeholder={mirea ? "name@edu.mirea.ru" : "hello@your-domain.ru"} /></label>
      <label>Логин SMTP<input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
      <label>Пароль почтового ящика<input type="password" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={config.password_configured ? "Оставьте пустым, чтобы сохранить прежний" : "Введите пароль"} /></label>
      <label>SMTP-сервер<input required value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder={mirea ? "smtp.mirea.ru" : "smtp.your-domain.ru"} /></label>
      <label>Защита соединения<select value={form.security} onChange={e => setForm({ ...form, security: e.target.value, port: e.target.value === "ssl" ? 465 : 587 })}><option value="starttls">STARTTLS (обычно порт 587)</option><option value="ssl">SSL/TLS (обычно порт 465)</option></select></label>
      <label>Порт<input type="number" min="1" max="65535" value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) })} /></label>
      <div className="ia-toolbar"><button type="button" disabled={busy} onClick={() => run("/api/admin/mail/check")}>Проверить подключение</button><button type="button" disabled={busy} onClick={() => run("/api/admin/mail/test")}>Отправить тестовое письмо себе</button><button disabled={busy}>Проверить и включить</button></div>
    </form>
    {config.enabled && <button disabled={busy} onClick={async () => { setBusy(true); try { const value = await api("/api/admin/mail/disable", { method: "POST", body: { revision: config.revision } }); setConfig(value); setMessage("Почта выключена."); } catch (e) { setMessage(e.message); } finally { setBusy(false); } }}>Выключить почту</button>}
    {config.enabled && <div><button type="button" disabled={busy} onClick={async () => { try { setQueue(await api("/api/admin/mail/queue")); } catch (e) { setMessage(e.message); } }}>Проверить очередь писем</button>{queue && <p role="status">Доставлено: {queue.counts.sent || 0} · В очереди: {(queue.counts.pending || 0) + (queue.counts.retry || 0) + (queue.counts.sending || 0)} · Не удалось: {queue.counts.failed || 0}</p>}</div>}
    {message && <p role="status">{message}</p>}
    <p>Пароль хранится зашифрованно и не показывается после сохранения. Проверка подключения не отправляет письмо; тестовая отправка покажет только приём SMTP, доставку проверьте во входящих.</p>
  </section>;
}
