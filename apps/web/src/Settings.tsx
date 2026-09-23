import { useEffect, useState } from "react";
import { LogOut, Monitor, Moon, Settings2, Sun, UserRound, X } from "lucide-react";
import { savePersonalization, type Personalization, type Theme } from "./preferences";

type User = { id: string; email: string };
type Props = {
  user: User;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  personalization: Personalization;
  onPersonalization: (value: Personalization) => void;
  onClose: () => void;
  onLogout: () => Promise<void>;
};

const themes = [
  { value: "system", label: "Системная", Icon: Monitor },
  { value: "light", label: "Светлая", Icon: Sun },
  { value: "dark", label: "Тёмная", Icon: Moon },
] as const;
const focuses = ["", "Клиенты", "Управление", "Партнёрство", "Проекты", "Карьера", "HR", "Продажи", "Команда", "Закупки"];

export default function Settings({ user, theme, onTheme, personalization, onPersonalization, onClose, onLogout }: Props) {
  const [section, setSection] = useState<"general" | "personalization">("general");
  const [draft, setDraft] = useState(personalization);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (confirmLogout) setConfirmLogout(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [confirmLogout, onClose]);

  function save() {
    const value = { displayName: draft.displayName.trim().slice(0, 40), focus: focuses.includes(draft.focus) ? draft.focus : "" };
    savePersonalization(user.id, value);
    onPersonalization(value);
  }

  async function logout() {
    setBusy(true);
    setLogoutError("");
    try { await onLogout(); }
    catch (error) { setLogoutError((error as Error).message); setBusy(false); }
  }

  return <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><span className="kicker">ПРОФИЛЬ</span><h2 id="settings-title">Настройки</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть настройки"><X size={20}/></button></header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Разделы настроек">
          <button className={section === "general" ? "selected" : ""} onClick={() => setSection("general")}><Settings2 size={18}/> Общие</button>
          <button className={section === "personalization" ? "selected" : ""} onClick={() => setSection("personalization")}><UserRound size={18}/> Персонализация</button>
          <button className="settings-logout" onClick={() => setConfirmLogout(true)}><LogOut size={18}/> Выйти</button>
        </nav>
        <div className="settings-content">
          {section === "general" ? <>
            <h3>Общие</h3>
            <div className="settings-row"><div><strong>Учётная запись</strong><small>{user.email}</small></div></div>
            <div className="settings-row settings-row-stack"><div><strong>Внешний вид</strong><small>Системная тема меняется вместе с настройками устройства.</small></div><div className="theme-options" role="group" aria-label="Внешний вид">{themes.map(({value,label,Icon}) => <button key={value} className={theme === value ? "selected" : ""} type="button" aria-pressed={theme === value} onClick={() => onTheme(value)}><Icon size={18}/>{label}</button>)}</div></div>
          </> : <>
            <h3>Персонализация</h3>
            <p className="settings-description">Подстройте учебное пространство под себя. Параметры сохраняются в этом браузере для текущего аккаунта.</p>
            <label className="settings-field">Как к вам обращаться<input maxLength={40} value={draft.displayName} onChange={event => setDraft({...draft, displayName: event.target.value})} placeholder="Ваше имя"/></label>
            <label className="settings-field">Приоритет в практике<select value={draft.focus} onChange={event => setDraft({...draft, focus: event.target.value})}>{focuses.map(value => <option key={value} value={value}>{value || "Все темы"}</option>)}</select></label>
            <p className="settings-description">Выбранная тема будет показана первой в каталоге миссий. Сценарии и оценка результатов от этого не меняются.</p>
            <button className="button primary" type="button" onClick={save}>Сохранить</button>
          </>}
        </div>
      </div>
      {confirmLogout && <div className="confirm-backdrop"><div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-description"><h3 id="logout-title">Выйти из аккаунта?</h3><p id="logout-description">Чтобы продолжить тренировки, потребуется войти снова.</p>{logoutError && <p className="error" role="alert">{logoutError}</p>}<div className="confirm-actions"><button className="button secondary" onClick={() => setConfirmLogout(false)} disabled={busy}>Отмена</button><button className="button danger" onClick={logout} disabled={busy}>{busy ? "Выходим…" : "Выйти"}</button></div></div></div>}
    </section>
  </div>;
}
