import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";

type Daily={date:string;scenario:{id:string;title:string};completed:boolean;rewardStars:number;streak:number};
export default function DailyChallenge(){
  const [daily,setDaily]=useState<Daily|null>(null);
  useEffect(()=>{api<Daily>("/me/daily").then(setDaily).catch(()=>{});},[]);
  if(!daily)return null;
  return <section className="detail-panel daily-challenge"><span className="kicker">ЕЖЕДНЕВНОЕ ИСПЫТАНИЕ · {daily.date} МСК</span><h2>{daily.scenario.title}</h2><p>{daily.completed?"Испытание выполнено. Награда за этот день уже начислена.":`Пройдите эту локальную миссию сегодня и получите ${daily.rewardStars} звезды. Повторное прохождение награду не увеличит.`}</p><p>Серия дней: {daily.streak}</p><Link className="button secondary" to={`/missions/${daily.scenario.id}`}>{daily.completed?"Повторить без награды":"Начать испытание"} →</Link></section>;
}
