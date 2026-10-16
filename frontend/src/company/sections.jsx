import { Loader, Empty, Notice } from "./shared.jsx";
import { Onboarding } from "./onboarding.jsx";
import { EmployeeHome, Assignments, ContentLibrary, ProgramBuilder } from "./learning.jsx";
import { Employees, Applications, Directory, Teams, Cohorts } from "./organization.jsx";
import { ManagerOverview, Analytics, Ratings, MyResults } from "./insights.jsx";
import { CorporateActivities, Achievements, Surveys, Calendar } from "./engagement.jsx";
import { Certificates } from "./certificates.jsx";
import { Policies, Integrations, Settings, AccessAndBilling } from "./settings.jsx";
import { CompanyNotifications } from "./notifications.jsx";

// Both the established /company page and Arena Business render these same modules.
// All data and actions continue through the existing authenticated API client.
export function CompanySection({ tab, data, reload, setTab, start }) {
  if (!data) return <Loader />;
  if (!data.has_company) return <Onboarding data={data} reload={reload} />;
  const props = { data, reload, setTab, start };
  const canManage = data.permissions?.manage_team;
  switch (tab) {
    case "overview": return canManage ? <ManagerOverview {...props} /> : <EmployeeHome {...props} />;
    case "assignments": return <Assignments {...props} />;
    case "learning": return <EmployeeHome {...props} />;
    case "results": return <MyResults {...props} />;
    case "employees": return canManage ? <Employees {...props} /> : <Directory {...props} />;
    case "applications": return data.permissions?.manage_company ? <DemoReadOnly data={data}><Applications {...props} /></DemoReadOnly> : <Empty>Раздел доступен администраторам компании.</Empty>;
    case "structure":
    case "teams": return canManage ? <Teams {...props} /> : <Directory {...props} />;
    case "cohorts": return <Cohorts {...props} />;
    case "achievements": return <Achievements {...props} />;
    case "surveys": return <Surveys {...props} />;
    case "content": return <ContentLibrary {...props} />;
    case "scenarios": return <ContentLibrary {...props} initialSection="scenarios" />;
    case "library": return <ContentLibrary {...props} initialSection="materials" />;
    case "programs":
    case "program-builder": return data.permissions?.manage_learning ? <ProgramBuilder {...props} /> : <EmployeeHome {...props} />;
    case "analytics": return data.permissions?.view_analytics ? <Analytics {...props} /> : <MyResults {...props} />;
    case "ratings": return <Ratings {...props} />;
    case "activities": return <CorporateActivities {...props} />;
    case "meetings": return <CorporateActivities {...props} view="meetings" />;
    case "tournaments": return <CorporateActivities {...props} view="tournaments" />;
    case "goals": return <CorporateActivities {...props} view="goals" />;
    case "certificates": return <Certificates {...props} />;
    case "calendar": return <Calendar {...props} />;
    case "notifications": return <CompanyNotifications data={data} reload={reload} />;
    case "directory": return <Directory {...props} />;
    case "policies": return data.permissions?.manage_company ? <DemoReadOnly data={data}><Policies {...props} /></DemoReadOnly> : <Empty>Раздел доступен администраторам компании.</Empty>;
    case "integrations": return data.permissions?.manage_company ? <DemoReadOnly data={data}><Integrations {...props} /></DemoReadOnly> : <Empty>Раздел доступен администраторам компании.</Empty>;
    case "access": return data.permissions?.manage_company ? <DemoReadOnly data={data}><AccessAndBilling {...props} /></DemoReadOnly> : <Empty>Раздел доступен администраторам компании.</Empty>;
    case "settings": return data.permissions?.manage_company ? <DemoReadOnly data={data}><Settings {...props} /></DemoReadOnly> : <Empty>Раздел доступен администраторам компании.</Empty>;
    default: return <Empty>Раздел не найден. Выберите пункт в навигации компании.</Empty>;
  }
}

function DemoReadOnly({ data, children }) {
  if (data.company.status !== "DEMO") return children;
  return <div className="space-y-5"><Notice>В публичном демо эти настройки доступны для просмотра. Создайте собственную компанию, чтобы сохранять изменения.</Notice><fieldset disabled className="min-w-0">{children}</fieldset></div>;
}
