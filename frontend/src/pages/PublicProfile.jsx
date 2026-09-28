import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { StarAmount } from "../components/Icon.jsx";
import { ProfilePreview } from "../components/cosmetics/CosmeticVisual.jsx";

export default function PublicProfile() {
  const { username } = useParams();
  const nav = useNavigate();
  const [person, setPerson] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = () => api(`/api/social/people/${username}`).then(setPerson).catch((cause) => setError(cause.message));
  useEffect(() => { load(); }, [username]);
  async function request() {
    try { await api(`/api/social/friends/${person.id}/request`, { method: "POST" }); await load(); }
    catch (cause) { setNotice(cause.message); }
  }
  if (error) return <div className="product-error" role="alert"><p>{error}</p><button onClick={load}>Повторить</button></div>;
  if (!person) return <p className="product-loading" role="status">Загружаем профиль…</p>;
  const name = person.display_name || person.username;
  return <section className="mx-auto max-w-3xl space-y-6">
    <ProfilePreview equipment={person} username={name} level={person.rank} stars={person.stars} userId={person.id} />
    <article className="glass rounded-3xl p-7">
      <div className="eyebrow">ПУБЛИЧНЫЙ ПРОФИЛЬ</div>
      <h1 className="mt-1 text-3xl font-extrabold">{name}</h1>
      <p className="text-lime-200">@{person.username}</p>
      <p className="mt-6 text-slate-300">{person.about || "Пользователь ещё не рассказал о себе."}</p>
      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Card value={person.xp ?? "—"} label="опыт обучения" />
        <Card value={<StarAmount value={person.stars} />} label="звёзды" />
        <Card value={person.sessions_total} label="переговоров" />
      </div>
      <dl className="mt-6 grid gap-2 text-sm text-slate-400"><div>Специализация: <b className="text-slate-200">{person.specialization || "не указана"}</b></div>{person.city && <div>Город: <b className="text-slate-200">{person.city}</b></div>}</dl>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {person.relationship === "NONE" && <button onClick={request} className="primary-button">Добавить друга</button>}
        {person.relationship === "REQUEST_SENT" && <span className="text-slate-400">Заявка отправлена</span>}
        {person.relationship === "REQUEST_RECEIVED" && <button onClick={request} className="primary-button">Принять заявку</button>}
        {person.relationship === "FRIENDS" && <><span className="text-emerald-300">Вы друзья</span><button className="primary-button" onClick={() => nav(`/people?chat=${person.id}`)}>Написать сообщение</button><button className="subtle-button" onClick={() => nav(`/rooms?friend=${person.id}`)}>Пригласить на 1 на 1</button></>}
      </div>
      {notice && <p className="mt-4 text-sm text-lime-200" role="status">{notice}</p>}
    </article>
  </section>;
}

function Card({ value, label }) { return <div className="rounded-2xl bg-white/5 p-4"><b className="block text-xl text-lime-100">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
