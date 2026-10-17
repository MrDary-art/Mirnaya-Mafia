import { useState } from "react";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import { Employees, Applications, Teams, Cohorts } from "./organization.jsx";
import { Assignments, ContentLibrary, ProgramBuilder } from "./learning.jsx";
import { Analytics, Ratings } from "./insights.jsx";
import { Achievements, CorporateActivities, Surveys } from "./engagement.jsx";
import { Certificates } from "./certificates.jsx";
import { AccessAndBilling, Integrations, Policies, Settings } from "./settings.jsx";
import { CompanyHierarchy } from "./hierarchy.jsx";
import { CatalogManager, SecurityCenter } from "./company-tools.jsx";
import MeetingProtocols from "./meeting-protocols.jsx";

function SectionTabs({ items, value, onChange, label }) {
  return <nav className="business-workspace-tabs" aria-label={label}>
    {items.map(([id, title]) => <button
      key={id}
      type="button"
      className={value === id ? "is-active" : ""}
      aria-current={value === id ? "page" : undefined}
      onClick={() => onChange(id)}
    >{title}</button>)}
  </nav>;
}

export function TeamWorkspace(props) {
  const canManageCompany = props.data.permissions?.manage_company;
  return <section className="business-workspace-page">
    <div className="business-team-overview">
      <CompanyHierarchy {...props} />
      <div className="business-team-overview-section" id="company-employees" tabIndex={-1}>
        <Employees {...props} />
      </div>
      <div className="business-team-overview-section" id="company-departments" tabIndex={-1}>
        <Teams {...props} />
      </div>
      {canManageCompany && <div className="business-team-overview-section" id="company-applications" tabIndex={-1}>
        <Applications {...props} />
      </div>}
    </div>
  </section>;
}

export function AssignmentsWorkspace(props) {
  const canManageLearning = props.data.permissions?.manage_learning;
  const [view, setView] = useState("assignments");
  const tabs = [["assignments", "Назначения"], ["groups", "Учебные команды"]];
  if (canManageLearning) tabs.push(["content", "Сценарии и тесты"], ["programs", "Программы"]);
  return <section className="business-workspace-page">
    <SectionTabs items={tabs} value={view} onChange={setView} label="Разделы назначений" />
    {view === "assignments" && <Assignments {...props} onOpenLibrary={() => setView("content")} onOpenPrograms={() => setView("programs")} />}
    {view === "groups" && <Cohorts {...props} />}
    {view === "content" && canManageLearning && <ContentLibrary {...props} initialSection="scenarios" />}
    {view === "programs" && canManageLearning && <ProgramBuilder {...props} />}
  </section>;
}

export function ResultsWorkspace(props) {
  const [view, setView] = useState("analytics");
  return <section className="business-workspace-page">
    <SectionTabs
      label="Разделы результатов"
      value={view}
      onChange={setView}
      items={[["analytics", "Динамика"], ["rating", "Рейтинг"], ["recognition", "Сертификаты и достижения"]]}
    />
    {view === "analytics" && <Analytics {...props} />}
    {view === "rating" && <Ratings {...props} />}
    {view === "recognition" && <div className="business-recognition-stack"><Certificates {...props} /><Achievements {...props} /></div>}
  </section>;
}

export function CommunityWorkspace(props) {
  const [view, setView] = useState("feed");
  const canPublish = props.data.company.status !== "DEMO" && ["COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER"].includes(props.data.membership.role);
  return <section className="business-workspace-page">
    <SectionTabs items={[["feed", "Лента"], ["surveys", "Опросы"]]} value={view} onChange={setView} label="Разделы сообщества" />
    {view === "feed" && <ProfileWall companyId={props.data.company.id} canPublish={canPublish} />}
    {view === "surveys" && <Surveys {...props} />}
  </section>;
}

const settingsCategories = [
  { id: "profile", group: "Компания", title: "Профиль компании", description: "Название, отрасль, размер и контакты" },
  { id: "logo", group: "Компания", title: "Логотип", description: "Изображение рабочего пространства" },
  { id: "workspace", group: "Компания", title: "Часовой пояс", description: "Сроки, расписания и напоминания" },
  { id: "access", group: "Доступ", title: "Доступ и лицензии", description: "Роли, разрешения и места сотрудников" },
  { id: "security", group: "Доступ", title: "Вход и сессии", description: "Код организации, рабочая почта и активные входы" },
  { id: "integrations", group: "Доступ", title: "Интеграции", description: "SSO, HRIS, LMS, CRM и уведомления" },
  { id: "catalog", group: "Обучение", title: "Каталог профессий", description: "Профессии, компетенции и траектории развития" },
  { id: "learning", group: "Обучение", title: "Правила обучения", description: "Попытки и отображение результата" },
  { id: "kpi", group: "Обучение", title: "KPI и оценка", description: "Вес учебных и рабочих показателей" },
  { id: "ratings", group: "Обучение", title: "Рейтинги", description: "Видимость сравнения сотрудников" },
  { id: "notifications", group: "Обучение", title: "Напоминания", description: "Сроки уведомлений о заданиях" },
  { id: "modes", group: "Обучение", title: "Доступ к режимам", description: "AI, голосовые и видео функции" },
  { id: "privacy", group: "Данные", title: "Приватность", description: "Доступ к результатам и срок хранения" },
  { id: "audit", group: "Данные", title: "Журнал изменений", description: "Действия внутри компании" },
];

export function SettingsWorkspace(props) {
  const [view, setView] = useState(null);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("ru");
  const allowedCategories = settingsCategories.filter(item => item.id === "catalog" ? props.data.permissions?.manage_learning : props.data.permissions?.manage_company);
  const visible = allowedCategories.filter(item => !normalized || [item.title, item.description, item.group].some(value => value.toLocaleLowerCase("ru").includes(normalized)));
  const selected = allowedCategories.find(item => item.id === view);
  const groups = [...new Set(allowedCategories.map(item => item.group))];
  return <section className={`business-settings-explorer${selected ? " is-detail-open" : ""}`}>
    <aside className="business-settings-catalog" aria-label="Разделы настроек">
      <label className="business-settings-search">Поиск по настройкам<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Например, логотип или доступ" /></label>
      <nav>
        {groups.map(group => { const items = visible.filter(item => item.group === group); return items.length > 0 && <section key={group} className="business-settings-group"><h2>{group}</h2>{items.map(item => <button type="button" key={item.id} className={view === item.id ? "is-active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span><b>{item.title}</b><small>{item.description}</small></span><i aria-hidden="true">›</i></button>)}</section>; })}
        {!visible.length && <p className="business-settings-search-empty">Настройки не найдены.</p>}
      </nav>
    </aside>
    <div className="business-settings-detail">
      {selected ? <>
        <button type="button" className="business-settings-back" onClick={() => setView(null)}>← Все настройки</button>
        <header className="business-settings-detail-heading"><span>{selected.group}</span><h2>{selected.title}</h2><p>{selected.description}</p></header>
        {view === "catalog" && <CatalogManager {...props} />}
        {view === "profile" && <Settings {...props} section="profile" />}
        {view === "logo" && <Settings {...props} section="logo" />}
        {view === "workspace" && <Settings {...props} section="workspace" />}
        {view === "access" && <AccessAndBilling {...props} />}
        {view === "security" && <SecurityCenter {...props} />}
        {view === "integrations" && <Integrations {...props} />}
        {["learning", "kpi", "ratings", "notifications", "modes", "privacy", "audit"].includes(view) && <Policies {...props} section={view} />}
      </> : <div className="business-settings-placeholder"><span aria-hidden="true">⌘</span><h2>Выберите раздел настроек</h2><p>Используйте поиск или откройте нужный пункт в списке.</p></div>}
    </div>
  </section>;
}

export function MeetingsWorkspace(props) {
  return <MeetingProtocols {...props} />;
}
