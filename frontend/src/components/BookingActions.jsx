import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./bookings.css";

export function moscowDate(value) {
  return new Date(value).toLocaleString("ru-RU", {timeZone:"Europe/Moscow", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit"}) + " МСК";
}

export default function BookingActions({room, onCancelled, allowShare=true}) {
  const [friends,setFriends] = useState(null);
  const [friend,setFriend] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const [confirm,setConfirm] = useState(false);
  useEffect(()=>{setConfirm(false);setNotice("");},[room.id]);
  const url = new URL(room.invite_path || `/rooms?code=${room.code}`, window.location.origin).href;
  async function copy(value) {
    try { await navigator.clipboard.writeText(value);setNotice("Скопировано"); }
    catch { setNotice(`Скопируйте вручную: ${value}`); }
  }
  async function showFriends() {
    setNotice("");
    try { setFriends((await api("/api/social/friends")).filter(p=>p.relationship === "FRIENDS")); }
    catch(e) { setNotice(e.message); }
  }
  async function invite() {
    setBusy(true);
    try { await api(`/api/rooms/${room.id}/invite`, {method:"POST",body:{friend_id:Number(friend)}});setNotice("Приглашение отправлено в чат и уведомления друга."); }
    catch(e){setNotice(e.message);}finally{setBusy(false);}
  }
  async function cancel() {
    setBusy(true);
    try { await api(`/api/rooms/${room.id}/cancel`, {method:"POST"});setConfirm(false);await onCancelled?.(); }
    catch(e){setNotice(e.message);}finally{setBusy(false);}
  }
  return <div className="booking-actions">
    {allowShare && room.can_cancel && !room.guest_id && room.your_id === room.host_id && <>
      <div className="booking-buttons"><button type="button" className="subtle-button" onClick={()=>copy(url)}>Скопировать приглашение</button><button type="button" className="subtle-button" onClick={()=>copy(room.code)}>Копировать код</button><button type="button" className="subtle-button" onClick={showFriends}>Отправить другу</button></div>
      <small>Друг сможет открыть ссылку, зарегистрироваться и принять приглашение. Вход в лобби — за 15 минут до встречи.</small>
      {friends && <div className="booking-friend-picker">{friends.length ? <><label>Кому отправить<select value={friend} onChange={e=>setFriend(e.target.value)}><option value="">Выберите друга</option>{friends.map(p=><option key={p.id} value={p.id}>{p.display_name || p.username}</option>)}</select></label><button className="primary-button" disabled={!friend || busy} onClick={invite}>Отправить приглашение</button></> : <p>В списке пока нет друзей. Можно скопировать ссылку и отправить её самостоятельно.</p>}</div>}
    </>}
    {room.can_cancel && <div className="booking-cancel">{confirm ? <><span>Отменить встречу для обоих участников?</span><button disabled={busy} onClick={cancel}>Да, отменить</button><button onClick={()=>setConfirm(false)}>Сохранить запись</button></> : <button onClick={()=>setConfirm(true)}>Отменить запись</button>}</div>}
    {notice && <p role="status" className="booking-notice">{notice}</p>}
  </div>;
}
