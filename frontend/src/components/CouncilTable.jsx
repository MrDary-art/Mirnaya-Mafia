export default function CouncilTable({ compact = false, equalRoles = false }) {
  return <div className={`council-table-scene${compact ? " is-compact" : ""}`} aria-label="Четыре роли вокруг общего решения">
    <div className="council-orbit" />
    <div className="council-table-surface"><span>ОБЩИЙ СТОЛ</span><strong>У каждого<br />своя правда.</strong><small>Решение — общее.</small><i>↗</i></div>
    {[["01", "Проект", "Сохранить контракт", "П"], ["02", "Клиент", "Получить вовремя", "К"], ["03", "Производство", "Обещать реальное", "ПР"], ["04", "Финансы", "Найти ресурсы", "Ф"]].map(([n, name, goal, initials]) => <div className={`council-table-person person-${n}`} key={n}><span className="council-avatar">{initials}</span><div><small>РОЛЬ {n}</small><b>{compact && !equalRoles && n === "01" ? "Ведущий" : name}</b><p>{goal}</p></div><span className="council-person-dot" /></div>)}
    <span className="council-scene-caption">РАЗНЫЕ ИНТЕРЕСЫ. ОДНА КОМАНДА.</span>
  </div>;
}
