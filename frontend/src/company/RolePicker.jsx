import { roleLabels } from "./shared.jsx";
import "./role-picker.css";

const descriptions = {
  COMPANY_OWNER: "Создаёт и настраивает компанию, приглашает людей и видит результаты всей компании.",
  COMPANY_ADMIN: "Расширенный доступ к настройкам компании для уже существующих организаций.",
  LND_MANAGER: "Расширенная роль для обучения всей компании.",
  DEPARTMENT_MANAGER: "Видит только свою ветку подчинения, создаёт рабочие ситуации и назначает практику своей команде.",
  TEAM_LEAD: "Руководитель из существующей структуры: видит только свою ветку подчинения.",
  MENTOR: "Просматривает результаты закреплённых сотрудников и комментирует их работу. Не назначает задания.",
  AUDITOR: "Просматривает корпоративную аналитику, результаты и журнал действий. Не изменяет данные и не комментирует результаты.",
  EMPLOYEE: "Проходит назначенное обучение и видит собственные задания и результаты. Не управляет другими сотрудниками.",
};

export default function RolePicker({ value, onChange, options = Object.entries(roleLabels) }) {
  return <details className="company-role-picker"><summary aria-label={"Роль доступа: " + roleLabels[value]}>{roleLabels[value]}</summary>
    <div role="listbox" aria-label="Роль доступа" onKeyDown={e => {
      if (!["ArrowDown", "ArrowUp", "Escape"].includes(e.key)) return;
      e.preventDefault();
      const detail = e.currentTarget.closest("details");
      if (e.key === "Escape") { detail.open = false; detail.querySelector("summary").focus(); return; }
      const options = [...e.currentTarget.querySelectorAll("button")];
      const index = options.indexOf(document.activeElement);
      options[(index + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length].focus();
    }}>{options.map(([key, label]) => <button type="button" role="option" aria-selected={key === value} title={descriptions[key]} key={key} onClick={e => {
      onChange(key); const detail = e.currentTarget.closest("details"); detail.open = false; detail.querySelector("summary").focus();
    }}><b>{label}</b><small>{descriptions[key]}</small></button>)}</div>
    <p>{descriptions[value]}</p>
  </details>;
}
