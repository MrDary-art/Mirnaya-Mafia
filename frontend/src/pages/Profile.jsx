import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import SocialProfile from "../components/SocialProfile.jsx";
import ProfileBookings from "../components/ProfileBookings.jsx";

const CTA = {
  "Пройти сценарий": "/scenarios", "Выбрать сценарий": "/scenarios", "Укрепить доверие": "/training/path", "Перейти к обучению": "/training/path", "Попробовать новую роль": "/setup", "Открыть новый сценарий": "/scenarios", "Изучить альтернативы": "/training/path", "Повторить тренировку": "/training/path", "Пройти сложный сценарий": "/scenarios", "Выбрать сложного оппонента": "/setup", "Выбрать новый тип конфликта": "/scenarios", "Завершить обучение": "/training/path",
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [teamRecords, setTeamRecords] = useState([]);
  const [error, setError] = useState("");
  const nav = useNavigate();
  const load = () => api("/api/profile").then(setProfile);
  useEffect(() => { Promise.all([load(), api("/api/rooms/records/me").then(setTeamRecords)]).catch((cause) => setError(cause.message)); }, []);
  if (!profile && error) return <div className="glass report-load-state" role="alert"><h1>Профиль не открылся</h1><p>{error}</p><button className="primary-button" onClick={() => { setError(""); load().catch((cause) => setError(cause.message)); }}>Повторить</button></div>;
  if (!profile) return <div className="text-slate-400">Загружаем профиль…</div>;
  const last = profile.metrics_chart?.at(-1);
  const initials = profile.username.slice(0, 2).toUpperCase();
  const memberSince = profile.member_since ? new Date(`${profile.member_since}T00:00:00`).toLocaleDateString("ru-RU") : null;

  return <div id="profile-page" className={`profile-theme-${profile.cosmetics?.profile_theme || "theme_arena"} mx-auto max-w-7xl space-y-6`}>
    <section className="glass profile-intro overflow-hidden rounded-3xl p-6 md:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-5"><button title="Открыть магазин" onClick={() => nav("/shop")} className="profile-avatar">{initials}<span>{profile.rank}</span></button><div><div className="eyebrow">ПРОФИЛЬ</div><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">{profile.username}</h1><p className="mt-1 text-cyan-200">Ранг {profile.rank} · {profile.rank_name}</p>{memberSince && <p className="mt-2 text-sm text-slate-400">Участник с {memberSince}</p>}<p className="text-sm text-slate-400">Серия активности: {profile.current_streak} дн.</p></div></div><div className="grid grid-cols-2 gap-3 text-center"><Stat value={`★ ${profile.stars}`} label="Валюта" /><Stat value={profile.xp} label="Опыт обучения" /></div></div></section>

    <SocialProfile profile={profile} onSaved={load} />
    <ProfileBookings />

    <section className="glass rounded-3xl p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">ОНЛАЙН 1 НА 1</div><h2 className="mt-1 text-xl font-bold">Командная практика</h2></div><button className="primary-button" onClick={() => nav("/rooms")}>Предложить игру другу →</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{teamRecords.slice(0, 4).map((record) => <button key={record.room_id} onClick={() => nav(`/room/${record.room_id}`)} className="rounded-2xl border border-white/10 p-4 text-left hover:bg-white/5"><div className="flex justify-between gap-3"><b>{record.team_name}</b><span className="text-cyan-200">{record.score} / 200</span></div><p className="mt-2 text-xs text-slate-400">{record.eligible ? record.public ? "Результат опубликован" : "Рейтинговый результат приватен" : "Тренировочная попытка"}</p></button>)}{!teamRecords.length && <p className="text-sm text-slate-400">Здесь появятся результаты парных интервью с ИИ.</p>}</div></section>

    <div className="grid gap-6 lg:grid-cols-12"><section className="glass rounded-3xl p-6 lg:col-span-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">СЛЕДУЮЩАЯ ВЕХА</div><h2 className="mt-1 text-2xl font-bold">{profile.next_rank_name ? `До ранга «${profile.next_rank_name}»` : "Максимальный ранг достигнут"}</h2></div><div className="text-right"><b className="text-2xl text-cyan-200">{profile.rank_progress}%</b><div className="text-xs text-slate-400">визуальный прогресс</div></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${profile.rank_progress}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(profile.rank_requirements || []).map((item) => <button key={item.label} onClick={() => !item.done && nav(CTA[item.cta] || "/setup")} className={`rank-requirement ${item.done ? "done" : ""}`}><span>{item.done ? "✓" : "◐"}</span><div><b>{item.label}</b><small>{item.value}</small></div>{!item.done && <em>{item.cta} →</em>}</button>)}</div></section>
      <section className="glass rounded-3xl p-6 lg:col-span-7"><div><div className="eyebrow">ПРОФИЛЬ ПРАКТИКИ</div><h2 className="mt-1 text-xl font-bold">Как вы ведёте переговоры <Info text="Этот блок показывает поведение в игровых сессиях, а не психологический диагноз." /></h2></div><p className="mt-3 text-slate-300">Преобладающий стиль поведения: <b>{profile.profile || "пока недостаточно данных"}</b>. Это поведение в сессиях, а не психологический диагноз.</p><div className="mt-5 grid grid-cols-3 gap-3"><Mini label="Сессии" value={profile.sessions_total} /><Mini label="Роли" value={profile.unique_roles?.length || 0} /><Mini label="Сценарии" value={profile.unique_scenarios?.length || 0} /></div>{last && <div className="mt-6"><MetricsBar metrics={last} /></div>}</section>
      <section className="glass rounded-3xl p-6 lg:col-span-5"><div className="eyebrow">ОБУЧЕНИЕ</div><h2 className="mt-1 text-xl font-bold">Освоение дерева навыков</h2><div className="mt-5 flex items-end justify-between"><b className="text-4xl text-violet-200">{profile.learning_percent}%</b><span className="text-sm text-slate-400">Опыт обучения не тратится и не повышает ранг автоматически</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-400" style={{ width: `${profile.learning_percent}%` }} /></div><button onClick={() => nav("/training/tree")} className="subtle-button mt-5">Продолжить обучение</button></section></div>

    <section className="glass rounded-3xl p-6"><div className="eyebrow">ДОСТИЖЕНИЯ</div><h2 className="mt-1 text-xl font-bold">Заработано: {profile.achievement_details?.length || 0}</h2><div className="mt-4 flex flex-wrap gap-2">{(profile.achievement_details || []).map((item) => <span key={item.code} className="rounded-full border border-cyan-400/30 px-3 py-2 text-sm">★ {item.name}</span>)}{!profile.achievement_details?.length && <span className="text-sm text-slate-500">Первое достижение появится после завершения переговоров.</span>}</div></section>

  </div>;
}

function Stat({ value, label }) { return <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><b className="block text-lg text-cyan-100">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
function Mini({ value, label }) { return <div className="rounded-2xl bg-white/5 p-3"><b className="block text-2xl">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
function Info({ text }) { return <details className="relative inline-block text-sm font-normal"><summary className="cursor-pointer list-none rounded-full border border-cyan-300/50 px-2 py-0.5 text-xs text-cyan-200">!</summary><span className="absolute left-0 top-8 z-30 w-64 rounded-xl border border-white/15 bg-slate-950 p-3 text-xs leading-5 text-slate-200 shadow-xl">{text}</span></details>; }
