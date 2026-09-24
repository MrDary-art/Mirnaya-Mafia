import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";

type Notification={id:string;type:"friend"|"room";title:string;href:string;createdAt:string};
export default function Notifications(){
  const [items,setItems]=useState<Notification[]>([]);
  useEffect(()=>{let live=true;const load=()=>api<Notification[]>("/notifications").then(data=>{if(live)setItems(data)}).catch(()=>{});load();const timer=setInterval(load,15000);return()=>{live=false;clearInterval(timer)}},[]);
  return <section className="detail-panel"><h2>Входящие · {items.length}</h2>{items.length?items.map(item=><Link className="history-item" key={item.id} to={item.href}><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString("ru-RU")}</small></Link>):<p>Новых заявок и приглашений нет.</p>}</section>;
}
