import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useAuth } from "../auth.jsx";
import Icon from "../components/Icon.jsx";
import { PilotOnboarding } from "./pilot.jsx";
import { FeedIcon } from "../components/feed/FeedPrimitives.jsx";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import StoriesBar from "../components/feed/StoriesBar.jsx";
import { Employees, Applications, Teams, Cohorts } from "./organization.jsx";
import { Assignments, ContentLibrary, ProgramBuilder } from "./learning.jsx";
import { Analytics, Ratings } from "./insights.jsx";
import { Achievements, CorporateActivities } from "./engagement.jsx";
import { Certificates } from "./certificates.jsx";
import { AccessAndBilling, Integrations, Policies, Settings } from "./settings.jsx";
import { CompanyHierarchy } from "./hierarchy.jsx";
import { SecurityCenter } from "./company-tools.jsx";
import MeetingProtocols from "./meeting-protocols.jsx";
import { businessPath } from "../business/navigation.js";
import { Messenger } from "./messenger.jsx";
import { CompanyNotifications } from "./notifications.jsx";
import Surveys from "./surveys.jsx";
import "../pages/community-forest.css";

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
  const canManageTeam = props.data.permissions?.manage_team;
  const location = useLocation();
  const [hierarchyReady, setHierarchyReady] = useState(false);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!hierarchyReady || !["company-structure", "company-employees", "company-departments", "company-applications"].includes(id)) return undefined;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ behavior: "instant", block: "start" });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, hierarchyReady]);
  return <section className="business-workspace-page">
    <div className="business-team-overview">
      <div id="company-structure" tabIndex={-1}><CompanyHierarchy {...props} onReady={() => setHierarchyReady(true)} /></div>
      {canManageTeam && <div className="business-team-overview-section" id="company-employees" tabIndex={-1}>
        <Employees {...props} />
      </div>}
      {canManageCompany && <div className="business-team-overview-section" id="company-departments" tabIndex={-1}>
        <Teams {...props} />
      </div>}
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
      items={[["analytics", "Динамика"], ["recognition", "Сертификаты"], ["achievements", "Достижения"], ["rating", "Рейтинг"]]}
    />
    {view === "analytics" && <Analytics {...props} />}
    {view === "rating" && <Ratings {...props} />}
    {view === "recognition" && <div className="business-recognition-stack"><Certificates {...props} /></div>}
    {view === "achievements" && <Achievements data={props.data}/>}
  </section>;
}

export function CommunityWorkspace(props) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requested = searchParams.get("tab") || searchParams.get("section");
  const view = ["feed", "surveys", "messages", "notifications"].includes(requested) ? requested : "feed";
  const canPublish = props.data.company.status !== "DEMO" && ["COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER"].includes(props.data.membership.role);
  const base = businessPath(props.data.company.id, "community");
  const tabs = [
    ["feed", "Лента", "book-open"],
    ["surveys", "Опросы", "check-check"],
    ["messages", "Сообщения", "message-circle"],
    ["notifications", "Уведомления", "bell"],
  ];
  const href = tab => tab === "feed" ? base : `${base}?tab=${tab}`;
  return <section className="business-workspace-page business-community-workspace community-forest">
    <nav className="community-tabs business-community-tabs" aria-label="Разделы общения компании">
      {tabs.map(([id, label, icon]) => <Link key={id} to={href(id)} aria-current={view === id ? "page" : undefined}><Icon name={icon} size={18}/><span>{label}</span></Link>)}
    </nav>
    <div className={`business-community-content${view === "feed" ? " is-feed" : ""}`}>
      {view === "feed" && <>
        <div className="business-community-feed">
          <ProfileWall companyId={props.data.company.id} canPublish={canPublish} feedOnly />
        </div>
        <aside className="arena-feed-side community-side business-community-side" aria-label="Истории и ваша активность">
          <StoriesBar />
          {user?.id && <section className="community-connections"><header><h2>Ваш круг общения</h2><Link to="/profile" aria-label="Открыть свой профиль"><FeedIcon name="right" size={20} /></Link></header><ProfileWall userId={user.id} isSelf summaryOnly /></section>}
        </aside>
      </>}
      {view === "surveys" && <Surveys {...props} />}
      {view === "messages" && <Messenger {...props} />}
      {view === "notifications" && <CompanyNotifications data={props.data} reload={props.reload} onNavigate={navigate} />}
    </div>
  </section>;
}

const settingsCategories = [
  { id: "focus", group: "Рабочий процесс", title: "Фокус команды", description: "Общая тема и результат на период" },
  { id: "profile", group: "Компания", title: "Профиль компании", description: "Название, отрасль, размер и контакты" },
  { id: "logo", group: "Компания", title: "Логотип", description: "Изображение рабочего пространства" },
  { id: "workspace", group: "Компания", title: "Часовой пояс", description: "Сроки, расписания и напоминания" },
  { id: "access", group: "Доступ", title: "Права доступа", description: "Роли и разрешения сотрудников" },
  { id: "security", group: "Доступ", title: "Вход и сессии", description: "Код организации, рабочая почта и активные входы" },
  { id: "integrations", group: "Доступ", title: "Интеграции", description: "SSO, HRIS, LMS, CRM и уведомления" },
  { id: "notifications", group: "Обучение", title: "Напоминания", description: "Сроки уведомлений о заданиях" },
  { id: "privacy", group: "Данные", title: "Приватность", description: "Доступ к результатам и срок хранения" },
  { id: "audit", group: "Данные", title: "Журнал изменений", description: "Действия внутри компании" },
  { id: "guide", group: "Помощь", title: "Как устроена Арена", description: "Краткий обзор рабочего пространства и первый запуск" },
];

function TeamFocusSettings({ data, reload }) {
  return <PilotOnboarding key={data.company.id} data={data} reload={reload} embedded />;
}

function ArenaGuideSettings({ data }) {
  return <section className="business-arena-guide-settings business-management-card">
    <div>
      <span>ПЕРВЫЙ ЗАПУСК</span>
      <h3>Как устроена Арена</h3>
      <p>Арена помогает провести команду от подготовки к важному разговору до понятного результата.</p>
    </div>
    <ol>
      <li><b>Рабочие ситуации</b><span>Зафиксируйте событие, цель и участников.</span></li>
      <li><b>Практика</b><span>Назначьте нужную подготовку сотрудникам или подразделению.</span></li>
      <li><b>Встречи</b><span>Проведите созвон и подтвердите общий отчёт.</span></li>
    </ol>
    <Link className="primary-button" to={businessPath(data.company.id, "onboarding")}>Открыть онбординг</Link>
  </section>;
}

export function SettingsWorkspace(props) {
  const [view, setView] = useState("focus");
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("ru");
  const allowedCategories = settingsCategories.filter(() => props.data.permissions?.manage_company);
  const visible = allowedCategories.filter(item => !normalized || [item.title, item.description, item.group].some(value => value.toLocaleLowerCase("ru").includes(normalized)));
  const selected = allowedCategories.find(item => item.id === view);
  const groups = [...new Set(allowedCategories.map(item => item.group))];
  return <section className={`business-settings-explorer${selected ? " is-detail-open" : ""}`}>
    <aside className="business-settings-catalog" aria-label="Разделы настроек">
      <label className="business-settings-search">Поиск по настройкам<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Например, логотип или доступ" /></label>
      <nav>
        {groups.map(group => { const items = visible.filter(item => item.group === group); return items.length > 0 && <section key={group} className="business-settings-group"><h2>{group}</h2>{items.map(item => <button type="button" key={item.id} className={view === item.id ? "is-active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><span><b>{item.title}</b><small>{item.description}</small></span><CaretRightIcon size={18} aria-hidden="true"/></button>)}</section>; })}
        {!visible.length && <p className="business-settings-search-empty">Настройки не найдены.</p>}
      </nav>
    </aside>
    <div className="business-settings-detail">
      {selected ? <>
        <button type="button" className="business-settings-back" onClick={() => setView(null)}><Icon name="arrow-left" size={18}/>Все настройки</button>
        <header className="business-settings-detail-heading"><span>{selected.group}</span><h2>{selected.title}</h2><p>{selected.description}</p></header>
        {view === "focus" && <TeamFocusSettings {...props} />}
        {view === "profile" && <Settings {...props} section="profile" />}
        {view === "logo" && <Settings {...props} section="logo" />}
        {view === "workspace" && <Settings {...props} section="workspace" />}
        {view === "access" && <AccessAndBilling {...props} />}
        {view === "security" && <SecurityCenter {...props} />}
        {view === "integrations" && <Integrations {...props} />}
        {["notifications", "privacy", "audit"].includes(view) && <Policies {...props} section={view} />}
        {view === "guide" && <ArenaGuideSettings {...props} />}
      </> : <div className="business-settings-placeholder"><span className="business-settings-placeholder-icon" aria-hidden="true"><Icon name="settings" size={28}/></span><h2>Выберите раздел настроек</h2><p>Используйте поиск или откройте нужный пункт в списке.</p></div>}
    </div>
  </section>;
}

export function MeetingsWorkspace(props) {
  return <MeetingProtocols {...props} />;
}
