import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ProfilePreview } from "./cosmetics/CosmeticVisual.jsx";

const fields = ["username", "last_name", "first_name", "middle_name"];
const labels = {
  username: "Уникальный никнейм", last_name: "Фамилия", first_name: "Имя", middle_name: "Отчество",
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
      setOpen(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  const fullName = [draft.last_name, draft.first_name, draft.middle_name].filter(Boolean).join(" ") || "ФИО не указано";
  const workspace = profile.workspaces?.[0];
  const companyName = workspace?.company;
  const companyDetails = workspace ? [workspace.department, workspace.job_title].filter(Boolean).join(" · ") : "";
  return <section className="glass personal-profile-card profile-overview-card rounded-3xl" aria-label="Основная информация профиля">
    <ProfilePreview
      className="profile-overview-preview"
      equipment={profile.cosmetics}
      username={profile.username}
      displayName={fullName}
      level={profile.level}
      showLevel={false}
      stars={profile.stars}
      userId={profile.id}
      details={<div className="profile-identity-meta">
        <span>{profile.rank_name}</span>
        <span>Опыт обучения: {profile.xp}</span>
        {companyName && <span className="ui-icon-label"><BuildingsIcon size={16} aria-hidden="true" />{companyName}{companyDetails ? ` · ${companyDetails}` : ""}</span>}
      </div>}
    >
      <div className="profile-overview-actions">
        <button type="button" className={`profile-edit-icon-button${open ? " is-active" : ""}`} aria-label={open ? "Закрыть редактор профиля" : "Редактировать профиль"} title={open ? "Закрыть редактор" : "Редактировать профиль"} aria-expanded={open} aria-controls="social-profile-editor" onClick={() => setOpen((value) => !value)}><PencilSimpleIcon size={22} aria-hidden="true" /></button>
      </div>
    </ProfilePreview>
    {open && <form id="social-profile-editor" onSubmit={save} className="personal-profile-form grid gap-3 md:grid-cols-2">
      {fields.map((key) => <label key={key}>{labels[key]}<span className={key === "username" ? "profile-username-field" : undefined}>{key === "username" && <span aria-hidden="true">@</span>}<input required={["username", "last_name", "first_name"].includes(key)} value={draft[key] || ""} onChange={(event) => set(key, event.target.value.replace(/^@/, ""))} className="mt-1 w-full rounded-xl bg-white/5 p-2" /></span></label>)}
      {error && <p role="alert" className="text-sm text-rose-300 md:col-span-2">{error}</p>}
      {saved && <p role="status" className="text-sm text-lime-200 md:col-span-2">Изменения сохранены.</p>}
      <button type="submit" disabled={saving} className="primary-button md:col-span-2">{saving ? "Сохраняем…" : "Сохранить"}</button>
    </form>}
  </section>;
}
