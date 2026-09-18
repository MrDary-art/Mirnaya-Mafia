import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";

export default function PublicProfile() {
  const { username } = useParams(); const [person, setPerson] = useState(null);
  const load = () => api(`/api/social/people/${username}`).then(setPerson).catch((error) => alert(error.message));
  useEffect(() => { load(); }, [username]);
  async function request() { try { await api(`/api/social/friends/${person.id}/request`, { method: "POST" }); await load(); } catch (error) { alert(error.message); } }
  if (!person) return <p className="text-slate-400">Загружаем профиль…</p>;
  return <section className="mx-auto max-w-3xl space-y-6"><article className="glass rounded-3xl p-7"><div className="flex items-center gap-5"><div className="profile-avatar">{(person.display_name || person.username).slice(0, 2).toUpperCase()}<span>{person.rank}</span></div><div><div className="eyebrow">ПУБЛИЧНЫЙ ПРОФИЛЬ</div><h1 className="mt-1 text-3xl font-extrabold">{person.display_name || person.username}</h1><p className="text-cyan-200">@{person.username}</p><p className="mt-2 text-slate-400">{person.title} · {person.rank_name}</p></div></div><p className="mt-6 text-slate-300">{person.about || "Пользователь ещё не рассказал о себе."}</p><div className="mt-6 grid grid-cols-3 gap-3 text-center"><Card value={person.xp} label="опыт обучения"/><Card value={`★ ${person.stars}`} label="звёзды"/><Card value={person.sessions_total} label="переговоров"/></div><dl className="mt-6 grid gap-2 text-sm text-slate-400"><div>Специализация: <b className="text-slate-200">{person.specialization || "не указана"}</b></div>{person.city && <div>Город: <b className="text-slate-200">{person.city}</b></div>}{person.organization && <div>Организация: <b className="text-slate-200">{person.organization}</b></div>}</dl><div className="mt-6">{person.relationship === "NONE" && <button onClick={request} className="primary-button">Добавить друга</button>}{person.relationship === "REQUEST_SENT" && <span className="text-slate-400">Заявка отправлена</span>}{person.relationship === "FRIENDS" && <span className="text-emerald-300">Вы друзья</span>}</div></article></section>;
}
function Card({ value, label }) { return <div className="rounded-2xl bg-white/5 p-4"><b className="block text-xl text-cyan-100">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
