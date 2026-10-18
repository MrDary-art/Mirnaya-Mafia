import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import { businessPath } from "../business/navigation.js";
import { EmployeeHome } from "./learning.jsx";
import { EmployeeCabinet } from "./employee-cabinet.jsx";
import { AssignmentsWorkspace, CommunityWorkspace, ResultsWorkspace, TeamWorkspace } from "./workspace.jsx";
import { Directory } from "./organization.jsx";
import { AdvancedHub } from "./advanced.jsx";
import { GrowthTools } from "./growth.jsx";
import { ProfessionalProfile } from "./company-tools.jsx";
import { Empty, Loader, formatDate, statusLabels } from "./shared.jsx";
import { ManagerOverview } from "./insights.jsx";
import { companyPilot, PilotBrief, PilotCommandCenter, PilotLaunchCard } from "./pilot.jsx";

const complete = new Set(["PASSED", "COMPLETED"]);
const active = new Set(["ASSIGNED", "OPENED", "IN_PROGRESS"]);

function ProductTabs({ value, onChange, items, label }) {
  return <nav className="business-product-tabs" aria-label={label}>
    {items.map(item => <button key={item.id} type="button" className={value === item.id ? "is-active" : ""} aria-current={value === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>
      <Icon name={item.icon} size={17}/><span>{item.label}</span>
    </button>)}
  </nav>;
}
function MyArenaNext({ data, arena }) {
  const companyId = data.company.id;
  const episodes = arena?.episodes || [];
  const next = episodes.find(item => ["PREPARING", "READY", "IN_MEETING", "PROTOCOL_REVIEW"].includes(item.status));
  const commitments = (arena?.commitments || []).slice(0, 3);
  const meetings = (arena?.meetings || []).slice(0, 2);
  return <section className="business-my-arena">
    <header><div><span>Моя Арена</span><h3>{next?.title || "Следующий разговор ещё не создан"}</h3><p>{next?.expected_result || "Создайте эпизод перед важной встречей — подготовка останется приватной."}</p></div><Link className="primary-button" to={businessPath(companyId, "episodes")}>{next ? next.status === "READY" ? "Открыть" : "Подготовиться" : "Создать эпизод"} <Icon name="arrow-right" size={17}/></Link></header>
    {(commitments.length > 0 || meetings.length > 0) && <div className="business-my-arena-items">
      {commitments.length > 0 && <section><h4>Мои обязательства</h4>{commitments.map(item => <Link key={item.id} to={businessPath(companyId, "episodes")}><span>{item.title}</span><small>{item.status === "BLOCKED" ? "Есть блокер" : item.due_at ? formatDate(item.due_at) : "Без срока"}</small></Link>)}</section>}
      {meetings.length > 0 && <section><h4>Ближайшие встречи</h4>{meetings.map(item => <Link key={item.id} to={businessPath(companyId, "meetings")}><span>{item.title}</span><small>{item.scheduled_at ? formatDate(item.scheduled_at) : "Время уточняется"}</small></Link>)}</section>}
    </div>}
  </section>;
}
export function BusinessHome({ data, start }) {
  const { user } = useAuth();
  const assignments = data.assignments || [];
  const available = assignments.filter(item => active.has(item.status));
  const next = available.find(item => item.status === "IN_PROGRESS") || available[0];
  const done = assignments.filter(item => complete.has(item.status)).length;
  const overdue = assignments.filter(item => item.status === "OVERDUE").length;
  const progress = assignments.length ? Math.round(done * 100 / assignments.length) : 0;
  const enrolled = (data.programs || []).filter(item => item.enrolled);
  const name = (user?.display_name || user?.username || "").trim().split(/\s+/)[0];
  const greeting = new Date().getHours() < 12 ? "Доброе утро" : new Date().getHours() < 18 ? "Добрый день" : "Добрый вечер";
  const companyId = data.company.id;
  const canSeeTeam = Boolean(data.permissions?.manage_team || data.permissions?.view_analytics);
  const canLaunchPilot = Boolean(data.permissions?.manage_company);
  const pilot = companyPilot(data);
  const [myArena, setMyArena] = useState(null);
  const [openCouncils, setOpenCouncils] = useState([]);
  useEffect(() => {
    let current = true;
    api(`/api/company/${companyId}/my-arena`).then(value => { if (current) setMyArena(value); }).catch(() => { if (current) setMyArena(null); });
    return () => { current = false; };
  }, [companyId]);
  useEffect(() => {
    if (data.company.status === "DEMO") {
      setOpenCouncils([]);
      return undefined;
    }
    let activeRequest = true;
    api(`/api/council?company_id=${companyId}`).then(items => {
      if (activeRequest) setOpenCouncils(items.filter(item => item.accepting_registration).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
    }).catch(() => { if (activeRequest) setOpenCouncils([]); });
    return () => { activeRequest = false; };
  }, [companyId, data.company.status]);
  const openCouncil = openCouncils[0];

  if (canLaunchPilot && !pilot) return <PilotLaunchCard data={data}/>;

  return <section className="business-home">
    <header className="business-home-welcome"><p>{greeting}{name ? `, ${name}` : ""}.</p><h2>{next ? "Продолжите с того места, где остановились" : "Рабочее пространство готово"}</h2></header>
    <MyArenaNext data={data} arena={myArena}/>
    {pilot && <PilotBrief data={data}/>}
    {canLaunchPilot && <div className="business-home-actions">
      <Link className="primary-button" to={`${businessPath(companyId, "learning")}?view=manage`}>Назначить практику <Icon name="arrow-right" size={17}/></Link>
      <Link className="subtle-button" to={businessPath(companyId, "meetings")}>Встречи и решения</Link>
    </div>}
    {canLaunchPilot && pilot && <PilotCommandCenter data={data}/>}
    <div className="business-home-focus">
      <article className="business-focus-card">
        <div><span className="business-eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h3>{next?.title || "Новых обязательных заданий нет"}</h3><p>{next?.description || "Можно открыть обучение, выбрать практику или посмотреть свой прогресс."}</p></div>
        {next ? <><div className="business-focus-meta"><span><Icon name="calendar-days" size={16}/>{next.deadline ? formatDate(next.deadline) : "Без срока"}</span><span>{statusLabels[next.status] || next.status}</span></div><button className="primary-button" onClick={() => start(next.target_id || next.id)}>{next.status === "IN_PROGRESS" ? "Продолжить" : "Начать"}</button></> : <Link className="primary-button" to={businessPath(companyId, "learning")}>Открыть обучение</Link>}
      </article>
      <aside className="business-today-panel">
        <div><span>Общий прогресс</span><strong>{progress}%</strong></div><div className="business-home-progress" aria-label={`Выполнено ${progress}%`}><i style={{width:`${progress}%`}}/></div>
        <dl><div><dt>В работе</dt><dd>{available.length}</dd></div><div><dt>Просрочено</dt><dd>{overdue}</dd></div><div><dt>Программ</dt><dd>{enrolled.length}</dd></div></dl>
        <Link to={businessPath(companyId, "profile")}>Открыть профиль <span aria-hidden="true">→</span></Link>
      </aside>
    </div>
    {openCouncil && <aside className="business-home-council" aria-labelledby="business-home-council-title">
      <Icon name="users" size={22}/><div><span>{openCouncil.my_status ? "ЗАПИСЬ ОТКРЫТА ДЛЯ КОМПАНИИ" : "МОЖНО ЗАПИСАТЬСЯ"}</span><h3 id="business-home-council-title">{openCouncil.title}</h3><p>Совет решений · {formatDate(openCouncil.scheduled_at)} · {openCouncil.available_seats > 0 ? `свободно мест: ${openCouncil.available_seats}` : "доступна запись в резерв"}</p></div><Link to={`/business/${companyId}/council/${openCouncil.id}`}>{openCouncil.registration_open ? "Записаться" : "Посмотреть игру"} <Icon name="arrow-right" size={17}/></Link>
    </aside>}
    <div className="business-home-secondary">
      <section><div className="business-section-line"><div><span className="business-eyebrow">МОЙ ПЛАН</span><h3>Ближайшие задачи</h3></div><Link to={businessPath(companyId, "learning")}>Все задания</Link></div>
        <div className="business-home-task-list">{available.slice(0, 3).map(item => <button key={item.target_id || item.id} type="button" onClick={() => start(item.target_id || item.id)}><span><b>{item.title}</b><small>{item.deadline ? formatDate(item.deadline) : "Без срока"}</small></span><Icon name="arrow-right" size={18}/></button>)}{!available.length && <Empty>Здесь появятся новые задания и этапы программ.</Empty>}</div>
      </section>
      <section><div className="business-section-line"><div><span className="business-eyebrow">КОМАНДА</span><h3>{canSeeTeam ? "Состояние команды" : "Рабочее пространство"}</h3></div><Link to={businessPath(companyId, "team")}>Открыть</Link></div>
        <p className="business-home-note">{canSeeTeam ? `В компании ${data.summary?.employees ?? data.stats?.active_members ?? data.membership_count ?? "—"} активных сотрудников. Структура, общение и встречи собраны в одном разделе.` : "Найдите коллегу, откройте корпоративный чат или присоединитесь к активности команды."}</p>
      </section>
    </div>
    {data.permissions?.view_analytics && <ManagerOverview data={data} />}
  </section>;
}


export function LearningHub(props) {
  const canAssign = Boolean(props.data.permissions?.manage_learning || props.data.permissions?.manage_assignments);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = canAssign && ["manage", "automation"].includes(requestedView) ? requestedView : "mine";
  const setView = next => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "mine") nextParams.delete("view"); else nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
  };
  const tabs = [{id:"mine",label:"Моя практика",icon:"book-open"}];
  if (canAssign) tabs.push({id:"manage",label:"Назначить практику",icon:"check-check"},{id:"automation",label:"Автоматизация",icon:"calendar-days"});
  return <section className="business-product-hub">
    <ProductTabs value={view} onChange={setView} items={tabs} label="Разделы обучения"/>
    {view === "mine" && <EmployeeHome {...props}/>}
    {view === "manage" && canAssign && <AssignmentsWorkspace {...props}/>}
    {view === "automation" && canAssign && <GrowthTools data={props.data}/>}
  </section>;
}

export function TeamHub(props) {
  const canManage = Boolean(props.data.permissions?.manage_team);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = ["team", "communication"].includes(requestedView) ? requestedView : "team";
  const setView = next => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "team") nextParams.delete("view"); else nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
  };
  return <section className="business-product-hub">
    <ProductTabs value={view} onChange={setView} label="Разделы команды" items={[
      { id: "team", label: "Команда", icon: "users" },
      { id: "communication", label: "Общение и опросы", icon: "message-circle" },
    ]}/>
    {view === "team" && (canManage ? <TeamWorkspace {...props}/> : <Directory {...props}/>)}
    {view === "communication" && <CommunityWorkspace {...props}/>}
  </section>;
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
        {!state.gaps.length && <Empty>Назначьте профессию и целевые компетенции, чтобы появилась персональная карта.</Empty>}
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
  const canSeeAnalytics = Boolean(props.data.permissions?.view_analytics);
  const organizer = props.data.membership?.role === "COMPANY_OWNER";
  const [view, setView] = useState("overview");
  const tabs = [
    {id:"overview",label:"Обзор",icon:"circle-user-round"},
    {id:"assignments",label:"Задания",icon:"book-open"},
    {id:"analytics",label:"Аналитика",icon:"brain"},
    {id:"certificates",label:"Сертификаты",icon:"graduation-cap"},
    {id:"path",label:"Профессия и рост",icon:"target"},
    {id:"tools",label:"AI и архив",icon:"bot"},
  ];
  if (canSeeAnalytics) tabs.push({id:"team",label:"Развитие команды",icon:"users"});
  return <section className="business-product-hub">
    <ProductTabs value={view} onChange={setView} items={organizer ? tabs.filter(tab => !["assignments", "certificates", "path", "team"].includes(tab.id)) : tabs} label="Разделы профиля"/>
    {view === "analytics" && canSeeAnalytics ? <ResultsWorkspace {...props}/> : ["overview", "assignments", "analytics", "certificates"].includes(view) && <EmployeeCabinet key={view} data={props.data} start={props.start} initialTab={view} hideTabs />}
    {view === "path" && <div className="growth-path-stack"><ProfessionalProfile data={props.data}/><CareerPath data={props.data}/></div>}
    {view === "tools" && <AdvancedHub data={props.data}/>}
    {view === "team" && canSeeAnalytics && <ResultsWorkspace {...props}/>}
  </section>;
}
