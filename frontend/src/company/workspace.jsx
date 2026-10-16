import { useState } from "react";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import { Employees, Applications, Teams, Cohorts } from "./organization.jsx";
import { Assignments, ProgramBuilder } from "./learning.jsx";
import { Analytics, Ratings } from "./insights.jsx";
import { Achievements, CorporateActivities, Surveys } from "./engagement.jsx";
import { Certificates } from "./certificates.jsx";
import { AccessAndBilling, Policies, Settings } from "./settings.jsx";

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
  const [view, setView] = useState("people");
  const tabs = [["people", "Сотрудники"], ["structure", "Подразделения"]];
  if (canManageCompany) tabs.push(["applications", "Заявки"]);
  return <section className="business-workspace-page">
    <SectionTabs items={tabs} value={view} onChange={setView} label="Разделы команды" />
    {view === "people" && <Employees {...props} />}
    {view === "structure" && <Teams {...props} />}
    {view === "applications" && canManageCompany && <Applications {...props} />}
  </section>;
}

export function AssignmentsWorkspace(props) {
  const canManageLearning = props.data.permissions?.manage_learning;
  const [view, setView] = useState("assignments");
  const tabs = [["assignments", "Все назначения"], ["groups", "Учебные команды"]];
  if (canManageLearning) tabs.push(["programs", "Программы"]);
  return <section className="business-workspace-page">
    <SectionTabs items={tabs} value={view} onChange={setView} label="Разделы назначений" />
    {view === "assignments" && <Assignments {...props} />}
    {view === "groups" && <Cohorts {...props} />}
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

export function SettingsWorkspace(props) {
  const [view, setView] = useState("company");
  return <section className="business-workspace-page">
    <SectionTabs
      label="Настройки компании"
      value={view}
      onChange={setView}
      items={[["company", "Профиль компании"], ["access", "Доступ и лицензии"], ["rules", "Правила и журнал"]]}
    />
    {view === "company" && <Settings {...props} />}
    {view === "access" && <AccessAndBilling {...props} />}
    {view === "rules" && <Policies {...props} />}
  </section>;
}

export function MeetingsWorkspace(props) {
  return <CorporateActivities {...props} view="meetings" />;
}
