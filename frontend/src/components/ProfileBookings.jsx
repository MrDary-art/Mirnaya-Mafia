import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import BookingActions, { moscowDate } from "./BookingActions.jsx";

export default function ProfileBookings() {
  const [rooms,setRooms]=useState([]),[quota,setQuota]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const load=async()=>{try {const [r,a]=await Promise.all([api("/api/rooms"),api("/api/rooms/availability")]);setRooms(r);setQuota(a.quota);setError("");}catch(e){setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer);},[]);
  const upcoming=rooms.filter(r=>!["finished","cancelled","expired"].includes(r.status)).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at));
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
  </section>;
}
