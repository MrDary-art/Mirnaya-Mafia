import { useState } from "react";
import { api, downloadPrivate } from "../api.js";
import { useEffect, Notice } from "./shared.jsx";

export function Integrations({ data }) {
  const catalog = { teams: "Microsoft Teams", slack: "Slack", hris: "Кадровая система", crm: "CRM", webhook: "Вебхуки" };
  const [items, setItems] = useState([]), [selected, setSelected] = useState(""), [url, setUrl] = useState(""), [token, setToken] = useState("");
  const [error, setError] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const load = () => api(`/api/company/${data.company.id}/integrations`).then(setItems).catch(cause => setError(cause.message));
  useEffect(load, [data.company.id]);
  const states = Object.fromEntries(items.map(item => [item.provider, item]));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/company/${data.company.id}/integrations/${selected}`, { method: "PUT", body: { enabled: true, settings: { webhook_url: url, access_token: token } } }); setUrl(""); setToken(""); setSelected(""); setNote("Настройки сохранены. Факт сохранения не подтверждает доставку или синхронизацию."); await load(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <section className="space-y-5"><header><h2 className="mt-2 text-3xl font-bold">Интеграции</h2><p className="mt-3 text-slate-400">Teams, Slack и вебхуки передают уведомления. Для кадровой системы и CRM доступно сохранение настроек; автоматическая синхронизация пока не реализована.</p></header>{error && <Notice tone="red">{error}</Notice>}{note && <Notice>{note}</Notice>}<div className="grid gap-4 md:grid-cols-2">{Object.entries(catalog).map(([key, name]) => <article key={key} className="glass rounded-3xl p-5"><h3 className="text-xl font-bold">{name}</h3><p className="mt-3 text-sm text-slate-400">{states[key]?.configured || states[key]?.enabled ? "Настройки сохранены" : "Не настроено"}</p><p className="mt-2 text-sm">{["hris", "crm"].includes(key) ? "Синхронизация недоступна" : "Доставка зависит от доступности внешнего адреса"}</p><button className="subtle-button mt-4" onClick={() => { setSelected(key); setUrl(""); setToken(""); }}>Настроить</button></article>)}</div>{selected && <form className="glass space-y-4 rounded-3xl p-5" onSubmit={save}><h3 className="text-xl font-bold">{catalog[selected]}</h3><label className="block">Адрес HTTPS<input required type="url" pattern="https://.*" className="company-input" placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} /></label><label className="block">Токен доступа<input type="password" autoComplete="new-password" className="company-input" value={token} onChange={event => setToken(event.target.value)} /></label><p className="text-sm text-slate-400">Секреты шифруются на сервере и не возвращаются в браузер.</p><div className="flex flex-wrap gap-3"><button disabled={busy} className="primary-button">Сохранить настройки</button><button type="button" className="subtle-button" onClick={() => setSelected("")}>Отмена</button></div></form>}</section>;
}
