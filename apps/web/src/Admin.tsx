import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";

type Overview={counts:{users:number;sessions:number;rooms:number};sessions:{id:string;scenarioId:string;status:string;createdAt:string}[];rooms:{id:string;mode:string;status:string;createdAt:string}[];project:{name:string;brief:string;defaultDifficulty:string}};
export default function Admin(){
  const [data,setData]=useState<Overview|null>(null),[error,setError]=useState("");
  useEffect(()=>{api<Overview>("/admin/overview").then(setData).catch(e=>setError(e.message))},[]);
  return <div className="page"><Link className="back-link" to="/today">← Сегодня</Link><span className="kicker">АДМИНИСТРИРОВАНИЕ</span><h1>Обзор проекта</h1>{error&&<p className="error" role="alert">{error}</p>}{data&&<><div className="detail-panel"><h2>{data.project.name}</h2><p>{data.project.brief}</p><p>Сложность: {data.project.defaultDifficulty}. Настройки определяются содержимым сценария и конфигурацией сервера; изменение через сайт пока не предусмотрено.</p></div><div className="stat-grid"><div><span>АККАУНТЫ</span><strong>{data.counts.users}</strong></div><div><span>ПОПЫТКИ</span><strong>{data.counts.sessions}</strong></div><div><span>КОМНАТЫ</span><strong>{data.counts.rooms}</strong></div></div><div className="report-grid"><section className="report-card"><h2>Последние миссии</h2>{data.sessions.map(item=><p key={item.id}>{item.scenarioId} · {item.status} · {new Date(item.createdAt).toLocaleString("ru-RU")}</p>)}</section><section className="report-card"><h2>Последние комнаты</h2>{data.rooms.map(item=><p key={item.id}>{item.mode} · {item.status} · {new Date(item.createdAt).toLocaleString("ru-RU")}</p>)}</section></div></>}</div>;
}
