import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import CouncilComposer from "./CouncilComposer";
import "./council-flow.css";

const date = value => new Intl.DateTimeFormat("ru-RU", { timeZone:"Europe/Moscow", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" }).format(new Date(value));
export default function CouncilHub({ corporateCompanyId }) {
  const [params] = useSearchParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const companyId = Number(corporateCompanyId || params.get("company_id")) || null;
  const base = companyId ? `/business/${companyId}/council` : "/council";
  useEffect(() => {
    let active = true;
    Promise.all([api("/api/council/permissions"), api(companyId ? `/api/company/context?company_id=${companyId}` : "/api/company/context"), api(companyId ? `/api/council?company_id=${companyId}` : "/api/council")])
      .then(([permissions, context, meetings]) => { if(active) setState({permissions,context,meetings}); })
      .catch(cause => { if(active) setError(cause.message); });
    return () => {active=false;};
  }, [companyId]);
  if (!state) return <div className="council-page council-flow"><p role={error ? "alert" : "status"}>{error || "Загружаем встречи…"}</p></div>;
  const id = companyId || state.permissions.companies[0]?.id || state.context.company?.id;
  const owner = state.permissions.companies.some(company => company.id === Number(id));
  const canCreate = owner || state.context.company?.id === Number(id) && state.context.permissions?.manage_team;
  if (params.get("create") === "1") return <div className="council-page council-flow">{canCreate ? <CouncilComposer key={`${id}:${params.get("episode") || ""}`} permissions={state.permissions} initialCompany={id} basePath={base} allowGames={owner} episodeId={params.get("episode") ? Number(params.get("episode")) : null} initialWhen={params.get("scheduled_at") || ""}/> : <p role="alert">Создавать встречи может руководитель компании. Откройте назначенную вам встречу из списка.</p>}</div>;
  const current = state.meetings.filter(meeting => !["finished","cancelled"].includes(meeting.status));
  const past = state.meetings.filter(meeting => ["finished","cancelled"].includes(meeting.status));
  const cards = meetings => <div className="council-hub-list">{meetings.map(meeting => <Link className="council-hub-card" to={`${base}/${meeting.id}`} key={meeting.id}><div><small>{date(meeting.scheduled_at)} · МСК · {meeting.reservation_minutes} мин</small><h3>{meeting.title}</h3><p>{meeting.status === "cancelled" ? "Отменена" : meeting.status === "finished" ? "Встреча завершена" : meeting.status === "active" ? "Встреча идёт" : `${meeting.seats_taken} из ${meeting.capacity} участников`}</p></div><span>{meeting.status === "finished" ? "Открыть итоги →" : meeting.status === "cancelled" ? "Подробнее →" : "Открыть встречу →"}</span></Link>)}</div>;
  return <div className="council-page council-flow"><header className="council-hub-top"><div><p>Создайте встречу, пригласите сотрудников и обсудите задачу. После звонка проверьте отчёт и отправьте его команде.</p></div>{canCreate && <Link className="council-button" to={`${base}?create=1`}>Создать встречу</Link>}</header>
    <section><h2>Ваши встречи</h2>{current.length ? cards(current) : <div className="council-flow-empty"><h3>Пока нет предстоящих встреч</h3><p>{canCreate ? "Нажмите «Создать встречу» — комната может открыться сразу." : "Здесь появятся встречи, на которые вас пригласил руководитель."}</p></div>}</section>
    {past.length > 0 && <section style={{marginTop:32}}><h2>История и отчёты</h2>{cards(past)}</section>}
  </div>;
}
