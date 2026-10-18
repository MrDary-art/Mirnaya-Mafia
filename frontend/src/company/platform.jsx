import { useSearchParams } from "react-router-dom";
import Dashboard from "./dashboard.jsx";
import AssignmentFocus from "./assignment-focus.jsx";
import { useWorkspaceTab, WorkspaceTabs } from "./workspace-ui.jsx";
import { ProfileIdentity, ConsentCenter } from "./profile-workspace.jsx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { businessPath } from "../business/navigation.js";
import { EmployeeHome } from "./learning.jsx";
import { EmployeeCabinet } from "./employee-cabinet.jsx";
import { AssignmentsWorkspace, ResultsWorkspace, TeamWorkspace } from "./workspace.jsx";
import { Directory } from "./organization.jsx";
import { AdvancedHub, ProfileInsights } from "./advanced.jsx";
import { GrowthTools } from "./growth.jsx";
import { ProfessionalProfile } from "./company-tools.jsx";
import { Empty, Loader, formatDate, statusLabels } from "./shared.jsx";

export function BusinessHome(props) { return <Dashboard key={props.data.membership.id} {...props}/>; }

export function LearningHub(props) {
  const canAssign = Boolean(props.data.permissions?.manage_learning || props.data.permissions?.manage_assignments);
  const [params] = useSearchParams();
  const focused = params.has("assignment") || params.has("target") || params.has("attempt");
  const tabs = [...(canAssign ? [["manage", "Управление обучением"]] : []), ["mine", "Мои задания"], ...(canAssign ? [["automation", "Расписания"], ["packs", "Готовые пакеты"]] : []), ...(props.data.permissions.view_analytics ? [["results", "Результаты команды"]] : [])];
  const [view, setView] = useWorkspaceTab("view", canAssign ? "manage" : "mine", tabs.map(([key]) => key));
  return <section className="business-product-hub"><p className="workspace-navigation-note">Здесь назначают и выполняют задания. Встречи находятся в календаре, личные результаты — в профиле.</p><WorkspaceTabs items={tabs} value={view} onChange={setView} label="Разделы обучения"/>
    <AssignmentFocus {...props}/>
    {!focused && view === "mine" && <EmployeeHome {...props}/>}
    {!focused && view === "manage" && canAssign && <AssignmentsWorkspace {...props}/>}
    {view === "automation" && canAssign && <GrowthTools data={props.data} section="schedules"/>}
    {view === "packs" && canAssign && <GrowthTools data={props.data} section="packs"/>}
    {view === "results" && <><ProfileInsights data={props.data} teamOnly/><ResultsWorkspace {...props}/></>}
  </section>;
}

export function TeamHub(props) {
  const canManage = Boolean(props.data.permissions?.manage_team);
  return canManage ? <TeamWorkspace {...props}/> : <Directory {...props}/>;
}


function CareerPath({ data }) {
  const [state, setState] = useState({ loading: true, error: "", catalog: null, gaps: [], recommendations: [], tracks: [], workspace: null });
  const companyId = data.company.id;
  const membershipId = data.membership.id;

  async function load() {
    setState(current => ({...current, loading: true, error: ""}));
    const results = await Promise.allSettled([
      api(`/api/company/${companyId}/catalog`),
      api(`/api/company/${companyId}/skill-gaps/${membershipId}`),
      api(`/api/company/${companyId}/recommendations/${membershipId}`),
      api(`/api/company/${companyId}/career-tracks`),
      api(`/api/company/${companyId}/me`),
    ]);
    const firstError = results.find(item => item.status === "rejected");
    setState({
      loading: false,
      error: firstError?.reason?.message || "",
      catalog: results[0].status === "fulfilled" ? results[0].value : null,
      gaps: results[1].status === "fulfilled" ? results[1].value?.gaps || [] : [],
      recommendations: results[2].status === "fulfilled" ? results[2].value || [] : [],
      tracks: results[3].status === "fulfilled" ? results[3].value || [] : [],
      workspace: results[4].status === "fulfilled" ? results[4].value : null,
    });
  }

  useEffect(() => { load(); }, [companyId, membershipId]);

  async function refreshRecommendations() {
    try {
      await api(`/api/company/${companyId}/skill-gaps/${membershipId}/recompute`, { method: "POST" });
      await load();
    } catch (cause) {
      setState(current => ({...current, error: cause.message}));
    }
  }

  if (state.loading) return <Loader />;
  const competencyById = new Map((state.catalog?.competencies || []).map(item => [item.id, item]));
  const programById = new Map((data.programs || []).map(item => [item.id, item]));
  const professionId = state.workspace?.profession?.id || data.membership.profession_id;
  const tracks = state.tracks.filter(item => !professionId || Number(item.profession_id) === Number(professionId));

  return <section className="career-path">
    {state.error && <p className="business-alert" role="alert">{state.error}</p>}
    <header className="career-path-heading"><div><span className="business-eyebrow">КАРТА РОСТА</span><h2>Профессиональная траектория</h2><p>Цели роли связаны с обучением и подтверждёнными результатами.</p></div><button type="button" className="subtle-button" onClick={refreshRecommendations}>Обновить рекомендации</button></header>
    <div className="career-path-grid">
      <article className="business-panel career-competencies"><h3>Компетенции роли</h3>
        {state.gaps.map(item => <div className="career-competency" key={item.competency_id}><div><span><b>{item.title}</b><small>{item.gap ? `До целевого уровня: ${item.gap}` : "Целевой уровень достигнут"}</small></span><strong>{item.current_level}/{item.target_level}</strong></div><div aria-label={`${item.title}: уровень ${item.current_level} из ${item.target_level}`}><i style={{width:`${Math.min(100, item.current_level / Math.max(1, item.target_level) * 100)}%`}}/></div></div>)}
        {!state.gaps.length && <Empty>Карта появится после настройки профессии и целевых компетенций компанией.</Empty>}
      </article>
      <article className="business-panel career-recommendations"><h3>Следующие действия</h3>
        {state.recommendations.map(item => <div key={item.id}><span><b>{programById.get(item.program_id)?.title || competencyById.get(item.competency_id)?.title || "Рекомендация по развитию"}</b><small>{item.reason}</small></span><em>Приоритет {item.priority}</em></div>)}
        {!state.recommendations.length && <Empty>Открытых рекомендаций нет. Обновите расчёт после новых результатов.</Empty>}
        <Link className="subtle-button" to={businessPath(companyId, "learning")}>Перейти к обучению</Link>
      </article>
    </div>
    <section className="career-track-list"><div className="business-section-line"><div><span className="business-eyebrow">ТРАЕКТОРИЯ</span><h3>Этапы квалификации</h3></div></div>
      {tracks.map(track => <article key={track.id}><header><div><h3>{track.title}</h3><p>{track.description}</p></div><span>{track.steps.length} этапов</span></header><ol>{track.steps.map(step => <li key={step.id}><span>{step.level}</span><div><b>{step.title}</b><small>{step.recommended_program_ids?.length ? `Рекомендуемых программ: ${step.recommended_program_ids.length}` : "Подтвердите компетенции этапа"}</small></div></li>)}</ol></article>)}
      {!tracks.length && <Empty>Для вашей профессии карьерная траектория пока не опубликована.</Empty>}
    </section>
  </section>;
}

export function ProfileHub(props) {
  const tabs = [["overview", "Личные данные"], ["analytics", "Мои результаты"], ["certificates", "Сертификаты"], ["path", "Профессия и рост"], ["tools", "Архив"], ["consents", "Согласия и доступ"]];
  const [view, setView] = useWorkspaceTab("view", "overview", tabs.map(([key]) => key));
  return <section className="business-product-hub"><WorkspaceTabs items={tabs} value={view} onChange={setView} label="Разделы профиля"/>
    {view === "overview" && <ProfileIdentity data={props.data}/>}
    {view === "analytics" && <div className="profile-results"><EmployeeCabinet key={view} data={props.data} start={props.start} initialTab="analytics" hideTabs/><ProfileInsights key={props.data.membership.id} data={props.data} personalOnly/></div>}
    {view === "certificates" && <EmployeeCabinet data={props.data} start={props.start} initialTab="certificates" hideTabs/>}
    {view === "path" && <div className="growth-path-stack"><ProfessionalProfile data={props.data}/><CareerPath data={props.data}/></div>}
    {view === "tools" && <AdvancedHub key={props.data.membership.id} data={props.data}/>}
    {view === "consents" && <ConsentCenter data={props.data}/>}
  </section>;
}
