import PageHeader from "../design/PageHeader.jsx";
import Icon from "../components/Icon.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

import SocialProfile from "../components/SocialProfile.jsx";
import ProfileMail from "../components/ProfileMail.jsx";
import ProfileBookings from "../components/ProfileBookings.jsx";
import { ArenaSharePanel } from "../components/feed/ArenaShares.jsx";

const CTA = {
  "Пройти сценарий": "/scenarios", "Выбрать сценарий": "/scenarios", "Укрепить доверие": "/training/path", "Перейти к обучению": "/training/path", "Попробовать новую роль": "/setup", "Открыть новый сценарий": "/scenarios", "Изучить альтернативы": "/training/path", "Повторить тренировку": "/training/path", "Пройти сложный сценарий": "/scenarios", "Выбрать сложного оппонента": "/setup", "Выбрать новый тип конфликта": "/scenarios", "Завершить обучение": "/training/path",
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [achievementTab, setAchievementTab] = useState("earned");
  const [showAllEarned, setShowAllEarned] = useState(false);
  const nav = useNavigate();
  const load = () => api("/api/profile").then(setProfile);
  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);
  if (!profile && error) return <div className="glass report-load-state" role="alert"><h1>Профиль не открылся</h1><p>{error}</p><button className="primary-button" onClick={() => { setError(""); load().catch((cause) => setError(cause.message)); }}>Повторить</button></div>;
  if (!profile) return <div className="text-slate-400">Загружаем профиль…</div>;

  return <div id="profile-page" className={`profile-theme-${profile.cosmetics?.profile_theme || "theme_arena"} mx-auto max-w-7xl space-y-6`}>
    <PageHeader title="Профиль" />
    <SocialProfile profile={profile} onSaved={load} />
    <ProfileMail />
    <ArenaSharePanel kind="CERTIFICATE" title="Ваши открытые сертификаты" />

    <section className="glass rounded-3xl p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">ДОСТИЖЕНИЯ</div><h2 className="mt-1 text-xl font-bold">{profile.achievement_details?.length || 0} получено</h2></div><button className="subtle-button" onClick={() => setAchievementTab(achievementTab === "all" ? "earned" : "all")}>{achievementTab === "all" ? "К полученным" : "Все достижения →"}</button></div>{achievementTab === "earned" ? <div className="achievement-overview">{(profile.achievement_details || []).slice(0, showAllEarned ? undefined : 6).map((item) => <div key={item.code}><Icon name="trophy" size={19} /><b>{item.name}</b></div>)}{(profile.achievement_details?.length || 0) > 6 && <button onClick={() => setShowAllEarned((value) => !value)} className="achievement-more">{showAllEarned ? "Свернуть" : `Ещё ${profile.achievement_details.length - 6} полученных →`}</button>}</div> : <div className="mt-5 grid gap-3 md:grid-cols-2">{(profile.achievement_catalog || []).map((item) => <article key={item.code} className={`rounded-2xl border p-4 ${item.unlocked ? "border-lime-300/30 bg-lime-300/5" : "border-white/10 bg-white/[.02]"}`}><div className="flex items-start justify-between gap-3"><div><b className="ui-icon-label"><Icon name={item.unlocked ? "trophy" : "target"} size={18} />{item.name}</b><p className="mt-1 text-sm text-slate-400">{item.condition}</p></div><span className="text-sm text-lime-100">{item.current}/{item.target}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-lime-400 to-lime-400" style={{ width: `${Math.min(100, item.current / item.target * 100)}%` }} /></div></article>)}</div>}</section>
    <button type="button" className="profile-shop-entry glass" onClick={() => nav("/shop")}>
      <span><small>ПЕРСОНАЛИЗАЦИЯ</small><strong>Магазин</strong></span>
      <span className="subtle-button profile-shop-entry-action">Открыть магазин →</span>
    </button>

    <ProfileBookings />

    <section className="glass rounded-3xl p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">СЛЕДУЮЩАЯ ВЕХА</div><h2 className="mt-1 text-2xl font-bold">{profile.next_rank_name ? `До ранга «${profile.next_rank_name}»` : "Максимальный ранг достигнут"}</h2></div><div className="text-right"><b className="text-2xl text-lime-200">{profile.rank_progress}%</b><div className="text-xs text-slate-400">прогресс</div></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-lime-400 to-lime-400" style={{ width: `${profile.rank_progress}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(profile.rank_requirements || []).map((item) => <button key={item.label} onClick={() => !item.done && nav(CTA[item.cta] || "/setup")} className={`rank-requirement ${item.done ? "done" : ""}`}><Icon name={item.done ? "check" : "circle-dot"} size={20} /><div><b>{item.label}</b><small>{item.value}</small></div>{!item.done && <em>{item.cta} →</em>}</button>)}</div></section>

    <section className="glass profile-learning-card rounded-3xl p-6"><div><div className="eyebrow">ОБУЧЕНИЕ</div><h2 className="mt-1 text-xl font-bold">Освоение дерева навыков</h2></div><div className="profile-learning-summary"><b>{profile.learning_percent}%</b><span>Пройдено уровней: {profile.learning_completed || 0} из {profile.learning_total || 0}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-lime-400" style={{ width: `${profile.learning_percent}%` }} /></div><button onClick={() => nav("/training/tree")} className="subtle-button mt-5">Продолжить обучение →</button></section>
  </div>;
}
