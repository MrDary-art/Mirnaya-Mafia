import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function RoomHub() {
  const nav = useNavigate();
  const [mode, setMode] = useState("human");
  const [form, setForm] = useState({ display_name: "", problem: "", goal: "" });
  const [code, setCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState([]);

  useEffect(() => { api("/api/rooms").then(setRooms).catch(() => setRooms([])); }, []);

  async function create() {
    setBusy(true); setError("");
    try {
      const room = await api("/api/rooms", { method: "POST", body: { ...form, mode } });
      nav(`/room/${room.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function join() {
    setBusy(true); setError("");
    try {
      const room = await api("/api/rooms/join", { method: "POST", body: { code, display_name: joinName } });
      nav(`/room/${room.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const input = "w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-white outline-none focus:border-cyan-300/60";
  return <div className="mx-auto max-w-6xl space-y-7">
    <header><div className="eyebrow">ПАРНАЯ ПРАКТИКА</div><h1 className="mt-2 text-4xl font-extrabold">Одна задача. Два участника.</h1><p className="mt-3 max-w-3xl text-slate-400">Создайте локальную комнату и отправьте код второму участнику. Время практики — до 15 минут после его входа.</p></header>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <section className="glass rounded-3xl p-6">
        <h2 className="text-xl font-bold">Создать комнату</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className={`rounded-2xl border p-5 text-left ${mode === "human" ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10"}`} onClick={() => setMode("human")}><span className="text-2xl">◉</span><b className="mt-3 block">Люди ↔ люди</b><span className="mt-1 block text-sm text-slate-400">Разные роли, общий чат и видеозвонок. ИИ разбирает каждую сторону.</span></button>
          <button className={`rounded-2xl border p-5 text-left ${mode === "duel" ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10"}`} onClick={() => setMode("duel")}><span className="text-2xl">✦</span><b className="mt-3 block">Два собеседования с ИИ</b><span className="mt-1 block text-sm text-slate-400">Одинаковое задание, отдельные диалоги, итоговое сравнение.</span></button>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="text-sm text-slate-400">Как к вам обращаться<input className={`${input} mt-1`} maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label className="text-sm text-slate-400">Ситуация или вакансия<textarea className={`${input} mt-1`} rows={2} placeholder={mode === "duel" ? "Например: собеседование на разработчика в GitHub" : "Например: обсудить повышение бюджета проекта"} value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} /></label>
          <label className="text-sm text-slate-400">Желаемый результат<textarea className={`${input} mt-1`} rows={2} placeholder="Что вы хотите получить к концу разговора?" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label>
          <button className="primary-button justify-self-start" disabled={busy || !form.display_name.trim() || !form.problem.trim() || !form.goal.trim()} onClick={create}>Создать комнату →</button>
        </div>
      </section>
      <aside className="glass h-fit rounded-3xl p-6">
        <h2 className="text-xl font-bold">Войти по коду</h2>
        <p className="mt-2 text-sm text-slate-400">Код выдаст создатель комнаты.</p>
        <input className={`${input} mt-5`} placeholder="Код комнаты" value={code} onChange={(e) => setCode(e.target.value.trim())} />
        <input className={`${input} mt-3`} placeholder="Как к вам обращаться" maxLength={60} value={joinName} onChange={(e) => setJoinName(e.target.value)} />
        <button className="primary-button mt-4" disabled={busy || !code.trim() || !joinName.trim()} onClick={join}>Присоединиться →</button>
      </aside>
    </div>
    <section className="glass rounded-3xl p-6"><div className="flex items-center justify-between gap-4"><div><div className="eyebrow">МОИ КОМНАТЫ</div><h2 className="mt-1 text-xl font-bold">Онлайн 1 на 1</h2></div></div><div className="mt-4 space-y-3">{rooms.map((room) => <button key={room.id} onClick={() => nav(`/room/${room.id}`)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 p-4 text-left hover:bg-white/5"><span><b className="block">{room.from_chat ? `Чат с ${room.peer_name || "другом"}` : room.problem}</b><span className="mt-1 block text-sm text-slate-300">Тема: {room.problem}</span><small className="mt-1 block text-slate-400">{room.mode === "duel" ? "Соревнование" : "Переговоры"} · {room.status === "active" ? "В процессе" : "Ожидание участника"}{room.created_at ? ` · ${new Date(room.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</small></span><span className="text-cyan-200">Открыть →</span></button>)}{!rooms.length && <p className="text-sm text-slate-400">Созданные и принятые приглашения появятся здесь.</p>}</div></section>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
  </div>;
}
