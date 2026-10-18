import WeekBooking from "../components/WeekBooking.jsx";
export { default as WeekBooking } from "../components/WeekBooking.jsx";
import Icon from "../components/Icon.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { businessPath, businessPracticePath } from "../business/navigation.js";
import { UserAvatar } from "../components/cosmetics/CosmeticVisual.jsx";
import "./room-role-options.css";
import BookingActions, { moscowDate } from "../components/BookingActions.jsx";

const emptyForm = {
  display_name: "", request_text: "", goal: "", team_name: "", scenario_id: "",
  scheduled_at: "", timezone: "Europe/Moscow", specialization: "", level: "начальный", role: "",
  duration_minutes: 15, ranked: false,
};

const durationPresets = [5, 10, 15, 20, 30];

export default function RoomHub() {
  const nav = useNavigate();
  const { companyId } = useParams();
  const [params, setParams] = useSearchParams();
  const roomsBase = companyId ? businessPracticePath(companyId, "rooms") : "/rooms";
  const roomPath = (roomId) => companyId ? `/business/${encodeURIComponent(companyId)}/room/${roomId}` : `/room/${roomId}`;
  const invitationMode = Boolean(params.get("code"));
  const [friends, setFriends] = useState(null);
  const [friendId, setFriendId] = useState(params.get("friend") || "");
  const [createdInvite, setCreatedInvite] = useState(null);
  const [mailEnabled, setMailEnabled] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [createdEmailInvite, setCreatedEmailInvite] = useState(null);
  const [timing, setTiming] = useState(params.get("friend") ? "now" : "scheduled");
  const [createdImmediate, setCreatedImmediate] = useState(false);
  const [mode, setMode] = useState(params.get("mode") === "duel" ? "duel" : "human");
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
  const [scenarios, setScenarios] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [scenarioLibraryOpen, setScenarioLibraryOpen] = useState(false);
  const selectedFriend = friends?.find((person) => String(person.id) === friendId);
  const missingFriend = Boolean(friends && friendId && !selectedFriend);
  const customDurationValid = /^[0-9]+$/.test(customDuration) && Number(customDuration) >= 2 && Number(customDuration) <= 30;

  function chooseFriend(id) {
    setFriendId(id);
    setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("friend", id); else next.delete("friend"); next.set("mode", mode); return next; }, { replace: true });
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

  async function refresh() { setAvailability(await api("/api/rooms/availability")); }
  useEffect(() => { Promise.all([
    refresh(), api("/api/rooms/scenarios").then(setScenarios),
    api("/api/profile").then((profile) => { setJoinName(profile.personal?.display_name || profile.username || ""); setForm((current) => ({ ...current,
      display_name: current.display_name || profile.personal?.display_name || profile.username || "",
      specialization: current.specialization || profile.personal?.specialization || "",
    })); }),
  ]).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (!invitationMode) api("/api/social/friends").then((rows) => setFriends(rows.filter((person) => person.relationship === "FRIENDS"))).catch((failure) => setError(failure.message)); }, [invitationMode]);
  useEffect(() => { if (!invitationMode) api("/api/mail/status").then((result) => setMailEnabled(Boolean(result.enabled))).catch(() => setMailEnabled(false)); }, [invitationMode]);
  useEffect(() => { setFriendId(params.get("friend") || ""); }, [params.get("friend")]);
  useEffect(() => { setMode(params.get("mode") === "duel" ? "duel" : "human"); }, [params.get("mode")]);
  useEffect(() => {const previous=params.get("repeat");if(!previous)return;api(`/api/rooms/${previous}`).then(room=>{const scenarioId=room.scenario?.source==="custom"?"":room.scenario?.id||"";setMode(room.mode);setTiming("now");setScenarioLibraryOpen(Boolean(scenarioId));setForm(current=>({...current,request_text:room.request_text,goal:room.your_goal||room.goal,role:room.your_role||"",level:room.level||"начальный",specialization:room.specialization||"",scenario_id:scenarioId,duration_minutes:room.duration_minutes}));if (durationPresets.includes(room.duration_minutes)) { setCustomDuration(""); setCustomDurationActive(false); } else { setCustomDuration(String(room.duration_minutes)); setCustomDurationActive(true); }}).catch(e=>setError(e.message));},[params.get("repeat")]);
  const selectedScenario = useMemo(() => scenarios.find((item) => item.id === form.scenario_id), [scenarios, form.scenario_id]);

  async function create() {
    setReview(false);
    setBusy(true); setPending("create"); setError("");
    try {
      const body = { ...form, mode, scheduled_at: timing === "now" ? null : form.scheduled_at || null, scenario_id: form.scenario_id || null };
      const room = await api("/api/rooms", { method: "POST", body });
      setCreated(room);
      setCreatedImmediate(timing === "now");
      if (mailEnabled && inviteEmail.trim()) {
        setCreatedEmailInvite({ email: inviteEmail.trim(), status: "sending" });
        try {
          await api(`/api/rooms/${room.id}/email-invite`, { method: "POST", body: { email: inviteEmail.trim() } });
          setCreatedEmailInvite({ email: inviteEmail.trim(), status: "sent" });
        } catch (failure) {
          setCreatedEmailInvite({ email: inviteEmail.trim(), status: "failed", error: failure.message });
        }
      } else setCreatedEmailInvite(null);
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
      if (data.already_joined) { nav(roomPath(data.id)); return; }
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
      nav(roomPath(room.id));
    } catch (e) { setError(e.message); } finally { setBusy(false); setPending(""); }
  }

  const input = "w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none focus:border-lime-300/60";
  return <div className="arena-room-hub mx-auto max-w-7xl space-y-7" data-room-created={Boolean(created)} data-invitation-mode={invitationMode}>
    {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
    <div className={`grid gap-6 ${invitationMode ? "max-w-3xl" : "xl:grid-cols-[1.35fr_.65fr]"}`} data-invitation={invitationMode}>
      {!invitationMode && <section className="glass rounded-3xl p-6 room-booking-form">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Новая встреча</h2><span className="text-xs text-slate-400">2 участника · 2–30 минут</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[{ id: "human", icon: "users", title: "Переговоры людей", text: "Общий видеозвонок, разные роли и личные цели. Записывается только ваш микрофон." }, { id: "duel", icon: "bot", title: "Два интервью с ИИ", text: "Одинаковое задание, два отдельных интервью без ментора. После — сравнение и личный разбор." }].map((item) => <button key={item.id} className={`rounded-2xl border p-5 text-left transition ${mode === item.id ? "border-lime-300/70 bg-lime-300/10 shadow-[0_0_30px_var(--accent-lime-soft)]" : "border-white/10 hover:bg-white/5"}`} onClick={() => setMode(item.id)}><Icon name={item.icon} size={27} className="text-lime-200" /><b className="mt-3 block">{item.title}</b><span className="mt-1 block text-sm leading-relaxed text-slate-400">{item.text}</span></button>)}
        </div>
        <div className="mt-5 rounded-2xl border border-lime-300/25 bg-lime-300/[.055] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-white">С кем встретиться?</b>{friends?.length !== 0 && <p className="mt-1 text-xs text-slate-400">Выбранный друг получит приглашение в чат сразу после создания комнаты.</p>}</div>{selectedFriend && <UserAvatar avatarCode={selectedFriend.avatar_code} frameCode={selectedFriend.frame_code} userId={selectedFriend.id} size="sm" name={`Аватар ${selectedFriend.display_name || selectedFriend.username}`} />}</div>
          {friends?.length !== 0 && <label className="mt-3 block text-sm text-slate-300">Друг<select className={`${input} mt-1`} value={friendId} onChange={(event) => chooseFriend(event.target.value)} disabled={!friends}><option value="">Приглашу позже</option>{friends?.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.username} (@{person.username})</option>)}</select></label>}
          {mailEnabled && <label className="mt-3 block text-sm text-slate-300">Или отправить приглашение по почте<input className={`${input} mt-1`} type="email" autoComplete="email" maxLength={254} placeholder="friend@example.ru" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /><span className="mt-1 block text-xs text-slate-400">Необязательно. Ссылку также можно скопировать после создания встречи.</span></label>}
          {missingFriend && friends.length > 0 && <p className="mt-2 text-xs text-rose-200" role="alert">Друг больше не доступен для приглашения. Выберите другого или вариант «Приглашу позже».</p>}
          {friends?.length === 0 && <div className="room-friends-empty">
            <span className="room-friends-empty-icon"><Icon name="users" size={21} /></span>
            <div className="room-friends-empty-copy"><strong>Подтверждённых друзей пока нет</strong><p>Создайте встречу и поделитесь кодом или найдите друга сейчас.</p></div>
            <div className="room-friends-empty-actions"><button type="button" className="primary-button room-friends-find" onClick={() => nav(companyId ? businessPath(companyId, "community") : "/people")}>{companyId ? "Открыть сотрудников" : "Найти друзей"} <Icon name="arrow-up-right" size={18} /></button>{missingFriend && <button type="button" className="subtle-button" onClick={() => chooseFriend("")}>Приглашу позже</button>}</div>
          </div>}
        </div>
        <div className="room-meeting-setup mt-6">
          <section className="room-setup-card" aria-labelledby="room-task-title">
            <div className="room-setup-heading">
              <div><span>01</span><h3 id="room-task-title">Задача встречи</h3></div>
              <div className="room-scenario-switch" role="group" aria-label="Источник сценария">
                <button type="button" aria-pressed={!scenarioLibraryOpen} onClick={() => { setScenarioLibraryOpen(false); setForm((current) => ({ ...current, scenario_id: "", request_text: current.scenario_id ? "" : current.request_text, goal: current.scenario_id ? "" : current.goal, role: current.scenario_id ? "" : current.role, ranked: false })); }}>Своя ситуация</button>
                <button type="button" aria-pressed={scenarioLibraryOpen} onClick={() => setScenarioLibraryOpen(true)}>Готовый сценарий</button>
              </div>
            </div>
            {scenarioLibraryOpen && <label className="room-field room-field-wide"><span>Сценарий</span><select className={input} value={form.scenario_id} onChange={(e) => { const scenario = scenarios.find((item) => item.id === e.target.value); setForm((current) => ({ ...current, scenario_id: e.target.value, request_text: scenario?.request_text || "", goal: scenario?.goal || "", role: scenario?.role || "", ranked: e.target.value ? current.ranked : false })); }}><option value="">Выберите сценарий</option>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{selectedScenario && <span className="room-scenario-description">{selectedScenario.description}</span>}</label>}
            {!scenarioLibraryOpen && <div className="room-task-grid">
              <label className="room-field room-field-situation"><span>{mode === "duel" ? "Вакансия и компания" : "Ситуация переговоров"}</span><textarea className={input} rows={3} placeholder={mode === "duel" ? "Например: middle backend разработчик в продуктовой IT-компании" : "Например: согласовать сроки запуска с заказчиком после изменения требований"} value={form.request_text} onChange={(e) => setForm({ ...form, request_text: e.target.value })} /></label>
              <label className="room-field"><span>Желаемый результат</span><textarea className={input} rows={3} placeholder="Какой итог будет для вас успешным?" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label>
              <label className="room-field room-role-field"><span>Ваша роль</span><input className={input} placeholder={mode === "duel" ? "Кандидат" : "Например: руководитель проекта"} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
            </div>}
          </section>
          <section className="room-setup-card" aria-labelledby="room-time-title">
            <div className="room-setup-heading"><div><span>02</span><h3 id="room-time-title">Когда провести</h3></div></div>
            <div className="room-timing-row">
              <div className="room-timing-switch" role="group" aria-label="Когда начать встречу"><button type="button" aria-pressed={timing === "now"} onClick={() => setTiming("now")}>Сейчас</button><button type="button" aria-pressed={timing === "scheduled"} onClick={() => setTiming("scheduled")}>Запланировать</button></div>
              <div className="room-duration-group"><span>{mode === "duel" ? "Лимит попытки" : "Длительность"}</span><div role="group" aria-label={mode === "duel" ? "Лимит одной попытки" : "Длительность встречи"}>{durationPresets.map((minutes) => <button type="button" key={minutes} aria-label={`${minutes} минут`} aria-pressed={!customDurationActive && form.duration_minutes === minutes} onClick={() => chooseDuration(minutes)}>{minutes}</button>)}<label className={`room-duration-custom${customDurationActive ? " is-active" : ""}${customDuration && !customDurationValid ? " is-invalid" : ""}`}><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} placeholder="2–30" value={customDuration} aria-label="Другое количество минут" aria-invalid={Boolean(customDuration && !customDurationValid)} onFocus={() => setCustomDurationActive(true)} onChange={(e) => enterCustomDuration(e.target.value)} /><span>мин</span></label></div></div>
            </div>
            <p className="room-timing-note">{timing === "now" ? "Комната откроется сразу и будет ждать второго участника." : "Вход откроется за 15 минут до выбранного времени."}</p>
            {timing === "scheduled" && availability && <div className="room-booking-calendar"><WeekBooking value={form.scheduled_at} duration={mode === "duel" ? 60 : form.duration_minutes} availability={availability} onChange={(scheduled_at) => setForm({ ...form, scheduled_at })} /></div>}
          </section>
          {mode === "duel" && form.scenario_id && <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 p-4 text-sm text-slate-300"><input type="checkbox" className="mt-1 accent-lime-300" checked={form.ranked} onChange={(e) => setForm({ ...form, ranked: e.target.checked })} /><span><b className="block text-white">Учитывать командный результат</b>Результат попадёт в рейтинг только после завершения обеих попыток и отдельного согласия обоих.</span></label>}
          <div className="room-create-action"><button className="primary-button" aria-busy={pending === "create"} disabled={busy || missingFriend || (Boolean(friendId) && !friends) || availability?.quota?.remaining === 0 || (customDurationActive && !customDurationValid) || (scenarioLibraryOpen && !form.scenario_id) || !form.display_name.trim() || !form.request_text.trim() || !form.goal.trim() || (timing === "scheduled" && !form.scheduled_at)} onClick={()=>setReview(true)}>Проверить встречу →</button></div>
        </div>
      </section>}
      <aside className="space-y-5 room-invitation-panel">
        <section className="glass rounded-3xl p-6"><h2 className="text-xl font-bold">Войти по приглашению</h2><p className="mt-2 text-sm text-slate-400">Сначала покажем условия. Вход произойдёт только после вашего подтверждения.</p><label className="mt-5 block text-sm">Код комнаты<input className={`${input} mt-1 room-code-input`} value={code} aria-invalid={Boolean(codeError)} aria-describedby={codeError ? "room-code-error" : undefined} onChange={(e) => { inspectionId.current += 1; setCode(e.target.value.trim()); setCodeError(""); setPreview(null); if (pending === "inspect") { setBusy(false); setPending(""); } }} /></label>{codeError && <p id="room-code-error" className="mt-2 text-sm leading-relaxed text-rose-200" role="alert">{codeError}</p>}<button className="subtle-button mt-3" aria-busy={pending === "inspect"} disabled={busy || !code.trim()} onClick={inspect}>{pending === "inspect" ? "Проверяем код…" : "Проверить приглашение"}</button>{preview && <div className="mt-4 rounded-2xl border border-lime-300/20 bg-lime-300/5 p-4"><div className="text-xs uppercase tracking-widest text-lime-300">{preview.mode === "duel" ? "ДВА ИНТЕРВЬЮ С ИИ" : "ПЕРЕГОВОРЫ ЛЮДЕЙ"}</div><b className="mt-2 block">{preview.scenario.title}</b><p className="mt-2 text-sm text-slate-300">{preview.scenario.public_context}</p><p className="mt-2 text-sm text-lime-200">{moscowDate(preview.scheduled_at)}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400"><div><dt>Создатель</dt><dd className="text-white">{preview.host_name}</dd></div><div><dt>Длительность</dt><dd className="text-white">{preview.duration_minutes} мин</dd></div></dl><fieldset className="room-role-options"><legend>Кем вы будете в этой встрече?</legend><p>{preview.mode === "duel" ? "Оба участника проходят одинаковое задание отдельно." : preview.role_source === "standard" ? "Доступна базовая роль: ИИ не предложил дополнительные варианты." : "Роли подобраны по ситуации создателя. Выберите одну."}</p>{(preview.available_roles || []).map((role) => <label key={role.id} className={roleId === role.id ? "selected" : ""}><input type="radio" name="guest-role" value={role.id} checked={roleId === role.id} onChange={() => setRoleId(role.id)}/><span><b>{role.title}</b><small>{role.description}</small></span></label>)}</fieldset><label className="mt-4 block text-sm">Как к вам обращаться<input className={`${input} mt-1`} value={joinName} onChange={(e) => setJoinName(e.target.value)} /></label><button className="primary-button mt-3" aria-busy={pending === "join"} disabled={busy || !joinName.trim() || (preview.available_roles?.length > 0 && !roleId)} onClick={join}>{pending === "join" ? "Входим в комнату…" : "Подтвердить и войти →"}</button></div>}</section>
      </aside>
    </div>
    {review && createPortal(<div className="product-page booking-modal" onKeyDown={e=>{if(e.key==="Escape")setReview(false);}}><section role="dialog" aria-modal="true" aria-labelledby="room-review-title" className="glass booking-modal-card w-full max-w-lg rounded-3xl p-7"><span className="eyebrow">ПЕРЕД СОЗДАНИЕМ</span><h2 id="room-review-title" className="mt-3 text-2xl font-bold">{mode==="human"?"Переговоры с человеком":"Два независимых интервью"}</h2><p className="mt-4">{form.request_text}</p><p className="mt-3"><b>Цель:</b> {form.goal}</p><p className="mt-3">{timing==="now"?"Можно начать после принятия приглашения":moscowDate(form.scheduled_at)} · {form.duration_minutes} мин{mode==="duel"?" на попытку, в течение общего часа":""}</p><p className="mt-3">{selectedFriend?`Пригласим ${selectedFriend.display_name||selectedFriend.username}`:"Вы поделитесь кодом или ссылкой после создания"}</p><p className="mt-3 text-sm text-slate-400">{mode==="duel"?"Одинаковые вопросы и критерии, без ментора. Неявка не считается проигрышем.":"У каждого своя роль и личная цель. Общий результат — договорённость, без победителя."}</p><div className="practice-actions"><button autoFocus className="primary-button" disabled={busy} onClick={create}>{selectedFriend?"Создать и пригласить":"Создать встречу"}</button><button className="subtle-button" onClick={()=>setReview(false)}>Изменить</button></div></section></div>,document.body)}
    {created && <RoomCreatedDialog room={created} immediate={createdImmediate} invite={createdInvite} emailInvite={createdEmailInvite} onRetryInvite={retryFriendInvite} onChat={() => nav(companyId ? `${businessPath(companyId, "community")}?chat=${createdInvite.friend.id}` : `/people?chat=${createdInvite.friend.id}`)} onClose={() => setCreated(null)} onOpen={() => nav(roomPath(created.id))} onCancelled={() => { setCreated(null); refresh(); }} />}
  </div>;
}

function RoomCreatedDialog({ room, immediate, invite, emailInvite, onRetryInvite, onChat, onClose, onOpen, onCancelled }) {
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
      {emailInvite && <p className="mt-3 text-sm text-slate-300" role={emailInvite.status === "failed" ? "alert" : "status"}>{emailInvite.status === "sent" ? `Письмо для ${emailInvite.email} поставлено в очередь.` : emailInvite.status === "sending" ? "Готовим приглашение по почте…" : `Письмо не отправлено: ${emailInvite.error}. Ссылку можно скопировать ниже.`}</p>}
      <p className="mt-4 text-sm text-slate-400">Код приглашения</p>
      <div className="mt-2 select-all rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-mono text-xl tracking-widest">{room.code}</div>
      <BookingActions room={room} onCancelled={onCancelled} allowShare={!invite}/>
      <div className="mt-5 flex flex-wrap gap-3"><button className="primary-button" onClick={onOpen}>{immediate ? "Перейти в комнату" : room.entry_available ? "Перейти к встрече" : "Посмотреть запись"} →</button><button className="subtle-button" onClick={onClose}>Закрыть</button></div>
    </div>
  </div>, document.body);

}
