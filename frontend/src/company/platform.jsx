import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import Icon from "../components/Icon.jsx";
import ForestSectionHeader from "../components/ForestSectionHeader.jsx";
import { businessPath } from "../business/navigation.js";
import { Assignments, EmployeeHome } from "./learning.jsx";
import { EmployeeCabinet } from "./employee-cabinet.jsx";
import { CommunityWorkspace, ResultsWorkspace, TeamWorkspace } from "./workspace.jsx";
import { AdvancedHub } from "./advanced.jsx";
import { GrowthTools } from "./growth.jsx";
import { ProfessionalProfile } from "./company-tools.jsx";
import { Empty, Loader, formatDate } from "./shared.jsx";
import { companyPilot, PilotBrief } from "./pilot.jsx";
import "../business/business-home-forest.css";
import "../business/business-profile-forest.css";

function ProductTabs({ value, onChange, items, label }) {
  return <nav className="business-product-tabs" aria-label={label}>
    {items.map(item => <button key={item.id} type="button" className={value === item.id ? "is-active" : ""} aria-current={value === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>
      <Icon name={item.icon} size={17}/><span>{item.label}</span>
    </button>)}
  </nav>;
}
function employeeCountLabel(count) {
  if (!Number.isInteger(count)) return "Сотрудники компании";
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "сотрудников" : last === 1 ? "сотрудник" : last >= 2 && last <= 4 ? "сотрудника" : "сотрудников";
  return `${count} ${noun} в компании`;
}
function MyArenaNext({ data, arena, manager = false }) {
  const companyId = data.company.id;
  const episodes = arena?.episodes || [];
  const invitation = episodes.find(item => item.participation?.status === "INVITED");
  const next = invitation || episodes.find(item => ["PREPARING", "READY", "IN_MEETING", "PROTOCOL_REVIEW", "ACTIVE"].includes(item.status));
  const commitments = (arena?.commitments || []).slice(0, 3);
  const meetings = (arena?.meetings || []).slice(0, 2);
  const episodePath = id => `${businessPath(companyId, "episodes")}?episode=${id}`;
  const statusLabel = {
    PREPARING: "Подготовка",
    READY: "Готово к встрече",
    IN_MEETING: "Встреча идёт",
    PROTOCOL_REVIEW: "Проверка итогов",
    ACTIVE: "В работе",
  };
  if (!next) return null;
  const actionLabel = invitation ? "Ответить" : ["READY", "ACTIVE"].includes(next.status) ? "Открыть" : "Подготовиться";
  return <section className="business-my-arena">
    <header><div><h2>{next.title}</h2><p>{next.expected_result || "Опишите важный разговор, пригласите подчинённых и зафиксируйте решение."}</p><span className="business-home-card-status">{statusLabel[next.status] || "В работе"}</span></div><Link className={manager ? "subtle-button" : "primary-button"} data-business-tour="next-step" to={episodePath(next.id)}>{actionLabel} <Icon name="arrow-right" size={17}/></Link></header>
    {(commitments.length > 0 || meetings.length > 0) && <div className="business-my-arena-items">
      {commitments.length > 0 && <section><h4>Мои обязательства</h4>{commitments.map(item => <Link key={item.id} to={episodePath(item.episode_id)}><span>{item.title}</span><small>{item.status === "BLOCKED" ? "Есть блокер" : item.due_at ? formatDate(item.due_at) : "Без срока"}</small></Link>)}</section>}
      {meetings.length > 0 && <section><h4>Ближайшие встречи</h4>{meetings.map(item => <Link key={item.id} to={`${businessPath(companyId, "meetings")}?meeting=${item.id}`}><span>{item.title}</span><small>{item.scheduled_at ? formatDate(item.scheduled_at) : "Время уточняется"}</small></Link>)}</section>}
    </div>}
  </section>;
}
function MemberBusinessHome({ data, start }) {
  const companyId = data.company.id;
  const pilot = companyPilot(data);
  const [openCouncils, setOpenCouncils] = useState([]);
  const assignments = data.assignments || [];
  const available = assignments.filter(item => item.can_start !== false && ["IN_PROGRESS", "ASSIGNED", "OPENED", "FAILED"].includes(item.status));
  const next = available.find(item => item.status === "IN_PROGRESS") || available[0];
  const upcoming = available.filter(item => item !== next).slice(0, 3);
  const [myArena, setMyArena] = useState({ status: "loading", value: null, error: "" });
  const [teamProgress, setTeamProgress] = useState({ status: "loading", value: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [progressRetry, setProgressRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setMyArena({ status: "loading", value: null, error: "" });
    api(`/api/company/${companyId}/my-arena`).then(value => { if (current) setMyArena({ status: "ready", value, error: "" }); }).catch(cause => { if (current) setMyArena({ status: "error", value: null, error: cause.message }); });
    return () => { current = false; };
  }, [companyId, retry]);
  useEffect(() => {
    if (data.company.status === "DEMO") {
      setOpenCouncils([]);
      return undefined;
    }
    let current = true;
    api(`/api/council?company_id=${companyId}`).then(items => {
      if (current) setOpenCouncils(items.filter(item => item.accepting_registration).sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at)));
    }).catch(() => { if (current) setOpenCouncils([]); });
    return () => { current = false; };
  }, [companyId, data.company.status]);
  const isManager = Boolean(data.permissions?.manage_company || data.permissions?.manage_team);
  const canCreateWorkSituation = isManager && ["COMPANY_OWNER", "COMPANY_ADMIN", "LND_MANAGER", "DEPARTMENT_MANAGER", "TEAM_LEAD"].includes(data.membership?.role);
  const needsTeam = Boolean(data.permissions?.invite_members && (data.summary?.employees || 0) <= 1);
  const canSeeTeamProgress = Boolean(data.permissions?.view_analytics);
  const showTeamProgress = canSeeTeamProgress && !needsTeam;
  const openCouncil = openCouncils[0];
  useEffect(() => {
    if (!showTeamProgress) return undefined;
    let current = true;
    setTeamProgress({ status: "loading", value: null, error: "" });
    api(`/api/company/${companyId}/analytics`).then(value => { if (current) setTeamProgress({ status: "ready", value, error: "" }); }).catch(cause => { if (current) setTeamProgress({ status: "error", value: null, error: cause.message }); });
    return () => { current = false; };
  }, [companyId, showTeamProgress, progressRetry]);
  return <section className="business-home">
    <header className="business-home-welcome" data-business-tour="overview"><div><h1>Главная</h1><p>Здесь собраны рабочие ситуации команды, назначенная практика и обязательства.</p></div></header>
    {pilot && <PilotBrief data={data}/>}
    {openCouncil && <aside className="business-home-council" aria-labelledby="business-home-council-title">
      <Icon name="users" size={22}/><div><span>Совет решений</span><h3 id="business-home-council-title">{openCouncil.title}</h3><p>{formatDate(openCouncil.scheduled_at)} · {openCouncil.available_seats > 0 ? `свободно мест: ${openCouncil.available_seats}` : "доступна запись в резерв"}</p></div><Link to={`/business/${companyId}/council/${openCouncil.id}`}>{openCouncil.registration_open ? "Записаться" : "Посмотреть игру"} <Icon name="arrow-right" size={17}/></Link>
    </aside>}
    {myArena.status === "loading" && <p className="business-home-status" role="status">Загружаем ваши рабочие ситуации…</p>}
    {myArena.status === "error" && <section className="business-home-retry" role="alert"><p>Не удалось загрузить рабочие ситуации. {myArena.error}</p><button type="button" className="subtle-button" onClick={() => setRetry(value => value + 1)}>Повторить</button></section>}
    {myArena.status === "ready" && <MyArenaNext data={data} arena={myArena.value} manager={canCreateWorkSituation}/>}
    {next && <section className="business-home-task">
      <div><h2>{next.title}</h2><p>{next.description || "У вас есть назначенная практика."}</p></div>
      <button className={isManager ? "subtle-button" : "primary-button"} onClick={() => start(next.target_id || next.id)}>{next.status === "IN_PROGRESS" ? "Продолжить практику" : next.attempts_used > 0 ? "Повторить практику" : "Начать практику"}<Icon name="arrow-right" size={17}/></button>
    </section>}
    {needsTeam && <section className="business-first-step"><div><span className="business-first-step-icon" aria-hidden="true"><Icon name="users" size={22}/></span><div><h2>Добавьте команду</h2><p>Пригласите коллег — тогда сможете разбирать ситуации и договорённости вместе.</p></div></div><Link className="subtle-button" to={`${businessPath(companyId, "team")}#company-employees`}>Открыть команду <Icon name="arrow-right" size={17}/></Link></section>}
    <div className="business-home-overview">
      <section className="business-home-upcoming" aria-labelledby="business-home-upcoming-title"><header><h2 id="business-home-upcoming-title">Практика</h2><Link to={businessPath(companyId, "learning")}>Все задания <Icon name="arrow-right" size={16}/></Link></header>
        {upcoming.length ? <div>{upcoming.map(item => <button type="button" key={item.target_id || item.id} onClick={() => start(item.target_id || item.id)}><span><b>{item.title}</b><small>{item.deadline ? `До ${formatDate(item.deadline)}` : "Без срока"}</small></span><Icon name="arrow-right" size={17}/></button>)}</div> : <p>{next ? "Других активных заданий нет." : "Новые задания появятся здесь после назначения."}</p>}
      </section>
      <section className="business-home-team" aria-labelledby="business-home-team-title"><header><h2 id="business-home-team-title">Команда</h2><Link to={businessPath(companyId, "team")}>Открыть <Icon name="arrow-right" size={16}/></Link></header>
        <p>{isManager ? `${employeeCountLabel(data.summary?.employees)}. Структура, общение и встречи доступны в разделе команды.` : `${data.membership?.department || "Ваша команда"}. Здесь можно найти коллег и обсудить рабочие вопросы.`}</p>
      </section>
    </div>
    {showTeamProgress && <section className="business-home-team-progress" aria-labelledby="business-home-progress-title"><header><h2 id="business-home-progress-title">Ход обучения команды</h2><Link to={businessPath(companyId, "analytics")}>Подробнее в аналитике <Icon name="arrow-right" size={16}/></Link></header>
      {teamProgress.status === "loading" && <p role="status">Загружаем результаты команды…</p>}
      {teamProgress.status === "error" && <div role="alert"><p>Не удалось загрузить результаты. {teamProgress.error}</p><button type="button" className="subtle-button" onClick={() => setProgressRetry(value => value + 1)}>Повторить</button></div>}
      {teamProgress.status === "ready" && <dl><div><dt>Назначено</dt><dd>{teamProgress.value.assigned}</dd></div><div><dt>Завершено</dt><dd>{teamProgress.value.completed}</dd></div><div><dt>Просрочено</dt><dd>{teamProgress.value.overdue}</dd></div></dl>}
    </section>}
  </section>;
}

function CompanyDashboard({ data }) {
  const companyId = data.company.id;
  const isManager = Boolean(data.permissions?.manage_team);
  const isDirector = data.membership?.role === "COMPANY_OWNER";
  const activeAssignments = (data.assignments || []).filter(item => item.can_start !== false && ["IN_PROGRESS", "ASSIGNED", "OPENED", "FAILED"].includes(item.status));
  const [state, setState] = useState({ loading: true, error: "", meetings: [], episodes: [], analytics: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ loading: true, error: "", meetings: [], episodes: [], analytics: null });
    Promise.all([
      api(`/api/company/${companyId}/meetings`),
      api(`/api/company/${companyId}/episodes`),
      isManager ? api(`/api/company/${companyId}/analytics`).catch(() => null) : Promise.resolve(null),
    ]).then(([meetings, episodes, analytics]) => {
      if (current) setState({ loading: false, error: "", meetings, episodes, analytics });
    }).catch(cause => {
      if (current) setState({ loading: false, error: cause.message, meetings: [], episodes: [], analytics: null });
    });
    return () => { current = false; };
  }, [companyId, retry]);

  const now = Date.now();
  const upcomingMeetings = state.meetings
    .filter(item => item.status !== "COMPLETED" && (!item.scheduled_at || new Date(item.scheduled_at).getTime() >= now))
    .sort((left, right) => new Date(left.scheduled_at || 0).getTime() - new Date(right.scheduled_at || 0).getTime())
    .slice(0, 4);
  const activeEpisodes = state.episodes.filter(item => !["COMPLETED", "CANCELLED"].includes(item.status));
  const analytics = state.analytics;
  const roleScope = isDirector ? "компании" : isManager ? "вашей команды" : "вашей работы";
  return <section className="business-home business-director-home business-home-forest">
    <div data-business-tour="overview"><ForestSectionHeader title="Главная" line="Одна команда. Общий результат." description={isManager ? `Краткая картина ${roleScope}: команда, рабочие ситуации и ближайшие встречи.` : "Ваши рабочие ситуации, назначенные практики и ближайшие встречи."} image="hero">
      <Link className="business-home-hero-action" data-business-tour="next-step" to={isManager ? `${businessPath(companyId, "episodes")}?create=1` : businessPath(companyId, "learning")}><Icon name={isManager ? "plus" : "book-open"} size={19}/>{isManager ? "Создать ситуацию" : "Мои практики"}<Icon name="arrow-right" size={17}/></Link>
    </ForestSectionHeader></div>
    {state.loading && <p className="business-home-status" role="status">Загружаем сводку компании…</p>}
    {state.error && <section className="business-home-retry" role="alert"><p>Не удалось загрузить сводку. {state.error}</p><button type="button" className="subtle-button" onClick={() => setRetry(value => value + 1)}>Повторить</button></section>}
    {!state.loading && !state.error && <>
      {isManager ? <dl className="business-director-stats">
        <div><dt>{isDirector ? "Сотрудники" : "Моя команда"}</dt><dd>{data.summary?.employees || 0}</dd><Link to={`${businessPath(companyId, "team")}#company-employees`}>Открыть команду <Icon name="arrow-right" size={15}/></Link></div>
        <div><dt>Активные ситуации</dt><dd>{activeEpisodes.length}</dd><Link to={businessPath(companyId, "episodes")}>Открыть ситуации <Icon name="arrow-right" size={15}/></Link></div>
        <div><dt>Назначено практик</dt><dd>{analytics?.assigned ?? "—"}</dd><Link to={`${businessPath(companyId, "learning")}?view=manage`}>Назначить практику <Icon name="arrow-right" size={15}/></Link></div>
        <div><dt>Завершено</dt><dd>{analytics?.completed ?? "—"}</dd><Link to={businessPath(companyId, "analytics")}>Смотреть аналитику <Icon name="arrow-right" size={15}/></Link></div>
      </dl> : <dl className="business-director-stats business-director-stats--employee">
        <div><dt>Мои практики</dt><dd>{activeAssignments.length}</dd><Link to={businessPath(companyId, "learning")}>Открыть практики <Icon name="arrow-right" size={15}/></Link></div>
        <div><dt>Мои ситуации</dt><dd>{activeEpisodes.length}</dd><Link to={businessPath(companyId, "episodes")}>Открыть ситуации <Icon name="arrow-right" size={15}/></Link></div>
        <div><dt>Ближайшие встречи</dt><dd>{upcomingMeetings.length}</dd><Link to={businessPath(companyId, "meetings")}>Открыть встречи <Icon name="arrow-right" size={15}/></Link></div>
      </dl>}
      <div className="business-director-grid">
        <section className="business-director-card" aria-labelledby="director-meetings-title"><header><div><Icon name="calendar-days" size={23}/><h2 id="director-meetings-title">Ближайшие встречи</h2></div><Link to={businessPath(companyId, "meetings")}>Все встречи <Icon name="arrow-right" size={16}/></Link></header>
          {upcomingMeetings.length ? <div className="business-director-meetings">{upcomingMeetings.map(item => <Link key={item.id} to={`${businessPath(companyId, "meetings")}?meeting=${item.id}`}><time>{item.scheduled_at ? formatDate(item.scheduled_at) : "Время уточняется"}</time><span><b>{item.title}</b><small>{item.participants?.length || 0} участников · {item.kind === "COUNCIL" ? "Совет решений" : "Встреча"}</small></span><Icon name="arrow-right" size={17}/></Link>)}</div> : <div className="business-director-empty"><Icon name="calendar-days" size={22}/><p>{isManager ? "Встреч пока нет. Создайте её в разделе «Встречи»." : "Вас пока не пригласили на встречу."}</p>{isManager && <Link className="subtle-button" to={`${businessPath(companyId, "meetings")}?create=1`}>Запланировать встречу</Link>}</div>}
        </section>
        <section className="business-director-card" aria-labelledby="director-situations-title"><header><div><Icon name="target" size={23}/><h2 id="director-situations-title">Что сейчас в работе</h2></div><Link to={businessPath(companyId, "episodes")}>Все ситуации <Icon name="arrow-right" size={16}/></Link></header>
          {activeEpisodes.length ? <div className="business-director-episodes">{activeEpisodes.slice(0, 4).map(item => <Link key={item.id} to={`${businessPath(companyId, "episodes")}?episode=${item.id}`}><span><b>{item.title}</b><small>{item.participant_count || 0} участников · {item.progress?.completion_percent ?? 0}% пройдено</small></span><span className="business-home-card-status">{item.status === "ACTIVE" ? "Активна" : "Подготовка"}</span></Link>)}</div> : <div className="business-director-empty"><Icon name="target" size={22}/><p>{isManager ? "Активных рабочих ситуаций нет." : "Вас пока не добавили в рабочую ситуацию."}</p>{isManager && <Link className="subtle-button" to={`${businessPath(companyId, "episodes")}?create=1`}>Создать ситуацию</Link>}</div>}
        </section>
      </div>
    </>}
  </section>;
}

export function BusinessHome(props) {
  return <CompanyDashboard {...props}/>;
}

export function LearningHub(props) {
  const canAssign = Boolean(props.data.permissions?.manage_learning || props.data.permissions?.manage_assignments);
  const isDirector = props.data.membership?.role === "COMPANY_OWNER";
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = canAssign && ["manage", "automation"].includes(requestedView)
    ? requestedView
    : isDirector && canAssign ? "manage" : "mine";
  const setView = next => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "mine") nextParams.delete("view"); else nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
  };
  const tabs = isDirector ? [] : [{id:"mine",label:"Мои практики",icon:"book-open"}];
  if (canAssign) tabs.push({id:"manage",label:"Назначить практику",icon:"check-check"},{id:"automation",label:"Автоматизация",icon:"calendar-days"});
  return <section className="business-product-hub">
    <ProductTabs value={view} onChange={setView} items={tabs} label="Разделы обучения"/>
    {view === "mine" && <EmployeeHome {...props}/>}
    {view === "manage" && canAssign && <Assignments {...props}/>}
    {view === "automation" && canAssign && <GrowthTools data={props.data}/>}
  </section>;
}

export function TeamHub(props) {
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
    {view === "team" && <TeamWorkspace {...props}/>}
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
    {id:"overview",label:"Мой профиль",icon:"circle-user-round"},
    {id:"assignments",label:"Мои задания",icon:"book-open"},
    {id:"analytics",label:"Мои результаты",icon:"brain"},
    {id:"certificates",label:"Мои сертификаты",icon:"graduation-cap"},
    {id:"path",label:"Профессия и рост",icon:"target"},
    {id:"tools",label:"AI и архив",icon:"bot"},
  ];
  if (canSeeAnalytics) tabs.push({id:"team",label:"Развитие команды",icon:"users"});
  return <section className="business-product-hub business-profile-forest">
    <ProductTabs value={view} onChange={setView} items={organizer ? tabs.filter(tab => !["assignments", "certificates", "path", "team"].includes(tab.id)) : tabs} label="Разделы профиля"/>
    {view === "analytics" && canSeeAnalytics ? <ResultsWorkspace {...props}/> : ["overview", "assignments", "analytics", "certificates"].includes(view) && <EmployeeCabinet key={view} data={props.data} start={props.start} initialTab={view} hideTabs />}
    {view === "path" && <div className="growth-path-stack"><ProfessionalProfile data={props.data}/><CareerPath data={props.data}/></div>}
    {view === "tools" && <AdvancedHub data={props.data}/>}
    {view === "team" && canSeeAnalytics && <ResultsWorkspace {...props}/>}
  </section>;
}
