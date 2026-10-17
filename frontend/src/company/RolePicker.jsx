import { roleLabels } from "./shared.jsx";
import "./role-picker.css";

const descriptions = {
  COMPANY_OWNER: "Управляет компанией, структурой, приглашениями, обучением и доступом. Видит корпоративную аналитику и журнал действий.",
  COMPANY_ADMIN: "Управляет сотрудниками, подразделениями, приглашениями и заданиями. Видит корпоративные результаты и журнал действий.",
  LND_MANAGER: "Организует обучение и задания всей компании, проверяет результаты и аналитику. Не управляет структурой и приглашениями.",
  DEPARTMENT_MANAGER: "Назначает задания и проверяет результаты своего подразделения и вложенных подразделений.",
  TEAM_LEAD: "Назначает задания своей команде, просматривает её результаты и оставляет комментарии.",
  MENTOR: "Просматривает результаты закреплённых сотрудников и комментирует их работу. Не назначает задания.",
  AUDITOR: "Просматривает корпоративную аналитику, результаты и журнал действий. Не изменяет данные и не комментирует результаты.",
  EMPLOYEE: "Проходит назначенное обучение и видит собственные задания и результаты. Не управляет другими сотрудниками.",
};

export default function RolePicker({ value, onChange }) {
  return <details className="company-role-picker"><summary aria-label={"Роль доступа: " + roleLabels[value]}>{roleLabels[value]}</summary>
    <div role="listbox" aria-label="Роль доступа" onKeyDown={e => {
      if (!["ArrowDown", "ArrowUp", "Escape"].includes(e.key)) return;
      e.preventDefault();
      const detail = e.currentTarget.closest("details");
      if (e.key === "Escape") { detail.open = false; detail.querySelector("summary").focus(); return; }
      const options = [...e.currentTarget.querySelectorAll("button")];
      const index = options.indexOf(document.activeElement);
      options[(index + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length].focus();
    }}>{Object.entries(roleLabels).map(([key, label]) => <button type="button" role="option" aria-selected={key === value} title={descriptions[key]} key={key} onClick={e => {
      onChange(key); const detail = e.currentTarget.closest("details"); detail.open = false; detail.querySelector("summary").focus();
    }}><b>{label}</b><small>{descriptions[key]}</small></button>)}</div>
    <p>{descriptions[value]}</p>
  </details>;
}
