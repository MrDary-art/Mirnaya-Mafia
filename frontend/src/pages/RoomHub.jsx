import ModeGuideEntry from "../components/ModeGuideEntry.jsx";
import PageHeader from "../design/PageHeader.jsx";
import Icon from "../components/Icon.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import "./room-role-options.css";
import BookingActions, { moscowDate } from "../components/BookingActions.jsx";

const emptyForm = {
  display_name: "", request_text: "", goal: "", team_name: "", scenario_id: "",
  scheduled_at: "", timezone: "Europe/Moscow", specialization: "", level: "начальный", role: "",
  duration_minutes: 15, ranked: false,
};

const statusText = { scheduled: "Забронировано", cancelled: "Отменена", expired: "Время истекло", waiting: "Ждёт участника", lobby: "Лобби", active: "Идёт сейчас", feedback: "Обратная связь", processing: "Готовим отчёт", finished: "Завершена" };
const durationPresets = [5, 10, 15, 20, 30];
const historyPageSize = 5;

export default function RoomHub() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const invitationMode = Boolean(params.get("code"));
  const [friends, setFriends] = useState(null);
  const [friendId, setFriendId] = useState(params.get("friend") || "");
  const [createdInvite, setCreatedInvite] = useState(null);
  const [timing, setTiming] = useState(params.get("friend") ? "now" : "scheduled");
  const [createdImmediate, setCreatedImmediate] = useState(false);
  const [mode, setMode] = useState("human");
  const [form, setForm] = useState(emptyForm);
  const [customDuration, setCustomDuration] = useState("");
  const [customDurationActive, setCustomDurationActive] = useState(false);
  const [code, setCode] = useState(params.get("code") || "");
  const [codeError, setCodeError] = useState("");
  const inspectionId = useRef(0);
  const [joinName, setJoinName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [preview, setPreview] = useState(null);
  const [created, setCreated] = useState(null);
  const [review,setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [scenarios, setScenarios] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [records, setRecords] = useState([]);
  const [advanced, setAdvanced] = useState(false);
  const selectedFriend = friends?.find((person) => String(person.id) === friendId);
  const missingFriend = Boolean(friends && friendId && !selectedFriend);
  const customDurationValid = /^[0-9]+$/.test(customDuration) && Number(customDuration) >= 2 && Number(customDuration) <= 30;
  const historyPageCount = Math.ceil(rooms.length / historyPageSize);
  const currentHistoryPage = Math.min(historyPage, Math.max(1, historyPageCount));
  const visibleRooms = rooms.slice((currentHistoryPage - 1) * historyPageSize, currentHistoryPage * historyPageSize);

  function chooseFriend(id) {
    setFriendId(id);
    setParams(id ? { friend: id } : {}, { replace: true });
  }

  function chooseDuration(minutes) {
    setCustomDuration("");
    setCustomDurationActive(false);
    setForm((current) => ({ ...current, duration_minutes: minutes }));
  }

  function enterCustomDuration(value) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setCustomDurationActive(true);
    setCustomDuration(digits);
    const minutes = Number(digits);
    if (digits && minutes >= 2 && minutes <= 30) setForm((current) => ({ ...current, duration_minutes: minutes }));
  }

  async function refresh() { const [list, slots] = await Promise.all([api("/api/rooms"), api("/api/rooms/availability")]); setRooms(list); setHistoryPage(1); setAvailability(slots); }
  useEffect(() => { Promise.all([
    refresh(), api("/api/rooms/scenarios").then(setScenarios),
    api("/api/rooms/leaderboard").then(setLeaderboard), api("/api/rooms/records/me").then(setRecords),
    api("/api/profile").then((profile) => { setJoinName(profile.personal?.display_name || profile.username || ""); setForm((current) => ({ ...current,
      display_name: current.display_name || profile.personal?.display_name || profile.username || "",
      specialization: current.specialization || profile.personal?.specialization || "",
    })); }),
  ]).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (!invitationMode) api("/api/social/friends").then((rows) => setFriends(rows.filter((person) => person.relationship === "FRIENDS"))).catch((failure) => setError(failure.message)); }, [invitationMode]);
  useEffect(() => { setFriendId(params.get("friend") || ""); }, [params.get("friend")]);
  useEffect(() => {const previous=params.get("repeat");if(!previous)return;api(`/api/rooms/${previous}`).then(room=>{setMode(room.mode);setTiming("now");setForm(current=>({...current,request_text:room.request_text,goal:room.your_goal||room.goal,role:room.your_role||"",level:room.level||"начальный",specialization:room.specialization||"",scenario_id:room.scenario?.source==="custom"?"":room.scenario?.id||"",duration_minutes:room.duration_minutes}));if (durationPresets.includes(room.duration_minutes)) { setCustomDuration(""); setCustomDurationActive(false); } else { setCustomDuration(String(room.duration_minutes)); setCustomDurationActive(true); }}).catch(e=>setError(e.message));},[params.get("repeat")]);
  const selectedScenario = useMemo(() => scenarios.find((item) => item.id === form.scenario_id), [scenarios, form.scenario_id]);

  async function create() {
    setReview(false);
    setBusy(true); setPending("create"); setError("");
    try {
      const body = { ...form, mode, scheduled_at: timing === "now" ? null : form.scheduled_at || null, scenario_id: form.scenario_id || null };
      const room = await api("/api/rooms", { method: "POST", body });
      setCreated(room);
      setCreatedImmediate(timing === "now");
      if (selectedFriend) {
        setCreatedInvite({ friend: selectedFriend, status: "sending" });
        try {
          await api(`/api/rooms/${room.id}/invite`, { method: "POST", body: { friend_id: selectedFriend.id } });
          setCreatedInvite({ friend: selectedFriend, status: "sent" });
        } catch (failure) {
          setCreatedInvite({ friend: selectedFriend, status: "failed", error: failure.message });
        }
      } else setCreatedInvite(null);
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); setPending(""); }
  }
  async function retryFriendInvite() {
    if (!created || !createdInvite || createdInvite.status === "sending") return;
    const friend = createdInvite.friend;
    setCreatedInvite({ friend, status: "sending" });
    try {
      await api(`/api/rooms/${created.id}/invite`, { method: "POST", body: { friend_id: friend.id } });
      setCreatedInvite({ friend, status: "sent" });
    } catch (failure) { setCreatedInvite({ friend, status: "failed", error: failure.message }); }
  }
  useEffect(() => { const invitation = params.get("code"); if (invitation) { setCode(invitation); inspect(invitation); } }, [params.get("code")]);

  async function inspect(invitation) {
    const currentInspection = ++inspectionId.current;
    setBusy(true); setPending("inspect"); setError(""); setCodeError(""); setPreview(null);
    try {
      const data = await api(`/api/rooms/preview/${encodeURIComponent((typeof invitation === "string" ? invitation : code).trim())}`);
      if (currentInspection !== inspectionId.current) return;
      if (data.already_joined) { nav(`/room/${data.id}`); return; }
      setPreview(data); setRoleId(data.available_roles?.length === 1 ? data.available_roles[0].id : "");
    } catch (e) {
      if (currentInspection === inspectionId.current) setCodeError(e.message);
    } finally {
      if (currentInspection === inspectionId.current) { setBusy(false); setPending(""); }
    }
  }

  async function join() {
    setBusy(true); setPending("join"); setError("");
    try {
      const room = await api("/api/rooms/join", { method: "POST", body: { code: preview.code, display_name: joinName, role_id: roleId || null } });
      nav(`/room/${room.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); setPending(""); }
  }

  const input = "w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none focus:border-lime-300/60";
  return <div className="arena-room-hub mx-auto max-w-7xl space-y-7" data-room-created={Boolean(created)} data-invitation-mode={invitationMode}>
    <PageHeader eyebrow="Онлайн 1 на 1" title="Встреча, к которой можно подготовиться" description="Переговоры с человеком или два независимых собеседования с ИИ. Выберите формат, согласуйте условия и пригласите участника." /><ModeGuideEntry to="/rooms/demo" eyebrow="ЗНАКОМСТВО С ФОРМАТОМ" title="Первый раз в 1 на 1?" description="Посмотрите путь каждого участника — от приглашения до отчёта." />
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    <div className={`grid gap-6 ${invitationMode ? "max-w-3xl" : "xl:grid-cols-[1.35fr_.65fr]"}`} data-invitation={invitationMode}>
      {!invitationMode && <section className="glass rounded-3xl p-6 room-booking-form">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Новая встреча</h2><span className="text-xs text-slate-400">2 участника · 2–30 минут</span></div>
        <p className="mt-3 text-sm text-slate-400">{availability?.quota?.limit ? `Текущих записей: ${availability.quota.active} из ${availability.quota.limit}. Завершённые и отменённые не учитываются.` : "Для demo и администратора количество записей не ограничено."}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[{ id: "human", icon: "users", title: "Переговоры людей", text: "Общий видеозвонок, разные роли и личные цели. Записывается только ваш микрофон." }, { id: "duel", icon: "bot", title: "Два интервью с ИИ", text: "Одинаковое задание, два отдельных интервью без ментора. После — сравнение и личный разбор." }].map((item) => <button key={item.id} className={`rounded-2xl border p-5 text-left transition ${mode === item.id ? "border-lime-300/70 bg-lime-300/10 shadow-[0_0_30px_var(--accent-lime-soft)]" : "border-white/10 hover:bg-white/5"}`} onClick={() => setMode(item.id)}><Icon name={item.icon} size={27} className="text-lime-200" /><b className="mt-3 block">{item.title}</b><span className="mt-1 block text-sm leading-relaxed text-slate-400">{item.text}</span></button>)}
        </div>
        <div className="mt-5 rounded-2xl border border-lime-300/25 bg-lime-300/[.055] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-white">С кем встретиться?</b>{friends?.length !== 0 && <p className="mt-1 text-xs text-slate-400">Выбранный друг получит приглашение в чат сразу после создания комнаты.</p>}</div>{selectedFriend && <UserAvatar avatarCode={selectedFriend.avatar_code} frameCode={selectedFriend.frame_code} userId={selectedFriend.id} size="sm" name={`Аватар ${selectedFriend.display_name || selectedFriend.username}`} />}</div>
          {friends?.length !== 0 && <label className="mt-3 block text-sm text-slate-300">Друг<select className={`${input} mt-1`} value={friendId} onChange={(event) => chooseFriend(event.target.value)} disabled={!friends}><option value="">Приглашу позже</option>{friends?.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.username} (@{person.username})</option>)}</select></label>}
          {missingFriend && friends.length > 0 && <p className="mt-2 text-xs text-rose-200" role="alert">Друг больше не доступен для приглашения. Выберите другого или вариант «Приглашу позже».</p>}
          {friends?.length === 0 && <div className="room-friends-empty">
            <span className="room-friends-empty-icon"><Icon name="users" size={21} /></span>
            <div className="room-friends-empty-copy"><strong>Подтверждённых друзей пока нет</strong><p>Создайте встречу и поделитесь кодом или найдите друга сейчас.</p></div>
            <div className="room-friends-empty-actions"><button type="button" className="primary-button room-friends-find" onClick={() => nav("/people")}>Найти друзей <Icon name="arrow-up-right" size={18} /></button>{missingFriend && <button type="button" className="subtle-button" onClick={() => chooseFriend("")}>Приглашу позже</button>}</div>
          </div>}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-400">Как к вам обращаться<input className={`${input} mt-1`} maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label className="text-sm text-slate-400 md:col-span-2">{mode === "duel" ? "Вакансия и компания" : "Ситуация переговоров"}<textarea className={`${input} mt-1`} rows={3} placeholder={mode === "duel" ? "Например: middle backend разработчик в продуктовой IT-компании" : "Например: согласовать сроки запуска с заказчиком после изменения требований"} value={form.request_text} onChange={(e) => setForm({ ...form, request_text: e.target.value })} /></label>
          <label className="text-sm text-slate-400 md:col-span-2">Желаемый результат<textarea className={`${input} mt-1`} rows={2} placeholder="Какой результат будет означать успешную тренировку?" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label>
          <div className="md:col-span-2"><button type="button" className="text-sm font-semibold text-lime-200" onClick={() => setAdvanced(!advanced)}>{advanced ? "Скрыть дополнительные настройки ↑" : "Роль, специализация и сценарий ↓"}</button></div>
          {advanced && <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-4 md:col-span-2 md:grid-cols-2">
            <label className="text-sm text-slate-400">Название команды <span className="text-slate-600">(для отображения)</span><input className={`${input} mt-1`} maxLength={80} value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })} /></label>
            <label className="text-sm text-slate-400">Ваша роль<input className={`${input} mt-1`} placeholder={mode === "duel" ? "Кандидат" : "Например: поставщик"} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
            <label className="text-sm text-slate-400">Специализация<input className={`${input} mt-1`} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></label>
            <label className="text-sm text-slate-400">Уровень<select className={`${input} mt-1`} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option>начальный</option><option>средний</option><option>продвинутый</option></select></label>
            <label className="text-sm text-slate-400 md:col-span-2">Сценарий<select className={`${input} mt-1`} value={form.scenario_id} onChange={(e) => setForm({ ...form, scenario_id: e.target.value, ranked: e.target.value ? form.ranked : false })}><option value="">Своя ситуация</option>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{selectedScenario && <span className="mt-2 block text-xs leading-relaxed text-slate-500">{selectedScenario.description}</span>}</label>
          </div>}
          <div className="md:col-span-2"><div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/45 p-2" role="group" aria-label="Когда начать встречу"><button type="button" aria-pressed={timing === "now"} onClick={() => setTiming("now")} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold ${timing === "now" ? "bg-lime-300 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}>Сейчас</button><button type="button" aria-pressed={timing === "scheduled"} onClick={() => setTiming("scheduled")} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold ${timing === "scheduled" ? "bg-lime-300 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}>Запланировать</button></div><p className="mt-2 text-xs text-slate-400">{timing === "now" ? "После приглашения друг сможет войти сразу. Комната будет ждать второго участника." : "Выберите время по Москве. Вход откроется за 15 минут до встречи."}</p>{timing === "scheduled" && availability && <div className="mt-4"><WeekBooking value={form.scheduled_at} duration={mode === "duel" ? 60 : form.duration_minutes} availability={availability} onChange={(scheduled_at) => setForm({ ...form, scheduled_at })} /></div>}</div>
          <div className="text-sm text-slate-400 md:col-span-2">
            <span>{mode === "duel" ? "Лимит одной попытки (общее окно — 1 час)" : "Длительность"}</span>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={mode === "duel" ? "Лимит одной попытки" : "Длительность встречи"}>
              {durationPresets.map((minutes) => <button type="button" key={minutes} aria-pressed={!customDurationActive && form.duration_minutes === minutes} onClick={() => chooseDuration(minutes)} className={`rounded-xl border px-4 py-2 ${!customDurationActive && form.duration_minutes === minutes ? "border-lime-300 bg-lime-300/10 text-lime-100" : "border-white/10 text-slate-300"}`}>{minutes} мин</button>)}
              <label className={`room-duration-custom${customDurationActive ? " is-active" : ""}${customDuration && !customDurationValid ? " is-invalid" : ""}`}><span>Другое</span><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} placeholder="2–30" value={customDuration} aria-label="Другое количество минут" aria-invalid={Boolean(customDuration && !customDurationValid)} aria-describedby={customDurationActive && !customDurationValid ? "room-duration-hint" : undefined} onFocus={() => setCustomDurationActive(true)} onChange={(e) => enterCustomDuration(e.target.value)} /><span>мин</span></label>
            </div>
            {customDurationActive && !customDurationValid && <p id="room-duration-hint" role={customDuration ? "alert" : undefined} className={`mt-2 text-xs ${customDuration ? "text-rose-200" : "text-slate-400"}`}>Введите от 2 до 30 минут.</p>}
          </div>
          {mode === "duel" && form.scenario_id && <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 p-4 text-sm text-slate-300"><input type="checkbox" className="mt-1 accent-lime-300" checked={form.ranked} onChange={(e) => setForm({ ...form, ranked: e.target.checked })} /><span><b className="block text-white">Учитывать командный результат</b>Результат попадёт в рейтинг только после завершения обеих попыток и отдельного согласия обоих.</span></label>}
          <div className="md:col-span-2"><div className="flex flex-wrap gap-3"><button className="primary-button" aria-busy={pending === "create"} disabled={busy || missingFriend || (Boolean(friendId) && !friends) || availability?.quota?.remaining === 0 || (customDurationActive && !customDurationValid) || !form.display_name.trim() || !form.request_text.trim() || !form.goal.trim() || (timing === "scheduled" && !form.scheduled_at)} onClick={()=>setReview(true)}>Проверить встречу →</button></div>{(!form.display_name.trim() || !form.request_text.trim() || !form.goal.trim() || (timing === "scheduled" && !form.scheduled_at)) && <p className="mt-2 text-xs text-slate-400">Укажите имя, ситуацию, цель{timing === "scheduled" ? " и время" : ""}.</p>}</div>
        </div>
      </section>}
      <aside className="space-y-5 room-invitation-panel">
        <section className="glass rounded-3xl p-6"><h2 className="text-xl font-bold">Войти по приглашению</h2><p className="mt-2 text-sm text-slate-400">Сначала покажем условия. Вход произойдёт только после вашего подтверждения.</p><label className="mt-5 block text-sm">Код комнаты<input className={`${input} mt-1 room-code-input`} value={code} aria-invalid={Boolean(codeError)} aria-describedby={codeError ? "room-code-error" : undefined} onChange={(e) => { inspectionId.current += 1; setCode(e.target.value.trim()); setCodeError(""); setPreview(null); if (pending === "inspect") { setBusy(false); setPending(""); } }} /></label>{codeError && <p id="room-code-error" className="mt-2 text-sm leading-relaxed text-rose-200" role="alert">{codeError}</p>}<button className="subtle-button mt-3" aria-busy={pending === "inspect"} disabled={busy || !code.trim()} onClick={inspect}>{pending === "inspect" ? "Проверяем код…" : "Проверить приглашение"}</button>{preview && <div className="mt-4 rounded-2xl border border-lime-300/20 bg-lime-300/5 p-4"><div className="text-xs uppercase tracking-widest text-lime-300">{preview.mode === "duel" ? "ДВА ИНТЕРВЬЮ С ИИ" : "ПЕРЕГОВОРЫ ЛЮДЕЙ"}</div><b className="mt-2 block">{preview.scenario.title}</b><p className="mt-2 text-sm text-slate-300">{preview.scenario.public_context}</p><p className="mt-2 text-sm text-lime-200">{moscowDate(preview.scheduled_at)}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400"><div><dt>Создатель</dt><dd className="text-white">{preview.host_name}</dd></div><div><dt>Длительность</dt><dd className="text-white">{preview.duration_minutes} мин</dd></div></dl><fieldset className="room-role-options"><legend>Кем вы будете в этой встрече?</legend><p>{preview.mode === "duel" ? "Оба участника проходят одинаковое задание отдельно." : preview.role_source === "standard" ? "Доступна базовая роль: ИИ не предложил дополнительные варианты." : "Роли подобраны по ситуации создателя. Выберите одну."}</p>{(preview.available_roles || []).map((role) => <label key={role.id} className={roleId === role.id ? "selected" : ""}><input type="radio" name="guest-role" value={role.id} checked={roleId === role.id} onChange={() => setRoleId(role.id)}/><span><b>{role.title}</b><small>{role.description}</small></span></label>)}</fieldset><label className="mt-4 block text-sm">Как к вам обращаться<input className={`${input} mt-1`} value={joinName} onChange={(e) => setJoinName(e.target.value)} /></label><button className="primary-button mt-3" aria-busy={pending === "join"} disabled={busy || !joinName.trim() || (preview.available_roles?.length > 0 && !roleId)} onClick={join}>{pending === "join" ? "Входим в комнату…" : "Подтвердить и войти →"}</button></div>}</section>
        <section className="rounded-3xl border border-white/10 bg-white/[.025] p-5"><b>Что увидит второй участник</b><ul className="mt-3 space-y-2 text-sm text-slate-400"><li>• формат, тему и время встречи;</li><li>• публичное описание сценария;</li><li>• выбор подходящей роли до входа; личную цель — после.</li></ul></section>
        {mode === "duel" && <section className="glass rounded-3xl p-5"><b>Командный рейтинг</b><p className="mt-1 text-xs text-slate-500">Только одинаковые рейтинговые сценарии и согласие обоих.</p><div className="mt-3 space-y-2">{leaderboard.slice(0, 5).map((item) => <div key={`${item.position}-${item.challenge_key}`} className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm"><b className="text-lime-200">#{item.position}</b><span className="flex -space-x-2">{(item.member_profiles || []).map((member) => <UserAvatar key={member.id} avatarCode={member.avatar_code} frameCode={member.frame_code} userId={member.id} size="xs" name={`Аватар ${member.name}`} />)}</span><span className="min-w-0 flex-1 truncate">{item.team_name}</span><b>{item.score}</b></div>)}{!leaderboard.length && <p className="text-sm text-slate-400">Пока нет опубликованных результатов.</p>}</div>{records.length > 0 && <p className="mt-3 text-xs text-slate-400">Ваш лучший результат: <b className="text-white">{Math.max(...records.map((item) => item.score))}</b></p>}</section>}
        {!invitationMode && <section className="glass rounded-3xl p-5" aria-labelledby="room-history-title">
          <h2 id="room-history-title" className="eyebrow">ИСТОРИЯ КОМНАТ</h2>
          <div className="mt-4 grid gap-3">
            {visibleRooms.map((room) => <button type="button" key={room.id} onClick={() => nav(`/room/${room.id}`)} className="w-full min-w-0 rounded-2xl border border-white/10 p-4 text-left transition hover:bg-white/5"><div className="flex flex-wrap items-center justify-between gap-2"><b className="min-w-0 break-words">{room.scenario?.title || room.problem}</b><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-lime-200">{statusText[room.phase] || statusText[room.status] || room.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-400">{room.problem}</p><small className="mt-3 block text-slate-500">{room.mode === "duel" ? "ИИ интервью" : "Переговоры"} · {room.duration_minutes} мин · {moscowDate(room.scheduled_at)}</small></button>)}
            {!rooms.length && <p className="text-sm text-slate-400">Здесь появятся созданные и принятые комнаты.</p>}
          </div>
          {historyPageCount > 1 && <nav className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4" aria-label="Страницы истории комнат">
            <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={currentHistoryPage === 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}>← Назад</button>
            <span className="text-xs text-slate-400">{currentHistoryPage} из {historyPageCount}</span>
            <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={currentHistoryPage === historyPageCount} onClick={() => setHistoryPage(currentHistoryPage + 1)}>Далее →</button>
          </nav>}
        </section>}
      </aside>
    </div>
    {review && createPortal(<div className="product-page booking-modal" onKeyDown={e=>{if(e.key==="Escape")setReview(false);}}><section role="dialog" aria-modal="true" aria-labelledby="room-review-title" className="glass booking-modal-card w-full max-w-lg rounded-3xl p-7"><span className="eyebrow">ПЕРЕД СОЗДАНИЕМ</span><h2 id="room-review-title" className="mt-3 text-2xl font-bold">{mode==="human"?"Переговоры с человеком":"Два независимых интервью"}</h2><p className="mt-4">{form.request_text}</p><p className="mt-3"><b>Цель:</b> {form.goal}</p><p className="mt-3">{timing==="now"?"Можно начать после принятия приглашения":moscowDate(form.scheduled_at)} · {form.duration_minutes} мин{mode==="duel"?" на попытку, в течение общего часа":""}</p><p className="mt-3">{selectedFriend?`Пригласим ${selectedFriend.display_name||selectedFriend.username}`:"Вы поделитесь кодом или ссылкой после создания"}</p><p className="mt-3 text-sm text-slate-400">{mode==="duel"?"Одинаковые вопросы и критерии, без ментора. Неявка не считается проигрышем.":"У каждого своя роль и личная цель. Общий результат — договорённость, без победителя."}</p><div className="practice-actions"><button autoFocus className="primary-button" disabled={busy} onClick={create}>{selectedFriend?"Создать и пригласить":"Создать встречу"}</button><button className="subtle-button" onClick={()=>setReview(false)}>Изменить</button></div></section></div>,document.body)}
    {created && <RoomCreatedDialog room={created} immediate={createdImmediate} invite={createdInvite} onRetryInvite={retryFriendInvite} onChat={() => nav(`/people?chat=${createdInvite.friend.id}`)} onClose={() => setCreated(null)} onOpen={() => nav(`/room/${created.id}`)} onCancelled={() => { setCreated(null); refresh(); }} />}
  </div>;
}

function RoomCreatedDialog({ room, immediate, invite, onRetryInvite, onChat, onClose, onOpen, onCancelled }) {
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
  return createPortal(<div className="product-page booking-modal">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="room-created-title" className="glass booking-modal-card w-full max-w-lg rounded-3xl p-7">
      <div className="eyebrow">{immediate ? "КОМНАТА ГОТОВА" : "ЗАПИСЬ ПОДТВЕРЖДЕНА"}</div>
      <h2 id="room-created-title" className="mt-3 text-2xl font-bold">{immediate ? "Можно начинать" : "Время забронировано"}</h2>
      <p className="mt-3 text-lg text-lime-200">{immediate ? "Вход открыт сейчас" : moscowDate(room.scheduled_at)}</p>
      <p className="mt-2 text-sm text-slate-400">{immediate ? "Комната ждёт второго участника. После его входа вы сможете подготовиться и начать." : `Вход откроется ${moscowDate(room.entry_opens_at)} — за 15 минут до встречи. Запись сохранена в профиле.`}</p>
      {invite ? <div className="mt-4 rounded-2xl border border-lime-300/25 bg-lime-300/5 p-4" role={invite.status === "failed" ? "alert" : "status"}>
        <b className="text-white">{invite.friend.display_name || invite.friend.username}</b>
        <p className="mt-1 text-sm text-slate-300">{invite.status === "sent" ? "Приглашение отправлено в чат друга. Ждём, когда он подтвердит участие." : invite.status === "sending" ? "Отправляем приглашение…" : `Встреча создана, но приглашение не отправилось: ${invite.error || "ошибка связи"}`}</p>
        {invite.status === "failed" && <button type="button" className="subtle-button mt-3" onClick={onRetryInvite}>Повторить отправку</button>}
        {invite.status === "sent" && <button type="button" className="subtle-button mt-3" onClick={onChat}>Открыть переписку →</button>}
      </div> : <p className="mt-4 text-sm text-slate-300">Теперь пригласите друга ниже или поделитесь кодом встречи.</p>}
      <p className="mt-4 text-sm text-slate-400">Код приглашения</p>
      <div className="mt-2 select-all rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-mono text-xl tracking-widest">{room.code}</div>
      <BookingActions room={room} onCancelled={onCancelled} allowShare={!invite}/>
      <div className="mt-5 flex flex-wrap gap-3"><button className="primary-button" onClick={onOpen}>{immediate ? "Перейти в комнату" : room.entry_available ? "Перейти к встрече" : "Посмотреть запись"} →</button><button className="subtle-button" onClick={onClose}>Закрыть</button></div>
    </div>
  </div>, document.body);

}

export function WeekBooking({ value, duration, availability, onChange }) {
  const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  const now = new Date(availability.now);
  const moscowDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = new Date(`${moscowDate}T00:00:00Z`);
  const [week, setWeek] = useState(0);
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return date; });
  const selectedKey = value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : moscowDate;
  const [activeDay, setActiveDay] = useState(selectedKey);
  const dayListRef = useRef(null);
  useEffect(() => {
    const list = dayListRef.current;
    if (!list) return undefined;
    const revealSelected = () => {
      const selected = list.querySelector('[aria-pressed="true"]');
      if (!selected) return;
      const listRect = list.getBoundingClientRect();
      const dayRect = selected.getBoundingClientRect();
      list.scrollLeft += dayRect.left - listRect.left - (listRect.width - dayRect.width) / 2;
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeDay, week]);
  const booked = (availability.booked || []).map((item) => ({ start: new Date(item.start).getTime(), end: new Date(item.end).getTime() }));
  const slots = [];
  for (let minutes = 9 * 60; minutes <= 22 * 60; minutes += 30) slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  const chosen = value ? new Date(value).getTime() : null;
  function moveWeek(next) { const bounded = Math.max(0, Math.min(1, next)); setWeek(bounded); const first = new Date(today); first.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + bounded * 7); setActiveDay(first.toISOString().slice(0, 10)); }
  return <div className="booking-calendar rounded-3xl p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><b className="text-white">Дата и время по Москве</b><p className="mt-1 text-xs text-slate-400">Занятые интервалы учтены по вашему расписанию.</p></div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Предыдущая неделя" disabled={week === 0} className="subtle-button px-3 py-2" onClick={() => moveWeek(week - 1)}>←</button>
        <button type="button" aria-label="Следующая неделя" disabled={week === 1} className="subtle-button px-3 py-2" onClick={() => moveWeek(week + 1)}>→</button>
        {value && <button type="button" className="subtle-button px-3 py-2 text-xs" onClick={() => onChange("")}>Сбросить</button>}
      </div>
    </div>
    <div ref={dayListRef} className="booking-day-list mt-4 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Выберите день">
      {days.map((day, index) => {
        const key = day.toISOString().slice(0, 10);
        const past = day < today;
        return <button type="button" key={key} disabled={past} aria-pressed={activeDay === key} aria-label={day.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} onClick={() => setActiveDay(key)} className="booking-day min-w-[78px] flex-1 px-1 py-3 text-center transition">
          <span className="block text-xs uppercase">{weekdays[index]}</span><b className="mt-1 block text-lg">{day.getUTCDate()}</b><small>{day.toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" })}</small>
        </button>;
      })}
    </div>
    <div className="mt-4 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6" role="group" aria-label="Выберите время">
      {slots.map((time) => {
        const iso = new Date(`${activeDay}T${time}:00+03:00`).toISOString();
        const stamp = new Date(iso).getTime();
        const past = stamp <= now.getTime();
        const taken = booked.some((item) => stamp < item.end && stamp + duration * 60000 > item.start) && stamp !== chosen;
        return <button type="button" key={time} disabled={past || taken} aria-pressed={stamp === chosen} title={taken ? "Пересекается с вашей встречей" : past ? "Время прошло" : "Забронировать"} onClick={() => onChange(iso)} className={`booking-slot px-2 py-2 text-sm ${taken ? "line-through" : ""}`}>{time}</button>;
      })}
    </div>
    {value && <p className="mt-4 text-sm text-lime-200">Выбрано: {new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} МСК</p>}
  </div>;
}
