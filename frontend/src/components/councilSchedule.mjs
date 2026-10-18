export const moscowDay = stamp => new Date(stamp).toLocaleDateString('sv-SE', {timeZone:'Europe/Moscow'});
export const slotStamp = (day,time) => Date.parse(`${day}T${time}:00+03:00`);
export function reservationWindow(day,time,duration) {
  const start=slotStamp(day,time);
  return Number.isFinite(start)?{start,end:start+duration*60000}:null;
}
export function upcomingSlots(slots,day,now) {
  return slots.filter(slot=>slotStamp(day,slot.time)>=now+15*60000);
}
export function withinReservation(day,time,window) {
  const stamp=slotStamp(day,time);
  return Boolean(window&&stamp>=window.start&&stamp<window.end);
}
export function clockLabel(stamp) {
  return new Date(stamp).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
}
export function reservationLabel(window) {
  if(!window)return '';
  const endDay=moscowDay(window.end);
  const suffix=endDay!==moscowDay(window.start)?' · '+new Date(window.end).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long'}):'';
  return `${clockLabel(window.start)} — ${clockLabel(window.end)}${suffix}`;
}
