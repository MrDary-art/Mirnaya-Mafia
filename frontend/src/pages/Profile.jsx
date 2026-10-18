import PageHeader from "../design/PageHeader.jsx";
import Icon from "../components/Icon.jsx";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";

import SocialProfile from "../components/SocialProfile.jsx";
import ProfileMail from "../components/ProfileMail.jsx";
import ProfileBookings from "../components/ProfileBookings.jsx";
import { ArenaSharePanel } from "../components/feed/ArenaShares.jsx";
import "./profile.css";

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
    {!!profile.workspaces?.length && <nav className="glass rounded-3xl p-6" aria-label="Ваши компании"><h2 className="text-xl font-bold">Ваши компании</h2><div className="mt-3 flex flex-wrap gap-3">{profile.workspaces.map(workspace => <Link className="subtle-button" key={workspace.company_id} to={`/business/${workspace.company_id}/overview`} aria-label={`Перейти в компанию ${workspace.company}`}>{workspace.company} · {[workspace.department, workspace.job_title].filter(Boolean).join(" · ")}</Link>)}</div></nav>}
    <ArenaSharePanel kind="ACHIEVEMENT" title="Поделиться достижением" />
    <section className="glass profile-growth-panel" aria-labelledby="profile-growth-title">
      <header className="profile-growth-heading"><div><h2 id="profile-growth-title">Прогресс</h2></div></header>
      <div className="profile-growth-grid">
        <section className="profile-achievements-card" aria-labelledby="profile-achievements-title">
          <div className="profile-section-heading"><div><span className="profile-section-icon"><Icon name="trophy" size={21} /></span><div><h3 id="profile-achievements-title">Достижения</h3></div></div></div>
          {achievementTab === "earned" ? <div className="achievement-overview profile-achievement-list">{(profile.achievement_details || []).slice(0, showAllEarned ? undefined : 6).map((item) => <div key={item.code}><Icon name="trophy" size={19} /><b>{item.name}</b></div>)}{(profile.achievement_details?.length || 0) > 6 && <button onClick={() => setShowAllEarned((value) => !value)} className="achievement-more">{showAllEarned ? "Свернуть" : `Ещё ${profile.achievement_details.length - 6} →`}</button>}</div> : <div className="profile-achievement-catalog">{(profile.achievement_catalog || []).map((item) => <article key={item.code} className={item.unlocked ? "is-unlocked" : ""}><div><b><Icon name={item.unlocked ? "trophy" : "target"} size={18} />{item.name}</b><span>{item.current}/{item.target}</span></div><p>{item.condition}</p><div className="profile-progress-track"><i style={{ width: `${Math.min(100, item.current / item.target * 100)}%` }} /></div></article>)}</div>}
          <div className="profile-card-actions">
            <button type="button" className="profile-shop-link" onClick={() => setAchievementTab(achievementTab === "all" ? "earned" : "all")}><span className="profile-section-icon"><Icon name="trophy" size={21} /></span><span><small>ДОСТИЖЕНИЯ</small><b>{achievementTab === "all" ? "Показать полученные" : "Посмотреть все"}</b></span><Icon name="arrow-right" size={19} /></button>
            <button type="button" className="profile-shop-link" onClick={() => nav("/shop")}><span className="profile-section-icon"><Icon name="star" size={21} /></span><span><small>ОФОРМЛЕНИЕ ПРОФИЛЯ</small><b>Открыть магазин</b></span><Icon name="arrow-right" size={19} /></button>
          </div>
        </section>
        <section className="profile-learning-card" aria-labelledby="profile-learning-title">
          <div className="profile-section-heading"><div><span className="profile-section-icon"><Icon name="book-open" size={21} /></span><div><h3 id="profile-learning-title">Дерево навыков</h3><p>{profile.learning_completed || 0} из {profile.learning_total || 0} уровней</p></div></div></div>
          <div className="profile-learning-score"><b>{profile.learning_percent}%</b><span>ваш прогресс</span></div>
          <div className="profile-progress-track profile-learning-track"><i style={{ width: `${profile.learning_percent}%` }} /></div>
          <button onClick={() => nav("/training/tree")} className="primary-button profile-learning-action">Продолжить обучение →</button>
        </section>
      </div>
    </section>

    <ProfileBookings />
    <div className="profile-secondary-grid"><ProfileMail /><ArenaSharePanel kind="CERTIFICATE" title="Открытые сертификаты" /></div>
  </div>;
}
