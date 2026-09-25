import { useEffect, useState } from "react";
import { api } from "../api.js";

const fields = ["username", "last_name", "first_name", "middle_name", "about", "specialization", "city", "organization"];
const labels = {
  username: "Никнейм", last_name: "Фамилия", first_name: "Имя", middle_name: "Отчество",
  about: "О себе", specialization: "Специализация", city: "Город", organization: "Компания",
};

export default function SocialProfile({ profile, onSaved }) {
  const [draft, setDraft] = useState({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(profile.personal || {}), [profile]);

  function set(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setSaved(false);
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api("/api/social/profile", { method: "PUT", body: draft });
      await onSaved?.();
      setSaved(true);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="glass rounded-3xl">
    <button type="button" className="flex w-full justify-between p-6 text-left" aria-expanded={open} aria-controls="social-profile-editor" onClick={() => setOpen((value) => !value)}><b>Личная информация</b><b aria-hidden="true">{open ? "−" : "+"}</b></button>
    {open && <form id="social-profile-editor" onSubmit={save} className="grid gap-3 border-t border-white/10 p-6 md:grid-cols-2">
      {fields.map((key) => <label key={key}>{labels[key]}{key === "about"
        ? <textarea value={draft[key] || ""} onChange={(event) => set(key, event.target.value)} className="mt-1 min-h-20 w-full rounded-xl bg-white/5 p-2" />
        : <input required={["username", "last_name", "first_name"].includes(key)} value={draft[key] || ""} onChange={(event) => set(key, event.target.value)} className="mt-1 w-full rounded-xl bg-white/5 p-2" />}</label>)}
      <p className="text-sm text-slate-400 md:col-span-2">Игровой титул: {profile.rank_name}. Он назначается автоматически по уровню.</p>
      <p className="text-xs text-slate-500 md:col-span-2">Указанная компания — информация профиля. Корпоративный доступ появляется только после подтверждённого приглашения компании.</p>
      {error && <p role="alert" className="text-sm text-rose-300 md:col-span-2">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-300 md:col-span-2">Изменения сохранены.</p>}
      <button type="submit" disabled={saving} className="primary-button md:col-span-2">{saving ? "Сохраняем…" : "Сохранить"}</button>
    </form>}{profile.workspaces?.length > 0 && <div className="border-t border-white/10 p-6"><div className="eyebrow">ПОДТВЕРЖДЁННАЯ РАБОТА</div>{profile.workspaces.map((item) => <div key={item.company_id} className="mt-3 rounded-2xl bg-white/5 p-4"><b>🏢 {item.company}</b><p className="mt-1 text-sm text-slate-400">{[item.department, item.job_title].filter(Boolean).join(" · ") || "Участник компании"}</p></div>)}</div>}
  </section>;
}
