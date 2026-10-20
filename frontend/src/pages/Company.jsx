import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useEffect } from "../company/shared.jsx";
import { Loader, Notice, Onboarding, CompanySection } from "../company/index.js";

export default function CompanyPage() {
  const { user } = useAuth(); const navigate = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState(""); const [tab, setTab] = useState("overview");
  const load = async (companyId = localStorage.getItem("arena_company_id"), restoring = false) => {
    try {
      let value;
      try { value = await api(`/api/company/context${companyId ? `?company_id=${encodeURIComponent(companyId)}` : ""}`); }
      catch (cause) {
        if (!restoring || !companyId) throw cause;
        value = await api("/api/company/context");
        if (value.has_company) localStorage.setItem("arena_company_id", String(value.company.id));
        else localStorage.removeItem("arena_company_id");
      }
      setData(value); setError(""); return value;
    } catch (cause) { setError(cause.message); }
  };
  useEffect(() => { load(localStorage.getItem("arena_company_id"), true); }, []);
  function switchCompany(companyId) { localStorage.setItem("arena_company_id", companyId); setData(null); setTab("overview"); load(companyId); }
  async function start(id) { try { const result = await api(`/api/company/${data.company.id}/assignments/${id}/start`, { method: "POST" }); navigate(`/play/${result.session_id}`, { state: { returnTo: "/company" } }); } catch (e) { setError(e.message); } }
  const navigationGroups = useMemo(() => {
    if (!data?.has_company) return [];
    if (!data.permissions.manage_team) return [
      { id: "home", label: "Главное", tabs: [["overview", "Обзор"]] },
      { id: "news", label: "Новости", tabs: [["news", "Лента компании"]] },
      { id: "assignments", label: "Мои задания", tabs: [["assignments", "Мои задания"]] },
      { id: "team", label: "Команда", tabs: [["directory", "Сотрудники"]] },
      { id: "results", label: "Результаты", tabs: [["results", "Мои результаты"], ["ratings", "Рейтинг"], ["achievements", "Достижения"], ["surveys", "Опросы"], ["certificates", "Сертификаты"]] },
      { id: "collaboration", label: "Совместная практика", tabs: [["activities", "Встречи и турниры"]] },
    ];
    return [
      { id: "home", label: "Главное", tabs: [["overview", "Обзор"]] },
      { id: "news", label: "Новости", tabs: [["news", "Лента компании"]] },
      { id: "learning", label: "Обучение", tabs: [["assignments", "Задания"], ["program-builder", "Конструктор программ"], ["content", "Библиотека"]] },
      { id: "teams", label: "Команды", tabs: [["teams", "Команды"], ["cohorts", "Когорты"]] },
      { id: "results", label: "Результаты", tabs: [["analytics", "Аналитика"], ["ratings", "Рейтинг"], ["achievements", "Достижения"], ["surveys", "Опросы"], ["certificates", "Сертификаты"]] },
      { id: "collaboration", label: "Совместная практика", tabs: [["activities", "Встречи и турниры"]] },
    ];
  }, [data]);
  const managementTabs = data?.permissions?.manage_company
    ? [["settings", "Настройки компании"], ["employees", "Сотрудники"], ["applications", "Заявки"], ["policies", "Правила"], ["integrations", "Интеграции"]]
    : data?.permissions?.manage_team ? [["employees", "Сотрудники"]] : [];
  const managingCompany = managementTabs.some(([key]) => key === tab);
  const activeGroup = navigationGroups.find((group) => group.tabs.some(([key]) => key === tab));
  if (!data) return <Loader error={error} onRetry={() => load()} />; if (!data.has_company) return <Onboarding data={data} reload={load} />;
  return <section className="company-space space-y-6">
    <header className="glass company-identity-header">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className={`company-identity-logo grid h-16 w-16 place-items-center overflow-hidden rounded-2xl text-2xl font-black${data.company.logo ? "" : " is-placeholder"}`}>
            {data.company.logo
              ? <img src={data.company.logo} alt={`Логотип ${data.company.name}`} className="h-full w-full object-cover" />
              : <span aria-hidden="true">{(data.company.short_name || data.company.name).slice(0, 1)}</span>}
          </div>
          <div>
            <div className="eyebrow">КОРПОРАТИВНОЕ ПРОСТРАНСТВО</div>
            <h1 className="mt-1 text-3xl font-extrabold">{data.company.name}</h1>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <a className="subtle-button" href={`/business/${data.company.id}/overview`}>Открыть Арену бизнеса</a>
          {data.companies.filter((item) => item.status === "ACTIVE").length > 1 && (
            <select aria-label="Текущая компания" className="company-input mt-0" value={data.company.id} onChange={(event) => switchCompany(event.target.value)}>
              {data.companies.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.company_id} value={item.company_id}>{item.name}{item.department ? ` · ${item.department}` : ""}</option>)}
            </select>
          )}
          {managementTabs.length > 0 && (
            <button type="button" className={`${managingCompany ? "primary-button" : "subtle-button"} self-start`} aria-current={managingCompany ? "page" : undefined} onClick={() => setTab(managementTabs[0][0])}>Управление</button>
          )}
          <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
            <span className="text-slate-500">Вы вошли как</span><b className="ml-2">{data.membership.role_label}</b>
          </div>
        </div>
      </div>
    </header>
    {error && <Notice tone="red">{error}</Notice>}
    {managingCompany ? (
      <div className="space-y-4">
        <button type="button" className="subtle-button" onClick={() => setTab("overview")}>Вернуться к компании</button>
        <nav className="company-subnav flex flex-wrap gap-x-5 gap-y-2" aria-label="Управление компанией">
          {managementTabs.map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}
        </nav>
      </div>
    ) : <nav className="flex flex-wrap gap-2" aria-label="Разделы компании">{navigationGroups.map((group) => <button key={group.id} type="button" aria-current={activeGroup?.id === group.id ? "page" : undefined} className={activeGroup?.id === group.id ? "primary-button whitespace-nowrap" : "subtle-button whitespace-nowrap"} onClick={() => setTab(group.tabs[0][0])}>{group.label}</button>)}</nav>}
    {activeGroup?.tabs.length > 1 && <nav className="company-subnav flex flex-wrap gap-x-5 gap-y-2" aria-label={`Подразделы: ${activeGroup.label}`}>{activeGroup.tabs.map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>}
    <CompanySection tab={tab} data={data} reload={load} setTab={setTab} start={start} />
  </section>;
}
