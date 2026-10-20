import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./decision-council.css";
import CouncilModeration from "../components/CouncilModeration.jsx";
import CouncilPersonalReport from "../components/CouncilPersonalReport";
import CouncilResults from "../components/CouncilResults.jsx";
import CouncilProcessing from "../components/CouncilProcessing.jsx";
import CouncilHub from "../components/CouncilHub.jsx";
import CouncilLaunch from "../components/CouncilLaunch.jsx";
import CouncilWorkingRoom from "../components/CouncilWorkingRoom.jsx";
import CouncilSocialGame, { SocialRole, SocialConsequences } from "../components/CouncilSocialGame.jsx";

const roleNames = {
  project: "Руководитель проекта", client: "Представитель клиента",
  production: "Руководитель производства", finance: "Финансист",
};
const statusLabels = {
  open: "Идёт набор", locked: "Команда собрана", roles: "Роли открыты",
  preparation: "Комната подготовки", active: "Переговоры идут",
  finished: "Игра завершена", cancelled: "Встреча отменена",
};
const membershipLabels = {
  booked: "Вы записаны", confirmed: "Участие подтверждено", invited: "Вас пригласили",
  waitlist: "Вы в резерве", offered: "Место освободилось", facilitator: "Вы ведущий", reserve_invited: "Приглашение в резерв",
};
const defaultAgreement = {
  execution_plan: "overtime", decision: "", first_batch_percent: 0, first_batch_days: 0, balance_days: 0,
  extra_cost: 0, prepayment_percent: 0, owner: "", open_issues: "",
};
const agreementFields = [
  ["decision", "Что решили", "textarea"],
  ["first_batch_percent", "Первая партия, %", "number"],
  ["first_batch_days", "Первая поставка через, дней", "number"],
  ["balance_days", "Остаток заказа через, дней", "number"],
  ["extra_cost", "Расходы на ускорение, ₽", "number"],
  ["prepayment_percent", "Предоплата, %", "number"],
  ["owner", "Ответственный за исполнение", "text"],
  ["open_issues", "Что остаётся несогласованным", "textarea"],
];

function dateLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) + " московское время";
}

function downloadCalendar(meeting, meetingPath = `/council/${meeting.id}`) {
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + 50 * 60000);
  const stamp = date => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Arena//Decision Council//RU",
    "BEGIN:VEVENT", `UID:council-${meeting.id}@arena`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, "SUMMARY:Совет Решений",
    `DESCRIPTION:Командная игра. Откройте ${window.location.origin}${meetingPath}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  link.download = `sovet-resheniy-${meeting.id}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function StateNote({ children, tone = "info" }) {
  return <div className={`council-note council-note--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

function RoleDiagram({ roles }) {
  return <div className="council-role-diagram">

    {(roles || []).map((role, index) => <article className="council-role-node" key={role.key}>
      <span className="council-role-index">0{index + 1}</span><b>{role.name}</b><p>{role.preview}</p>
    </article>)}
  </div>;
}

function CouncilMeetingView({ meetingId, corporateCompanyId = null }) {
  const { user } = useAuth();
  const councilBase = corporateCompanyId ? `/business/${corporateCompanyId}/council` : "/council";
  const meetingPath = `${councilBase}/${meetingId}`;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("table");
  const [rolePreference, setRolePreference] = useState("");
  const [representedCompany, setRepresentedCompany] = useState(corporateCompanyId || "");
  const [inviteName, setInviteName] = useState("");
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [agreement, setAgreement] = useState(defaultAgreement);
  const [edited, setEdited] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const [reserveId, setReserveId] = useState("");
  const [manualRoles, setManualRoles] = useState({});
  const load = useCallback(async () => {
    try { setData(await api(`/api/council/${meetingId}${corporateCompanyId ? `?company_id=${corporateCompanyId}` : ""}`)); setError(""); }
    catch (reason) { setData(null); setError(reason.message); }
  }, [meetingId, corporateCompanyId]);
  useEffect(() => { load(); const timer = setInterval(load, 8000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { if (data) setNotes(data.my_notes || ""); }, [data?.my_notes]);
  useEffect(() => { if (data && !edited) { setAgreement({ ...defaultAgreement, ...data.agreement }); setEditVersion(data.agreement_version); } }, [data?.agreement_version, edited]);

  async function action(path, body, method = "POST") {
    setBusy(true); setError("");
    try { await api(`/api/council/${meetingId}${path}`, { method, ...(body !== undefined ? { body } : {}) }); await load(); return true; }
    catch (reason) { setError(reason.message); return false; }
    finally { setBusy(false); }
  }
  async function sendMessage(event, kind = "message") {
    event.preventDefault();
    if (!message.trim()) return;
    if (await action("/messages", { text: message.trim(), recipient_id: kind === "proposal" ? null : recipient ? Number(recipient) : null, kind })) setMessage("");
  }
  async function saveAgreement(event) {
    event.preventDefault();
    const body = Object.fromEntries(Object.entries(agreement).map(([key, value]) => [key, ["first_batch_percent", "first_batch_days", "balance_days", "extra_cost", "prepayment_percent"].includes(key) ? Number(value) : value]));
    if (await action("/agreement", { ...body, version: editVersion }, "PUT")) setEdited(false);
  }
  if (!data) return <div className="council-page"><StateNote tone={error ? "error" : "info"}>{error || "Загружаем встречу…"}</StateNote></div>;
  const mine = data.team.find(member => member.user_id === user?.id);
  const isOrganizer = data.can_manage;
  const canConfirm = data.my_status === "booked" && new Date(data.scheduled_at).getTime() - Date.now() <= 48 * 3600000;
  const isPlayer = data.my_status === "confirmed";
  const isLive = data.status === "active" && isPlayer;
  const isFacilitator = data.my_status === "facilitator";
  const isPreparationCall = Boolean(data.preparation_call);
  const ownContribution = data.report?.contributions?.[String(user?.id)];
  const canReplace = isOrganizer && data.status === "preparation" && Date.now() >= new Date(data.scheduled_at).getTime() + 5 * 60000;

  if (isPreparationCall) return <CouncilWorkingRoom data={data} base={councilBase} reload={load} action={action} busy={busy}/>;
  return <div className="council-page council-detail council-flow">
    <div className="council-detail-top"><Link to={councilBase}>← Все встречи</Link>{!corporateCompanyId && data.visibility === "public" && <Link to={`/council/info/${meetingId}`}>Условия без входа</Link>}<span>{data.format === "tournament" ? "МЕЖКОРПОРАТИВНЫЙ ТУРНИР" : data.visibility === "private" ? "ЗАКРЫТАЯ ВСТРЕЧА" : "ОТКРЫТАЯ ВСТРЕЧА"}</span></div>
    <header className="council-detail-header"><div><span className="council-kicker">{isPreparationCall ? "ТЕСТОВЫЙ СОЗВОН / СОВЕТ РЕШЕНИЙ" : "СОВЕТ РЕШЕНИЙ / СЦЕНАРИЙ 01"}</span><h1>{data.title}</h1><p>{data.scenario.description}</p></div><div className="council-event-stamp"><small>НАЧАЛО · московское время</small><strong>{dateLabel(data.scheduled_at)}</strong><span>{statusLabels[data.status]}</span><small>{data.organizer?.crown ? "♛ " : ""}{data.organizer?.name} · организатор</small></div></header>
    {error && <StateNote tone="error">{error}</StateNote>}
    <CouncilLaunch data={data} reload={load}/>
    <CouncilProcessing data={data} meetingId={meetingId} reload={load} />
    {data.game && <CouncilSocialGame game={data.game} players={data.team} userId={user?.id} busy={busy} control={data.can_manage && data.status === "active" ? stage => action("/game/stage", {stage}) : undefined} advance={isLive ? () => action("/game/advance", {stage:data.game.stage}) : undefined} />}
    {data.format === "tournament" && <div className="council-tournament-teams" aria-label="Команды турнира">{data.companies.map(company => <div key={company.company_id}><b>{company.name}</b><span>Занято {company.occupied} из {company.seats} мест</span></div>)}</div>}
    {data.status === "cancelled" && <StateNote tone="error">Встреча отменена. Запишитесь на другую опубликованную дату.</StateNote>}

    {data.can_moderate && !["finished", "cancelled"].includes(data.status) && <details className="council-panel"><summary>Управление участниками</summary><CouncilModeration data={data} action={action} busy={busy} /></details>}
    {isPlayer && data.status === "active" && !data.my_role_read && <StateNote>Организатор обновил ваше задание. Откройте «Моя роль» и ознакомьтесь с изменениями. <button onClick={() => { setTab("role"); }}>Показать роль</button></StateNote>}
    {data.my_controls?.muted && <StateNote>Организатор временно отключил ваш микрофон и сообщения.</StateNote>}
    <div className="council-detail-grid"><main>
      {data.status === "finished" && isPreparationCall && data.business_meeting_id && (!data.audio_analysis || data.audio_analysis.status === "complete") && <section className="council-panel"><h2>Отчёт по встрече</h2><p>Руководитель проверяет черновик и отправляет готовый отчёт участникам.</p><Link className="council-button" to={`/business/${corporateCompanyId || data.company_id}/meetings?meeting=${data.business_meeting_id}`}>Открыть отчёт</Link></section>}
      {data.my_status === "offered" && data.status !== "open" && <section className="council-panel"><h2>Команда предлагает вам место</h2><p>Примите предложение в течение 10 минут. После этого прочитайте роль и подтвердите готовность.</p><button className="council-button" disabled={busy} onClick={() => action("/join", { role: null })}>Принять место</button></section>}
      {isOrganizer && data.status === "preparation" && canReplace && <section className="council-panel"><h2>Замена отсутствующего участника</h2>
      {!isPreparationCall && canReplace && <div className="council-replacement"><label>Резервист<select value={reserveId} onChange={e => setReserveId(e.target.value)}><option value="">Выберите резервиста</option>{data.reserve.filter(person => person.status === "waitlist").map(person => <option value={person.user_id} key={person.user_id}>{person.name}{person.online ? " · в комнате" : ""}</option>)}</select></label>{data.team.filter(person => person.user_id !== user?.id && (!person.ready || !person.online)).map(person => <button disabled={busy || !reserveId} key={person.user_id} onClick={() => action("/replace", { absent_user_id: person.user_id, reserve_user_id: Number(reserveId) })}>Предложить место {person.name} резервисту</button>)}{!data.reserve.length && <p>В резерве никого нет. Можно подождать участника или отменить встречу.</p>}</div>}</section>}
      {isFacilitator && data.status === "active" && <section className="council-panel"><span className="council-kicker">ХОД ВСТРЕЧИ</span><h2>Чат модератора · общий стол</h2><p>Здесь ведущий задаёт порядок работы и пишет общие сообщения. Личные переговоры и роли участников ему не раскрываются.</p><div className="council-chat-log" aria-live="polite">{data.messages.filter(row => !row.recipient_id).map(row => <article className="council-chat-message" key={row.id}><b>{row.author}</b><p>{row.text}</p></article>)}{!data.messages.length && <p>Публичных сообщений пока нет.</p>}</div><form className="council-message-form" onSubmit={event => sendMessage(event)}><label>Сообщение для всех<textarea value={message} maxLength={1500} onChange={e => setMessage(e.target.value)} placeholder="Например: до обсуждения решений осталось пять минут." /></label><div><span>Участники увидят сообщение в общем столе.</span><button className="council-button" disabled={busy || data.my_controls?.muted || !message.trim()}>Отправить всем</button></div></form><details><summary>Текущее соглашение · версия {data.agreement_version}</summary><AgreementRead custom={data.custom_scenario} agreement={data.agreement} /></details></section>}
      {isFacilitator && <section className="council-panel"><h2>Панель ведущего</h2><p>Вы не голосуете за соглашение. Личные заметки и переписки участников остаются закрытыми.</p>
        {data.status === "locked" && <><p>До открытия карточек можно назначить роли вручную.</p>{data.team.map(person => <label key={person.user_id}>{person.name}<select value={manualRoles[person.user_id] || ""} onChange={e => setManualRoles({ ...manualRoles, [person.user_id]: e.target.value })}><option value="">Выберите роль</option>{Object.entries(roleNames).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>)}<button disabled={busy || new Set(Object.values(manualRoles)).size !== 4} onClick={() => action("/roles", { roles: manualRoles }, "PUT")}>Назначить роли</button></>}
        <details><summary>Все вводные сценария</summary>{Object.entries(data.facilitator_roles || {}).map(([key, role]) => <RoleCard key={key} role={role} />)}</details>
      </section>}

      <section className="council-panel"><div className="council-panel-heading"><div><span className="council-kicker">СОСТАВ</span><h2>За общим столом</h2></div><span>{data.confirmed} подтверждено · {data.seats_taken} / {data.capacity} места</span></div>
        <div className="council-team-grid">{Array.from({ length: data.capacity }, (_, index) => data.team[index] || null).map((member, index) =>
          <div className={`council-team-seat${member?.ready ? " is-ready" : ""}`} key={index}><span className="council-seat-number">0{index + 1}</span><b>{member?.name || "Место свободно"}</b><small>{(data.companies?.find(c => c.company_id === member?.company_id)?.name || "") + (data.companies?.some(c => c.company_id === member?.company_id) ? " · " : "")}{member?.role || (member ? membershipLabels[member.status] || "Участник" : "Ожидаем участника")}</small>{member && <small>{member.online ? "В комнате" : "Не в комнате"}</small>}{member?.ready && <em>Готов</em>}</div>)}</div>
        {data.my_status && <p className="council-membership">Ваш статус: <b>{membershipLabels[data.my_status] || statusLabels[data.status]}</b></p>}
      </section>

      {data.status === "open" && <section className="council-panel"><span className="council-kicker">ЗАПИСЬ И ПОДГОТОВКА</span><h2>До встречи</h2><p>{data.custom_scenario ? "Подтверждение участия доступно за 48 часов до встречи; при более поздней записи место подтверждается сразу. Когда все участники подтвердят места, откроются личные роли. Набор закрывается за 15 минут до начала: если команда собрана, открывается подготовительная комната." : "За 48 часов подтвердите участие. За сутки станет известно, собрана ли команда. Личная карточка роли откроется за два часа, комната подготовки — за 15 минут."}</p>
        {!data.my_status && (data.visibility === "public" || data.registration_open) && <div className="council-action-row">{data.eligible_companies?.length > 1 && <select aria-label="Представлять компанию" value={representedCompany} onChange={e => setRepresentedCompany(e.target.value)}><option value="">Выберите компанию</option>{data.companies.filter(c => data.eligible_companies.includes(c.company_id)).map(c => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}</select>}<select aria-label="Предпочтительная роль" value={rolePreference} onChange={e => setRolePreference(e.target.value)}><option value="">Любая роль</option>{Object.entries(roleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select><button className="council-button" disabled={busy} onClick={() => action("/join", { role: rolePreference || null, company_id: representedCompany ? Number(representedCompany) : null })}>{data.seats_taken < 4 ? "Записаться" : "Встать в резерв"}</button></div>}
        {(data.my_status === "invited" || data.my_status === "offered" || data.my_status === "reserve_invited") && <button className="council-button" disabled={busy} onClick={() => action("/join", { role: rolePreference || null, company_id: representedCompany ? Number(representedCompany) : null })}>{data.my_status === "reserve_invited" ? "Встать в добровольный резерв" : "Принять место"}</button>}
        {canConfirm && <button className="council-button" disabled={busy} onClick={() => action("/confirm")}>Подтвердить участие</button>}
        {data.my_status === "booked" && !canConfirm && <StateNote>Ваша запись сохранена. Подтверждение откроется за 48 часов до встречи.</StateNote>}
        {data.my_status && <div className="council-secondary-actions"><button onClick={() => downloadCalendar(data, meetingPath)}>Добавить в календарь</button>{!isOrganizer && !isPreparationCall && <button disabled={busy} onClick={() => action("/leave")}>Отменить участие</button>}</div>}
        {isOrganizer && !isPreparationCall && data.visibility === "private" && <form className="council-invite" onSubmit={async e => { e.preventDefault(); if (await action("/invite", { username: inviteName.trim() })) setInviteName(""); }}><label>Пригласить по имени пользователя<input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Логин участника" required /></label><button disabled={busy || !inviteName.trim()}>Пригласить</button></form>}
      </section>}

      {["locked", "roles", "preparation"].includes(data.status) && <section className="council-panel"><span className="council-kicker">ЛИЧНАЯ ПОДГОТОВКА</span><h2>{data.status === "locked" ? "Команда собрана" : "Ваша роль"}</h2>
        {data.status === "locked" ? <p>Все {data.capacity} участника подтвердили участие. Закрытые карточки откроются за два часа до встречи.</p> : data.my_role ? <RoleCard role={data.my_role} /> : <p>Личная роль доступна только участнику встречи.</p>}
        {data.my_role && !data.my_role_read && <button className="council-button" disabled={busy} onClick={() => action("/role-read")}>Я ознакомился</button>}
        {isPlayer && data.my_role && <NotesEditor notes={notes} setNotes={setNotes} save={() => action("/notes", { text: notes }, "PUT")} busy={busy} />}
        {data.status === "preparation" && isPlayer && <div className="council-ready"><p>{data.team.filter(member => member.ready).length} из {data.capacity} готовы. {data.team.find(member => !member.ready && member.status === "confirmed") ? `Ожидаем: ${data.team.find(member => !member.ready && member.status === "confirmed").name}.` : "Все готовы к началу."}</p>{!mine?.ready && <button className="council-button" disabled={busy || !data.my_role_read} onClick={() => action("/ready")}>Готов к началу</button>}</div>}
      </section>}

      {isLive && <section className="council-panel council-workspace"><div className="council-workspace-tabs" role="tablist" aria-label="Материалы встречи">{[["table", "Общий стол"], ["role", "Моя роль"], ["materials", "Общие материалы"], ["proposal", "Предложения"], ["agreement", "Соглашение"]].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={tab === key ? "is-active" : ""}>{label}</button>)}</div>
        {tab === "materials" && <div className="council-tab-body"><h3>{data.scenario.title}</h3><p>{data.scenario.description}</p>{!isPreparationCall && <ul>{data.scenario.timeline.map(item => <li key={item}>{item}</li>)}</ul>}<p>Договорённость из личного разговора нужно явно вынести на общий стол. Запишите итоговые условия и назначьте ответственного.</p></div>}
        {tab === "role" && <div className="council-tab-body">{data.my_role && <RoleCard role={data.my_role} />}{!data.my_role_read && <button className="council-button" disabled={busy} onClick={() => action("/role-read")}>Я ознакомился с новым заданием</button>}<NotesEditor notes={notes} setNotes={setNotes} save={() => action("/notes", { text: notes }, "PUT")} busy={busy} /></div>}
        {(tab === "table" || tab === "proposal") && <div className="council-tab-body"><div className="council-chat-log" aria-live="polite">{data.messages.filter(row => tab === "table" || row.kind === "proposal").map(row => <article key={row.id} className={`council-chat-message${row.recipient_id ? " is-private" : ""}${row.kind === "proposal" ? " is-proposal" : ""}`}><div><b>{row.author}</b><small>{row.recipient_id ? "Личные переговоры" : row.kind === "proposal" ? "Предложение команде" : "Общий стол"}</small></div><p>{row.text}</p></article>)}{!data.messages.length && <p className="council-chat-empty">Разговор ещё не начался. Поделитесь важным условием или задайте вопрос команде.</p>}</div>
          <form className="council-message-form" onSubmit={event => sendMessage(event, tab === "proposal" ? "proposal" : "message")}><label>{tab === "proposal" ? "Новое предложение" : "Ваше сообщение"}<textarea value={message} maxLength={1500} onChange={e => setMessage(e.target.value)} placeholder={tab === "proposal" ? "Предложите условия, которые стоит обсудить…" : "Какой факт нужно узнать у команды?"} /></label><div>{tab === "table" && <select aria-label="Кому отправить" value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Всем участникам</option>{data.team.filter(member => member.user_id !== user?.id && member.status === "confirmed").map(member => <option value={member.user_id} key={member.user_id}>Лично · {member.name}</option>)}</select>}<button className="council-button" disabled={busy || data.my_controls?.muted || !message.trim()}>Отправить</button></div></form>
        </div>}
        {tab === "agreement" && <div className="council-tab-body"><p>Любой участник может изменить документ. После правки прежние подтверждения сбрасываются. Проверка условий появится только после общего согласия.</p>{edited && editVersion !== data.agreement_version && <StateNote tone="error">Другой участник сохранил новую версию. Скопируйте нужные правки и загрузите текущий документ. <button onClick={() => setEdited(false)}>Загрузить текущую версию</button></StateNote>}<AgreementForm social={Boolean(data.game)} custom={data.custom_scenario} agreement={agreement} setAgreement={value => { setAgreement(value); setEdited(true); }} version={editVersion} onSubmit={saveAgreement} busy={busy} />
          {data.agreement_version > 0 && <div className="council-votes"><h3>Подтверждение версии {data.agreement_version}</h3><div>{data.team.filter(member => member.status === "confirmed").map(member => <span key={member.user_id}>{member.name}: {member.vote ? "согласен" : member.needs_changes ? "нужны изменения" : "ожидаем"}</span>)}</div><button disabled={busy || edited || editVersion !== data.agreement_version || (data.game && data.game.stage < 3)} onClick={() => action("/vote", { version: data.agreement_version, approve: true })}>Согласен с этой версией</button><button disabled={busy || edited || editVersion !== data.agreement_version || (data.game && data.game.stage < 3)} onClick={() => action("/vote", { version: data.agreement_version, approve: false })}>Нужны изменения</button></div>}
        </div>}
      </section>}

      {data.game_outcome && !data.report && <section className="council-panel"><h2>{data.game_outcome.summary}</h2><SocialConsequences report={data.game_outcome} /></section>}
      {data.status === "finished" && !data.business_meeting_id && data.report && (!data.audio_analysis || data.audio_analysis.status === "complete") && <section className="council-panel council-report"><span className="council-kicker">{isPreparationCall ? "ПОСЛЕ СОЗВОНА" : "ПОСЛЕ ИГРЫ"}</span><h2>Разбор решения</h2><p className="council-report-summary">{data.report?.summary}</p>{data.report.audio_coverage && <p role="note">{data.report.audio_coverage.notice}</p>}<div className="council-verdict">{isPreparationCall ? "Черновик · требуется проверка руководителя" : data.report?.ended_by_organizer ? "Завершено организатором" : data.report?.custom_roles ? "Нужна оценка организатора" : data.report?.feasible ? "План выполним" : "Есть противоречия в условиях"}</div>{!isPreparationCall && data.report?.issues?.length > 0 && <ul>{data.report.issues.map(item => <li key={item}>{item}</li>)}</ul>}
        <SocialConsequences report={data.report} /><h3>Итоговое соглашение</h3><AgreementRead custom={data.custom_scenario} agreement={data.agreement} />
        <p>{data.report?.evidence_note}</p>
        {!isPreparationCall && <><h3>Что появилось в общем обсуждении</h3><p>{data.report?.discussed?.join(" · ") || "Текстовых свидетельств пока нет."}</p></>}
        {!isPreparationCall && data.report?.unobserved?.length > 0 && <p>Не найдено в публичном тексте: {data.report.unobserved.join(" · ")}. Проверьте, были ли эти условия обсуждены устно и перенесены в документ.</p>}
        {data.report?.episodes?.length > 0 && <section className="council-key-episodes" aria-labelledby="key-episodes-title"><header><div><h3 id="key-episodes-title">Ключевые эпизоды</h3><p>Моменты разговора, которые повлияли на общий результат.</p></div><span>{data.report.episodes.length}</span></header><div>{data.report.episodes.map((episode, index) => <article className="council-report-episode" key={`${episode.message_id}-${index}`}><b>{episode.author}</b><h4>{episode.title}</h4><blockquote>«{episode.quote}»</blockquote><p>{episode.lesson}</p></article>)}</div></section>}
        {ownContribution?.personal_report && <CouncilPersonalReport report={ownContribution.personal_report}/>}
        {ownContribution && <details open><summary>Разобрать мои действия</summary><p>Публичных реплик: {ownContribution.public_messages}; предложений: {ownContribution.proposals}.</p>{ownContribution.evidence?.map(item => <article className="council-report-episode" key={item.title}><b>{item.title}</b><blockquote>«{item.quote}»</blockquote><p>{item.lesson}</p></article>)}<p>{ownContribution.recommendation}</p></details>}
        {isFacilitator && Object.values(data.report?.contributions || {}).map(item => <article key={item.name}><b>{item.name}</b><p>{item.recommendation}</p></article>)}
        {!isPreparationCall && <Link className="council-button" to={`${councilBase}?preferred_role=${Object.keys(roleNames).find(key => key !== data.my_role?.key) || "client"}`}>Записаться с другой ролью</Link>}
        {!isPreparationCall && <details><summary>Какая информация была у остальных?</summary><div className="council-revealed-roles">{Object.entries(data.report?.role_facts || {}).map(([key, role]) => <article key={key}><b>{role.name}</b><ul>{[...role.private_facts, ...role.limits].map(fact => <li key={fact}>{fact}</li>)}</ul></article>)}</div></details>}
      </section>}
      {data.status === "finished" && !isPreparationCall && !data.business_meeting_id && <CouncilResults data={data} action={action} busy={busy} />}
    </main><aside className="council-side"><div className="council-side-card"><span className="council-kicker">{isPreparationCall ? "КАК ПРОХОДИТ СОЗВОН" : "ПРАВИЛА СОВЕТА"}</span><h3>{isPreparationCall ? "Обсудите рабочую ситуацию" : "Не вся информация общая"}</h3><p>{isPreparationCall ? "Задайте вопросы, обсудите варианты и запишите решение. Закрытый черновик появится у руководителя после завершения." : "Личную карточку видите только вы. Её факты можно обсуждать, но команда узнает о них лишь от вас."}</p><div><span>01</span> Выясните ограничения</div><div><span>02</span> Сформулируйте предложение</div><div><span>03</span> Подтвердите одну версию</div></div>{isOrganizer && ["open", "locked", "roles", "preparation"].includes(data.status) && <button className="council-cancel" disabled={busy} onClick={() => { if (window.confirm("Отменить встречу для всей команды?")) action("/cancel"); }}>Отменить встречу</button>}</aside></div>
  </div>;
}

function RoleCard({ role }) {
  if (role.personal_interest) return <SocialRole role={role} />;
  if (!role.private_facts?.length && !role.limits?.length) return <article className="council-role-card"><span className="council-kicker">ВАША ЗАДАЧА</span><h3>{role.name}</h3><p>{role.goal}</p><div className="council-role-footer"><p><b>Предложите</b>{role.can_offer}</p><p><b>Уточните</b>{role.ask}</p></div></article>;
  return <article className="council-role-card"><span className="council-kicker">ТОЛЬКО ВАША КАРТОЧКА</span><h3>{role.name}</h3><p>{role.goal}</p><div className="council-role-columns"><div><b>Что знаете только вы</b><ul>{role.private_facts.map(text => <li key={text}>{text}</li>)}</ul></div><div><b>Границы роли</b><ul>{role.limits.map(text => <li key={text}>{text}</li>)}</ul></div></div><div className="council-role-footer"><p><b>Можете предложить</b>{role.can_offer}</p><p><b>Стоит выяснить</b>{role.ask}</p></div></article>;
}

function NotesEditor({ notes, setNotes, save, busy }) {
  return <div className="council-notes"><label>Мои заметки <small>Видны только вам</small><textarea value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="Вопросы к другим участникам, идеи и аргументы…" /></label><button disabled={busy} onClick={save}>Сохранить заметки</button></div>;
}

function AgreementForm({ social, custom, agreement, setAgreement, version, onSubmit, busy }) {
  return <form className="council-agreement-form" onSubmit={onSubmit}>{social && <label>Способ исполнения<select value={agreement.execution_plan || "overtime"} onChange={e => setAgreement({...agreement, execution_plan:e.target.value})}><option value="overtime">Своими силами · сверхурочные</option><option value="partner">Проверенный партнёр</option></select></label>}<div className="council-agreement-fields">{agreementFields.filter(([key]) => !custom || ["decision","owner","open_issues"].includes(key)).map(([key, label, type]) => <label key={key}>{label}{type === "textarea" ? <textarea value={agreement[key]} onChange={e => setAgreement({ ...agreement, [key]: e.target.value })} /> : <input type={type} min={type === "number" ? 0 : undefined} value={agreement[key]} onChange={e => setAgreement({ ...agreement, [key]: e.target.value })} />}</label>)}</div><button className="council-button" disabled={busy}>Сохранить новую версию {version + 1}</button></form>;
}

function AgreementRead({ custom, agreement }) {
  return <dl className="council-agreement-read">{agreement?.execution_plan && <div><dt>Способ исполнения</dt><dd>{agreement.execution_plan === "partner" ? "Проверенный партнёр" : "Своими силами · сверхурочные"}</dd></div>}{agreementFields.filter(([key]) => !custom || ["decision","owner","open_issues"].includes(key)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{agreement?.[key] ?? "—"}</dd></div>)}</dl>;
}

export default function DecisionCouncil() {
  const { meetingId, companyId } = useParams();
  const { user } = useAuth();
  const [corporateAccess, setCorporateAccess] = useState(null);
  useEffect(() => { if (!companyId && !user?.is_admin) api("/api/company/context").then(setCorporateAccess).catch(() => setCorporateAccess({has_company:false})); }, [companyId, user?.id]);
  const [scenario, setScenario] = useState(null);
  useEffect(() => { api("/api/council/scenario", { auth: false }).then(setScenario).catch(() => {}); }, []);
  if (!companyId && !user?.is_admin) {
    if (!corporateAccess) return <StateNote>Проверяем доступ компании…</StateNote>;
    const company = corporateAccess.company?.id || corporateAccess.companies?.find(item => item.status === "ACTIVE")?.company_id;
    return <Navigate to={company ? `/business/${company}/council${meetingId ? `/${meetingId}` : ""}` : "/app"} replace />;
  }
  return meetingId
    ? <CouncilMeetingView key={meetingId} meetingId={meetingId} corporateCompanyId={companyId || null} />
    : <CouncilHub corporateCompanyId={companyId || null} />;
}
