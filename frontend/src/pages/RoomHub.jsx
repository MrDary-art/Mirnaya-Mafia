import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { api } from "../api.js";
import "./room-role-options.css";
import BookingActions, { moscowDate } from "../components/BookingActions.jsx";

const emptyForm = {
  display_name: "", request_text: "", goal: "", team_name: "", scenario_id: "",
  scheduled_at: "", timezone: "Europe/Moscow", specialization: "", level: "начальный", role: "",
  duration_minutes: 15, ranked: false,
};

const statusText = { scheduled: "Забронировано", cancelled: "Отменена", expired: "Время истекло", waiting: "Ждёт участника", lobby: "Лобби", active: "Идёт сейчас", feedback: "Обратная связь", processing: "Готовим отчёт", finished: "Завершена" };

export default function RoomHub() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const invitationMode = Boolean(params.get("code"));
  const [mode, setMode] = useState("human");
  const [form, setForm] = useState(emptyForm);
  const [code, setCode] = useState(params.get("code") || "");
  const [joinName, setJoinName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [preview, setPreview] = useState(null);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [records, setRecords] = useState([]);
  const [advanced, setAdvanced] = useState(false);

  async function refresh() { const [list, slots] = await Promise.all([api("/api/rooms"), api("/api/rooms/availability")]); setRooms(list); setAvailability(slots); }
  useEffect(() => { Promise.all([
    refresh(), api("/api/rooms/scenarios").then(setScenarios),
    api("/api/rooms/leaderboard").then(setLeaderboard), api("/api/rooms/records/me").then(setRecords),
    api("/api/profile").then((profile) => { setJoinName(profile.personal?.display_name || profile.username || ""); setForm((current) => ({ ...current,
      display_name: current.display_name || profile.personal?.display_name || profile.username || "",
      specialization: current.specialization || profile.personal?.specialization || "",
    })); }),
  ]).catch((e) => setError(e.message)); }, []);
  const selectedScenario = useMemo(() => scenarios.find((item) => item.id === form.scenario_id), [scenarios, form.scenario_id]);

  async function create() {
    setBusy(true); setPending("create"); setError("");
    try {
      const body = { ...form, mode, scheduled_at: form.scheduled_at || null, scenario_id: form.scenario_id || null };
      const room = await api("/api/rooms", { method: "POST", body });
      setCreated(room); await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); setPending(""); }
  }
  useEffect(() => { const invitation = params.get("code"); if (invitation) inspect(invitation); }, [params.get("code")]);

  async function inspect(invitation) {
    setBusy(true); setPending("inspect"); setError(""); setPreview(null);
    try { const data = await api(`/api/rooms/preview/${encodeURIComponent((typeof invitation === "string" ? invitation : code).trim())}`); if (data.already_joined) { nav(`/room/${data.id}`); return; } setPreview(data); setRoleId(data.available_roles?.length === 1 ? data.available_roles[0].id : ""); }
    catch (e) { setError(e.message); } finally { setBusy(false); setPending(""); }
  }

  async function join() {
    setBusy(true); setPending("join"); setError("");
    try {
      const room = await api("/api/rooms/join", { method: "POST", body: { code: preview.code, display_name: joinName, role_id: roleId || null } });
      nav(`/room/${room.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); setPending(""); }
  }

  const input = "w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none focus:border-cyan-300/60";
  return <div className="arena-room-hub mx-auto max-w-7xl space-y-7" data-room-created={Boolean(created)} data-invitation-mode={invitationMode}>
    <header className="room-hub-hero"><div className="room-hub-heading"><div className="eyebrow">ОНЛАЙН 1 НА 1</div><h1 className="mt-2 text-4xl font-extrabold">Встреча, к которой можно подготовиться</h1><p className="mt-3 max-w-3xl text-slate-400">Создайте переговоры между людьми или два независимых собеседования с ИИ. Для разговора с человеком вы подключаетесь вместе. Для двух собеседований с ИИ оба подтверждают участие, затем каждый проходит свою попытку в течение общего часа.</p></div><button className="room-demo-entry" onClick={() => nav("/rooms/demo")}><span className="room-demo-entry-copy"><small>ДЕМО 1×1 · БЕЗ ФОРМЫ</small><b>Первый раз в 1×1?</b><span>Посмотрите, что увидит каждый участник — от приглашения до отчёта.</span></span><span className="room-demo-entry-action">Как это работает <i><ArrowUpRightIcon size={20} weight="bold" /></i></span></button></header>
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    <div className={`grid gap-6 ${invitationMode ? "max-w-3xl" : "xl:grid-cols-[1.35fr_.65fr]"}`} data-invitation={invitationMode}>
      {!invitationMode && <section className="glass rounded-3xl p-6 room-booking-form">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Новая встреча</h2><span className="text-xs text-slate-400">2 участника · 2–30 минут</span></div>
        <p className="mt-3 text-sm text-slate-400">{availability?.quota?.limit ? `Текущих записей: ${availability.quota.active} из ${availability.quota.limit}. Завершённые и отменённые не учитываются.` : "Для demo и администратора количество записей не ограничено."}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[{ id: "human", icon: "◉", title: "Переговоры людей", text: "Общий видеозвонок, разные роли и личные цели. Записывается только ваш микрофон." }, { id: "duel", icon: "✦", title: "Два интервью с ИИ", text: "Одинаковое задание, приватные диалоги и командный результат после двух попыток." }].map((item) => <button key={item.id} className={`rounded-2xl border p-5 text-left transition ${mode === item.id ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_30px_rgba(103,232,249,.08)]" : "border-white/10 hover:bg-white/5"}`} onClick={() => setMode(item.id)}><span className="text-2xl text-cyan-200">{item.icon}</span><b className="mt-3 block">{item.title}</b><span className="mt-1 block text-sm leading-relaxed text-slate-400">{item.text}</span></button>)}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-400">Как к вам обращаться<input className={`${input} mt-1`} maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label className="text-sm text-slate-400 md:col-span-2">{mode === "duel" ? "Вакансия и компания" : "Ситуация переговоров"}<textarea className={`${input} mt-1`} rows={3} placeholder={mode === "duel" ? "Например: middle backend разработчик в продуктовой IT-компании" : "Например: согласовать сроки запуска с заказчиком после изменения требований"} value={form.request_text} onChange={(e) => setForm({ ...form, request_text: e.target.value })} /></label>
          <label className="text-sm text-slate-400 md:col-span-2">Желаемый результат<textarea className={`${input} mt-1`} rows={2} placeholder="Какой результат будет означать успешную тренировку?" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label>
          <div className="md:col-span-2"><button type="button" className="text-sm font-semibold text-cyan-200" onClick={() => setAdvanced(!advanced)}>{advanced ? "Скрыть дополнительные настройки ↑" : "Роль, специализация и сценарий ↓"}</button></div>
          {advanced && <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-4 md:col-span-2 md:grid-cols-2">
            <label className="text-sm text-slate-400">Название команды <span className="text-slate-600">(для отображения)</span><input className={`${input} mt-1`} maxLength={80} value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })} /></label>
            <label className="text-sm text-slate-400">Ваша роль<input className={`${input} mt-1`} placeholder={mode === "duel" ? "Кандидат" : "Например: поставщик"} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
            <label className="text-sm text-slate-400">Специализация<input className={`${input} mt-1`} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></label>
            <label className="text-sm text-slate-400">Уровень<select className={`${input} mt-1`} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option>начальный</option><option>средний</option><option>продвинутый</option></select></label>
            <label className="text-sm text-slate-400 md:col-span-2">Сценарий<select className={`${input} mt-1`} value={form.scenario_id} onChange={(e) => setForm({ ...form, scenario_id: e.target.value, ranked: e.target.value ? form.ranked : false })}><option value="">Своя ситуация</option>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{selectedScenario && <span className="mt-2 block text-xs leading-relaxed text-slate-500">{selectedScenario.description}</span>}</label>
          </div>}
          <div className="md:col-span-2">{availability && <WeekBooking value={form.scheduled_at} duration={mode === "duel" ? 60 : form.duration_minutes} availability={availability} onChange={(scheduled_at) => setForm({ ...form, scheduled_at })} />}</div>
          <div className="text-sm text-slate-400 md:col-span-2"><span>{mode === "duel" ? "Лимит одной попытки (общее окно — 1 час)" : "Длительность"}</span><div className="mt-2 flex flex-wrap gap-2">{[5, 10, 15, 20, 30].map((minutes) => <button type="button" key={minutes} onClick={() => setForm({ ...form, duration_minutes: minutes })} className={`rounded-xl border px-4 py-2 ${form.duration_minutes === minutes ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-300"}`}>{minutes} мин</button>)}<label className="flex items-center gap-2 rounded-xl border border-white/10 px-3">Другое<input type="number" min="2" max="30" className="w-14 bg-transparent py-2 text-white outline-none" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Math.max(2, Math.min(30, Number(e.target.value))) })} /></label></div></div>
          {mode === "duel" && form.scenario_id && <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 p-4 text-sm text-slate-300"><input type="checkbox" className="mt-1 accent-cyan-300" checked={form.ranked} onChange={(e) => setForm({ ...form, ranked: e.target.checked })} /><span><b className="block text-white">Учитывать командный результат</b>Результат попадёт в рейтинг только после завершения обеих попыток и отдельного согласия обоих.</span></label>}
          <div className="md:col-span-2"><div className="flex flex-wrap gap-3"><button className="primary-button" aria-busy={pending === "create"} disabled={busy || availability?.quota?.remaining === 0 || !form.display_name.trim() || !form.request_text.trim() || !form.goal.trim() || !form.scheduled_at} onClick={create}>{pending === "create" ? "Создаём встречу…" : "Забронировать время →"}</button></div>{(!form.display_name.trim() || !form.request_text.trim() || !form.goal.trim() || !form.scheduled_at) && <p className="mt-2 text-xs text-slate-400">Для бронирования укажите имя, ситуацию, цель и время.</p>}</div>
        </div>
      </section>}
      <aside className="space-y-5 room-invitation-panel">
        <section className="glass rounded-3xl p-6"><h2 className="text-xl font-bold">Войти по приглашению</h2><p className="mt-2 text-sm text-slate-400">Сначала покажем условия. Вход произойдёт только после вашего подтверждения.</p><label className="mt-5 block text-sm">Код комнаты<input className={`${input} mt-1`} value={code} onChange={(e) => { setCode(e.target.value.trim()); setPreview(null); }} /></label><button className="subtle-button mt-3" aria-busy={pending === "inspect"} disabled={busy || !code.trim()} onClick={inspect}>{pending === "inspect" ? "Проверяем код…" : "Проверить приглашение"}</button>{preview && <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4"><div className="text-xs uppercase tracking-widest text-cyan-300">{preview.mode === "duel" ? "ДВА ИНТЕРВЬЮ С ИИ" : "ПЕРЕГОВОРЫ ЛЮДЕЙ"}</div><b className="mt-2 block">{preview.scenario.title}</b><p className="mt-2 text-sm text-slate-300">{preview.scenario.public_context}</p><p className="mt-2 text-sm text-cyan-200">{moscowDate(preview.scheduled_at)}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400"><div><dt>Создатель</dt><dd className="text-white">{preview.host_name}</dd></div><div><dt>Длительность</dt><dd className="text-white">{preview.duration_minutes} мин</dd></div></dl><fieldset className="room-role-options"><legend>Кем вы будете в этой встрече?</legend><p>{preview.mode === "duel" ? "Оба участника проходят одинаковое задание отдельно." : preview.role_source === "standard" ? "Доступна базовая роль: ИИ не предложил дополнительные варианты." : "Роли подобраны по ситуации создателя. Выберите одну."}</p>{(preview.available_roles || []).map((role) => <label key={role.id} className={roleId === role.id ? "selected" : ""}><input type="radio" name="guest-role" value={role.id} checked={roleId === role.id} onChange={() => setRoleId(role.id)}/><span><b>{role.title}</b><small>{role.description}</small></span></label>)}</fieldset><label className="mt-4 block text-sm">Как к вам обращаться<input className={`${input} mt-1`} value={joinName} onChange={(e) => setJoinName(e.target.value)} /></label><button className="primary-button mt-3" aria-busy={pending === "join"} disabled={busy || !joinName.trim() || (preview.available_roles?.length > 0 && !roleId)} onClick={join}>{pending === "join" ? "Входим в комнату…" : "Подтвердить и войти →"}</button></div>}</section>
        <section className="rounded-3xl border border-white/10 bg-white/[.025] p-5"><b>Что увидит второй участник</b><ul className="mt-3 space-y-2 text-sm text-slate-400"><li>• формат, тему и время встречи;</li><li>• публичное описание сценария;</li><li>• выбор подходящей роли до входа; личную цель — после.</li></ul></section>
        {mode === "duel" && <section className="glass rounded-3xl p-5"><b>Командный рейтинг</b><p className="mt-1 text-xs text-slate-500">Только одинаковые рейтинговые сценарии и согласие обоих.</p><div className="mt-3 space-y-2">{leaderboard.slice(0, 5).map((item) => <div key={`${item.position}-${item.challenge_key}`} className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm"><b className="text-cyan-200">#{item.position}</b><span className="min-w-0 flex-1 truncate">{item.team_name}</span><b>{item.score}</b></div>)}{!leaderboard.length && <p className="text-sm text-slate-400">Пока нет опубликованных результатов.</p>}</div>{records.length > 0 && <p className="mt-3 text-xs text-slate-400">Ваш лучший результат: <b className="text-white">{Math.max(...records.map((item) => item.score))}</b></p>}</section>}
      </aside>
    </div>
    {created && <RoomCreatedDialog room={created} onClose={() => setCreated(null)} onOpen={() => nav(`/room/${created.id}`)} onCancelled={() => { setCreated(null); refresh(); }} />}
    {!invitationMode && <section className="glass rounded-3xl p-6"><div className="eyebrow">ИСТОРИЯ КОМНАТ</div><div className="mt-4 grid gap-3 md:grid-cols-2">{rooms.map((room) => <button key={room.id} onClick={() => nav(`/room/${room.id}`)} className="rounded-2xl border border-white/10 p-4 text-left transition hover:bg-white/5"><div className="flex items-center justify-between gap-3"><b>{room.scenario?.title || room.problem}</b><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-cyan-200">{statusText[room.phase] || statusText[room.status] || room.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-400">{room.problem}</p><small className="mt-3 block text-slate-500">{room.mode === "duel" ? "ИИ интервью" : "Переговоры"} · {room.duration_minutes} мин · {moscowDate(room.scheduled_at)}</small></button>)}{!rooms.length && <p className="text-sm text-slate-400">Здесь появятся созданные и принятые комнаты.</p>}</div></section>}
  </div>;
}

function RoomCreatedDialog({ room, onClose, onOpen, onCancelled }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled), select:not(:disabled), a[href], input:not(:disabled)")];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, []);
  return createPortal(<div className="product-page booking-modal"><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="room-created-title" className="glass booking-modal-card w-full max-w-lg rounded-3xl p-7"><div className="eyebrow">ЗАПИСЬ ПОДТВЕРЖДЕНА</div><h2 id="room-created-title" className="mt-3 text-2xl font-bold">Время забронировано</h2><p className="mt-3 text-lg text-cyan-200">{moscowDate(room.scheduled_at)}</p><p className="mt-2 text-sm text-slate-400">Пригласите друга заранее. Вход откроется {moscowDate(room.entry_opens_at)} — за 15 минут до встречи. Запись сохранена в профиле.</p><p className="mt-4 text-sm text-slate-400">Код приглашения</p><div className="mt-2 select-all rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-mono text-xl tracking-widest">{room.code}</div><BookingActions room={room} onCancelled={onCancelled}/><div className="mt-5 flex flex-wrap gap-3"><button className="primary-button" onClick={onOpen}>{room.entry_available ? "Перейти к встрече" : "Посмотреть запись"} →</button><button className="subtle-button" onClick={onClose}>Закрыть</button></div></div></div>, document.body);

}

function WeekBooking({ value, duration, availability, onChange }) {
  const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  const now = new Date(availability.now);
  const moscowDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = new Date(`${moscowDate}T00:00:00Z`);
  const [week, setWeek] = useState(0);
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return date; });
  const selectedKey = value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : moscowDate;
  const [activeDay, setActiveDay] = useState(selectedKey);
  const booked = (availability.booked || []).map((item) => ({ start: new Date(item.start).getTime(), end: new Date(item.end).getTime() }));
  const slots = [];
  for (let minutes = 9 * 60; minutes <= 22 * 60; minutes += 30) slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  const chosen = value ? new Date(value).getTime() : null;
  function moveWeek(next) { const bounded = Math.max(0, Math.min(1, next)); setWeek(bounded); const first = new Date(today); first.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + bounded * 7); setActiveDay(first.toISOString().slice(0, 10)); }
  return <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-white">Дата и время по Москве</b><p className="text-xs text-slate-500">Заняты только пересекающиеся встречи из вашего расписания.</p></div><div className="flex gap-2"><button type="button" disabled={week === 0} className="subtle-button px-3 py-2" onClick={() => moveWeek(week - 1)}>←</button><button type="button" disabled={week === 1} className="subtle-button px-3 py-2" onClick={() => moveWeek(week + 1)}>→</button>{value && <button type="button" className="text-xs text-slate-400 underline" onClick={() => onChange("")}>Сбросить</button>}</div></div><div className="mt-4 flex gap-2 overflow-x-auto pb-2">{days.map((day, index) => { const key = day.toISOString().slice(0, 10); const past = day < today; const active = activeDay === key; return <button type="button" key={key} disabled={past} onClick={() => setActiveDay(key)} className={`min-w-[78px] flex-1 rounded-2xl border px-1 py-3 text-center transition ${past ? "cursor-not-allowed border-white/5 bg-white/[.02] text-slate-700" : active ? "border-cyan-300/60 bg-cyan-300/12 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/5"}`}><span className="block text-xs uppercase">{weekdays[index]}</span><b className="mt-1 block text-lg">{day.getUTCDate()}</b><small>{day.toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" })}</small></button>; })}</div><div className="mt-4 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">{slots.map((time) => { const iso = new Date(`${activeDay}T${time}:00+03:00`).toISOString(); const stamp = new Date(iso).getTime(); const past = stamp <= now.getTime(); const slotEnd = stamp + duration * 60000; const taken = booked.some((item) => stamp < item.end && slotEnd > item.start) && stamp !== chosen; const selected = stamp === chosen; return <button type="button" key={time} disabled={past || taken} title={taken ? "Пересекается с вашей встречей" : past ? "Время прошло" : "Забронировать"} onClick={() => onChange(iso)} className={`rounded-xl border px-2 py-2 text-sm ${past ? "cursor-not-allowed border-white/5 text-slate-700" : taken ? "cursor-not-allowed border-rose-300/10 bg-rose-400/5 text-slate-600 line-through" : selected ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/10 text-slate-300 hover:border-cyan-300/40"}`}>{time}</button>; })}</div>{value && <p className="mt-3 text-sm text-cyan-200">Выбрано: {new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} МСК</p>}</div>;
}
