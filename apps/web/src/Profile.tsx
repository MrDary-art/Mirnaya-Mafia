import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Metrics } from "@arena/contracts";
import { api } from "./api";
import { avatarIcons, type Progression } from "./Shop";
import { readPersonalization } from "./preferences";

type Profile={email:string;joinedAt:string;xp:number;completedMissions:number;distinctScenarios:number;roles:string[];latestMetrics:Metrics|null;latestAt:string|null;completedRooms:number;completedLevels:number};
export default function Profile({userId}:{userId:string}){
  const [profile,setProfile]=useState<Profile|null>(null),[progression,setProgression]=useState<Progression|null>(null),[error,setError]=useState("");
  useEffect(()=>{api<Profile>("/me/profile").then(setProfile).catch(e=>setError(e.message));api<Progression>("/progression").then(setProgression).catch(()=>{});},[]);
  const name=readPersonalization(userId).displayName||profile?.email||"Профиль";
  return <div className={`page profile-theme ${progression?.equipment.theme??"theme_arena"}`}><Link className="back-link" to="/progress">← Прогресс</Link><span className="kicker">ВАШ ПРОФИЛЬ</span><h1>{name}</h1>{error&&<p className="error" role="alert">{error}</p>}{profile&&<><div className="detail-panel"><div className="profile-summary"><span className={`avatar profile-${progression?.equipment.frame??"frame_classic"}`}>{avatarIcons[progression?.equipment.avatar??""]??name[0].toUpperCase()}</span><div><strong>{profile.email}</strong><p>Участник с {new Date(profile.joinedAt).toLocaleDateString("ru-RU")} · {progression?.rank??"Новичок"}</p><p>{profile.xp} XP {progression?.nextRank?`· до «${progression.nextRank.name}» ${Math.max(0,progression.nextRank.xp-profile.xp)} XP`:"· высший ранг"}</p></div></div></div><div className="stat-grid"><div><span>ПРОЙДЕНО МИССИЙ</span><strong>{profile.completedMissions}</strong><small>{profile.distinctScenarios} разных сценариев</small></div><div><span>УЧЕБНЫЕ УРОВНИ</span><strong>{profile.completedLevels}</strong></div><div><span>КОМНАТЫ 1×1</span><strong>{profile.completedRooms}</strong></div><div><span>ОСВОЕННЫЕ РОЛИ</span><strong>{profile.roles.length}</strong><small>{profile.roles.join(", ")||"Пока нет"}</small></div></div>{profile.latestMetrics&&<div className="detail-panel"><h2>Последняя миссия</h2><p>{profile.latestAt&&new Date(profile.latestAt).toLocaleDateString("ru-RU")}</p><p>Доверие {profile.latestMetrics.trust} · Цель {profile.latestMetrics.goal} · Контроль {profile.latestMetrics.control} · EQ {profile.latestMetrics.eq}</p></div>}<p>Имя для интерфейса хранится на этом устройстве в настройках. Публичная анкета и её приватность пока не перенесены.</p><Link className="button secondary" to="/activity">История активности →</Link></>}</div>;
}
