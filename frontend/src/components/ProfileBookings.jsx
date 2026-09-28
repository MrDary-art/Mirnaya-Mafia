import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import BookingActions, { moscowDate } from "./BookingActions.jsx";

export default function ProfileBookings() {
  const [rooms,setRooms]=useState([]),[history,setHistory]=useState([]),[quota,setQuota]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const load=async()=>{try {const [r,h,a]=await Promise.all([api("/api/rooms"),api("/api/history"),api("/api/rooms/availability")]);setRooms(r);setHistory(h);setQuota(a.quota);setError("");}catch(e){setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer);},[]);
  const upcoming=rooms.filter(r=>!["finished","cancelled","expired"].includes(r.status)).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at));
  const roomReports=rooms.filter(r=>r.report_available);
  const otherReports=history.filter(h=>h.finished && !h.room_id);
  function reportPath(h){return h.kind === "course" ? `/learn/${h.program_id}` : h.kind === "training" ? `/training/path/attempt/${h.attempt_id}/report` : `/report/${h.session_id}`;}
  return <section className="profile-bookings glass rounded-3xl p-6">
    <header><div><div className="eyebrow">МОИ ВСТРЕЧИ</div><h2>Записи и отчёты</h2><p>{quota?.limit == null ? "Записи без ограничения" : `Активные записи: ${quota.active} из ${quota.limit}`}</p></div><Link className="primary-button" to="/rooms">Запланировать встречу</Link></header>
    {error && <div role="alert" className="product-error">{error}<button onClick={load}>Повторить</button></div>}
    {loading && <p role="status">Загружаем записи…</p>}
    <div className="booking-list">{upcoming.map(room=><article key={room.id}>
      <small>{room.mode === "duel" ? "Два интервью с ИИ" : "Переговоры людей"}</small><h3>{room.request_text}</h3><time>{moscowDate(room.scheduled_at)}</time>
      {room.awaiting_schedule ? <p>Вы зарезервировали это время. Ожидайте: {moscowDate(room.entry_opens_at)}, за 15 минут до встречи, здесь появятся ссылки для приглашения и входа.</p> : <><p>{room.phase === "processing" ? "ИИ готовит ваш отчёт." : room.phase === "active" ? "Встреча идёт." : "Лобби открыто. Разговор начнётся в назначенное время после подтверждения обоих."}</p><Link className="primary-button" to={`/room/${room.id}`}>{room.phase === "processing" ? "Зал ожидания" : "Войти во встречу"}</Link></>}
      <BookingActions room={room} allowShare={!room.awaiting_schedule} onCancelled={load}/>
    </article>)}</div>
    {!loading && !upcoming.length && <p className="product-empty">Предстоящих встреч нет.</p>}
    <details className="booking-reports" open><summary>Все мои отчёты · {roomReports.length+otherReports.length}<ReportsChevron /></summary><div className="booking-report-list">{roomReports.map(r=><Link key={`room-${r.id}`} to={`/room/${r.id}`}><b>{r.request_text}</b><span>Встреча 1×1 · {moscowDate(r.scheduled_at)}</span><em>Личный разбор ↗</em></Link>)}{otherReports.map(h=><Link key={h.id} to={reportPath(h)}><b>{h.title}</b><span>{h.subtitle}</span><em>{h.verdict || "Открыть результат"} ↗</em></Link>)}</div>{!roomReports.length && !otherReports.length && <p>После завершения занятий здесь появятся ваши результаты.</p>}</details>
    {rooms.some(r=>["cancelled","expired"].includes(r.status)) && <details className="booking-reports"><summary>Отменённые и пропущенные встречи<ReportsChevron /></summary>{rooms.filter(r=>["cancelled","expired"].includes(r.status)).map(r=><p key={r.id}>{moscowDate(r.scheduled_at)} · {r.request_text} · {r.status === "cancelled" ? "Отменена" : "Время прошло"}</p>)}</details>}
  </section>;
}

function ReportsChevron() {
  return <span className="booking-reports-chevron" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></span>;
}
