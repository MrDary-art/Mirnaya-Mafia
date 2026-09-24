import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api";

type FriendProfile={id:string;email:string;joinedAt:string;missions:number;scenarios:number;rooms:number};
export default function FriendProfile(){
  const {id}=useParams(),[profile,setProfile]=useState<FriendProfile|null>(null),[error,setError]=useState("");
  useEffect(()=>{api<FriendProfile>(`/people/${id}/profile`).then(setProfile).catch(e=>setError(e.message))},[id]);
  return <div className="page narrow"><Link className="back-link" to="/people">← К людям</Link><span className="kicker">ПРОФИЛЬ ДРУГА</span>{error&&<p className="error" role="alert">{error}</p>}{profile&&<><h1>{profile.email}</h1><p>В проекте с {new Date(profile.joinedAt).toLocaleDateString("ru-RU")}</p><div className="stat-grid"><div><span>МИССИИ</span><strong>{profile.missions}</strong></div><div><span>СЦЕНАРИИ</span><strong>{profile.scenarios}</strong></div><div><span>КОМНАТЫ</span><strong>{profile.rooms}</strong></div></div><Link className="button primary" to={`/rooms?invitee=${encodeURIComponent(profile.id)}`}>Пригласить в переговоры</Link></>}</div>;
}
