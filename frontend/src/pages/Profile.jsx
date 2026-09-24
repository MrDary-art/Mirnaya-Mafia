import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import MetricsBar from "../MetricsBar.jsx";
import SocialProfile from "../components/SocialProfile.jsx";
import Icon from "../components/Icon.jsx";

const CTA = {
  "Пройти сценарий": "/setup", "Выбрать сценарий": "/", "Укрепить доверие": "/training/tree", "Перейти к обучению": "/training/tree", "Попробовать новую роль": "/setup", "Открыть новый сценарий": "/", "Изучить альтернативы": "/training/tree", "Повторить тренировку": "/training/tree", "Пройти сложный сценарий": "/setup", "Выбрать сложного оппонента": "/setup", "Выбрать новый тип конфликта": "/setup", "Завершить обучение": "/training/tree",
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [teamRecords, setTeamRecords] = useState([]);
  const nav = useNavigate();
  const load = () => api("/api/profile").then(setProfile);
  useEffect(() => { Promise.all([load(), api("/api/rooms/records/me").then(setTeamRecords)]).catch((error) => alert(error.message)); }, []);
  useEffect(() => {
    if (!profile) return;
    const hints = {
      "Короткая практика": "Испытание дня: короткий сценарий высокой сложности. Первое успешное прохождение даёт 2 звезды.",
      "Как вы ведёте переговоры": "Этот блок показывает поведение в игровых сессиях, а не психологический диагноз.",
      "Освоение дерева навыков": "Учебные упражнения дают опыт обучения и открывают следующие узлы дерева.",
      "Достижения": "Достижения выдаются один раз за реальные результаты: техники, качество метрик и регулярную практику.",
    };
    document.querySelectorAll("#profile-page h2").forEach((heading) => {
      const text = heading.textContent?.trim();
      const hint = Object.entries(hints).find(([name]) => text?.startsWith(name))?.[1];
      if (!hint || heading.querySelector(".section-help")) return;
      const details = document.createElement("details"); details.className = "section-help";
      const summary = document.createElement("summary"); summary.textContent = "!";
      const panel = document.createElement("span"); panel.textContent = hint;
      Object.assign(details.style, { position: "relative", display: "inline-block", marginLeft: "8px", verticalAlign: "middle" });
      Object.assign(summary.style, { cursor: "pointer", listStyle: "none", border: "1px solid #67e8f9", borderRadius: "999px", color: "#a5f3fc", fontSize: "12px", padding: "1px 7px" });
      Object.assign(panel.style, { position: "absolute", left: "0", top: "30px", zIndex: "40", width: "260px", padding: "10px", borderRadius: "12px", background: "#0b1220", border: "1px solid rgba(255,255,255,.15)", color: "#e2e8f0", fontSize: "12px", lineHeight: "18px", fontWeight: "400" });
      details.append(summary, panel); heading.append(details);
    });
    const duplicatedHints = ["Это поведение в сессиях, а не психологический диагноз.", "Опыт обучения не тратится и не повышает ранг автоматически"];
    document.querySelectorAll("#profile-page p").forEach((paragraph) => { if (duplicatedHints.some((text) => paragraph.textContent?.includes(text))) paragraph.style.display = "none"; });
    const closeHints = (event) => document.querySelectorAll("#profile-page .section-help[open]").forEach((details) => { if (!details.contains(event.target)) details.removeAttribute("open"); });
    document.addEventListener("click", closeHints);
    return () => document.removeEventListener("click", closeHints);
  }, [profile]);
  if (!profile) return <div className="text-slate-400">Загружаем профиль…</div>;
  const last = profile.metrics_chart?.at(-1);
  const initials = profile.username.slice(0, 2).toUpperCase();
  const memberSince = profile.member_since ? new Date(`${profile.member_since}T00:00:00`).toLocaleDateString("ru-RU") : "сегодня";

  return <div id="profile-page" className={`profile-theme-${profile.cosmetics?.profile_theme || "theme_arena"} mx-auto max-w-7xl space-y-6`}>
    <section className="glass overflow-hidden rounded-3xl p-6 md:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-5"><button title="Открыть магазин" onClick={() => nav("/shop")} className="profile-avatar">{initials}<span>{profile.rank}</span></button><div><div className="eyebrow">ПРОФИЛЬ</div><h1 className="mt-1 text-3xl font-extrabold md:text-4xl">{profile.username}</h1><p className="mt-1 text-cyan-200">Ранг {profile.rank} · {profile.rank_name}</p><p className="mt-2 text-sm text-slate-400">Участник с {memberSince}</p><p className="text-sm text-slate-400">Серия активности: {profile.current_streak} дн.</p></div></div><div className="grid grid-cols-2 gap-3 text-center"><Stat value={<span className="ui-icon-label"><Icon name="star" size={16} />{profile.stars}</span>} label="Валюта" /><Stat value={profile.xp} label="Опыт обучения" /></div></div></section>

    <SocialProfile profile={profile} onSaved={load} />

    <section className="glass rounded-3xl p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">ОНЛАЙН 1 НА 1</div><h2 className="mt-1 text-xl font-bold">Командная практика</h2></div><button className="primary-button" onClick={() => nav("/rooms")}>Предложить игру другу →</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{teamRecords.slice(0, 4).map((record) => <button key={record.room_id} onClick={() => nav(`/room/${record.room_id}`)} className="rounded-2xl border border-white/10 p-4 text-left hover:bg-white/5"><div className="flex justify-between gap-3"><b>{record.team_name}</b><span className="text-cyan-200">{record.score} / 200</span></div><p className="mt-2 text-xs text-slate-400">{record.eligible ? record.public ? "Результат опубликован" : "Рейтинговый результат приватен" : "Тренировочная попытка"}</p></button>)}{!teamRecords.length && <p className="text-sm text-slate-400">Здесь появятся результаты парных интервью с ИИ.</p>}</div></section>

    <div className="grid gap-6 lg:grid-cols-12"><section className="glass rounded-3xl p-6 lg:col-span-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">СЛЕДУЮЩАЯ ВЕХА</div><h2 className="mt-1 text-2xl font-bold">{profile.next_rank_name ? `До ранга «${profile.next_rank_name}»` : "Максимальный ранг достигнут"}</h2></div><div className="text-right"><b className="text-2xl text-cyan-200">{profile.rank_progress}%</b><div className="text-xs text-slate-400">визуальный прогресс</div></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${profile.rank_progress}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(profile.rank_requirements || []).map((item) => <button key={item.label} onClick={() => !item.done && nav(CTA[item.cta] || "/setup")} className={`rank-requirement ${item.done ? "done" : ""}`}><span><Icon name={item.done ? "check" : "circle-dot"} size={18} /></span><div><b>{item.label}</b><small>{item.value}</small></div>{!item.done && <em>{item.cta} →</em>}</button>)}</div></section>
      <section className="glass rounded-3xl p-6 lg:col-span-7"><div><div className="eyebrow">ПРОФИЛЬ НАВЫКОВ</div><h2 className="mt-1 text-xl font-bold">Как вы ведёте переговоры</h2></div><p className="mt-3 text-slate-300">Преобладающий стиль поведения: <b>{profile.profile || "пока недостаточно данных"}</b>. Это поведение в сессиях, а не психологический диагноз.</p><div className="mt-5 grid grid-cols-3 gap-3"><Mini label="Сессии" value={profile.sessions_total} /><Mini label="Роли" value={profile.unique_roles?.length || 0} /><Mini label="Сценарии" value={profile.unique_scenarios?.length || 0} /></div>{last && <div className="mt-6"><MetricsBar metrics={last} /></div>}</section>
      <section className="glass rounded-3xl p-6 lg:col-span-5"><div className="eyebrow">ОБУЧЕНИЕ</div><h2 className="mt-1 text-xl font-bold">Освоение дерева навыков</h2><div className="mt-5 flex items-end justify-between"><b className="text-4xl text-violet-200">{profile.learning_percent}%</b><span className="text-sm text-slate-400">Опыт обучения не тратится и не повышает ранг автоматически</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-400" style={{ width: `${profile.learning_percent}%` }} /></div><button onClick={() => nav("/training/tree")} className="subtle-button mt-5">Продолжить обучение</button></section></div>

    <section className="glass rounded-3xl p-6"><div className="eyebrow">ДОСТИЖЕНИЯ</div><h2 className="mt-1 text-xl font-bold">Заработано: {profile.achievement_details?.length || 0}</h2><div className="mt-4 flex flex-wrap gap-2">{(profile.achievement_details || []).map((item) => <span key={item.code} className="ui-icon-label rounded-full border border-cyan-400/30 px-3 py-2 text-sm"><Icon name="trophy" size={16} />{item.name}</span>)}{!profile.achievement_details?.length && <span className="text-sm text-slate-500">Первое достижение появится после завершения переговоров.</span>}</div></section>

  </div>;
}

function Stat({ value, label }) { return <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><b className="block text-lg text-cyan-100">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
function Mini({ value, label }) { return <div className="rounded-2xl bg-white/5 p-3"><b className="block text-2xl">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
function Info({ text }) { return <details className="relative inline-block text-sm font-normal"><summary className="cursor-pointer list-none rounded-full border border-cyan-300/50 px-2 py-0.5 text-xs text-cyan-200">!</summary><span className="absolute left-0 top-8 z-30 w-64 rounded-xl border border-white/15 bg-slate-950 p-3 text-xs leading-5 text-slate-200 shadow-xl">{text}</span></details>; }
