import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
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

  const fullName = [draft.last_name, draft.first_name, draft.middle_name].filter(Boolean).join(" ") || "Не указано";
  return <section className="glass personal-profile-card rounded-3xl">
    <div className="personal-profile-head"><div><div className="eyebrow">ПРОФИЛЬ</div><h2>Личная информация</h2></div><button type="button" className="subtle-button" aria-expanded={open} aria-controls="social-profile-editor" onClick={() => setOpen((value) => !value)}>{open ? "Закрыть" : "Редактировать"}</button></div>
    <div className="personal-profile-summary"><div><span>Полное имя</span><b>{fullName}</b></div><div><span>Никнейм</span><b>@{draft.username || profile.username}</b></div><div><span>Специализация</span><b>{draft.specialization || "Не указана"}</b></div><div><span>Город</span><b>{draft.city || "Не указан"}</b></div>{draft.about && <div className="personal-profile-about"><span>О себе</span><p>{draft.about}</p></div>}</div>
    {open && <form id="social-profile-editor" onSubmit={save} className="personal-profile-form grid gap-3 md:grid-cols-2">
      {fields.map((key) => <label key={key}>{labels[key]}{key === "about"
        ? <textarea value={draft[key] || ""} onChange={(event) => set(key, event.target.value)} className="mt-1 min-h-20 w-full rounded-xl bg-white/5 p-2" />
        : <input required={["username", "last_name", "first_name"].includes(key)} value={draft[key] || ""} onChange={(event) => set(key, event.target.value)} className="mt-1 w-full rounded-xl bg-white/5 p-2" />}</label>)}
      <p className="text-sm text-slate-400 md:col-span-2">Игровой титул: {profile.rank_name}. Он назначается автоматически по уровню.</p>
      <p className="text-xs text-slate-500 md:col-span-2">Указанная компания — информация профиля. Корпоративный доступ появляется только после подтверждённого приглашения компании.</p>
      {error && <p role="alert" className="text-sm text-rose-300 md:col-span-2">{error}</p>}
      {saved && <p role="status" className="text-sm text-lime-200 md:col-span-2">Изменения сохранены.</p>}
      <button type="submit" disabled={saving} className="primary-button md:col-span-2">{saving ? "Сохраняем…" : "Сохранить"}</button>
    </form>}{profile.workspaces?.length > 0 && <div className="border-t border-white/10 p-6"><div className="eyebrow">ПОДТВЕРЖДЁННАЯ РАБОТА</div>{profile.workspaces.map((item) => <div key={item.company_id} className="mt-3 rounded-2xl bg-white/5 p-4"><b className="ui-icon-label"><BuildingsIcon size={18} aria-hidden="true" />{item.company}</b><p className="mt-1 text-sm text-slate-400">{[item.department, item.job_title].filter(Boolean).join(" · ") || "Участник компании"}</p></div>)}</div>}
  </section>;
}
