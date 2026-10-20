import { Link } from "react-router-dom";
import CouncilLaunch from "./CouncilLaunch";
import CouncilProcessing from "./CouncilProcessing";
import CouncilModeration from "./CouncilModeration";
export default function CouncilWorkingRoom({data,base,reload,action,busy}) {
  return <div className="council-page council-flow"><Link to={base}>← Все встречи</Link><header className="council-detail-header"><span className="council-kicker">РАБОЧАЯ ВСТРЕЧА</span><h1>{data.title}</h1><div className="council-flow-meta"><span>{new Date(data.scheduled_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})} · МСК</span><span>{data.reservation_minutes} минут</span><span>Ведущий: {data.organizer?.name}</span></div></header><CouncilLaunch data={data} reload={reload}/><CouncilProcessing data={data} meetingId={data.id} reload={reload}/>
    {data.description && <section className="council-panel"><h2>Что обсуждаем</h2><p>{data.description}</p></section>}
    <section className="council-panel"><h2>Участники · {data.team.length}</h2><ul className="council-flow-roster">{data.team.map(person=><li key={person.user_id}><b>{person.name}</b><small>{person.user_id===data.organizer_id ? "Ведущий" : "Участник"} · {person.online ? "на странице встречи" : "пока не подключён"}</small></li>)}</ul></section>
    {data.can_moderate && !["finished","cancelled"].includes(data.status) && <details className="council-panel"><summary>Управление участниками</summary><CouncilModeration data={data} action={action} busy={busy}/></details>}
    {!['finished','cancelled'].includes(data.status) && <p>После завершения звонка откроются материалы встречи. Руководитель проверит черновик перед отправкой участникам.</p>}
  </div>;
}
