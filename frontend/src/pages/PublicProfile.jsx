import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import { StarAmount } from "../components/Icon.jsx";
import { ProfilePreview } from "../components/cosmetics/CosmeticVisual.jsx";
import ProfileSocialActions from "../components/social/ProfileSocialActions.jsx";

export default function PublicProfile() {
  const { username } = useParams();
  const [person, setPerson] = useState(null);
  const [error, setError] = useState("");
  const [loadedUsername, setLoadedUsername] = useState(null);
  const version = useRef(0);
  const routeIdentity = useRef(username); routeIdentity.current = username;
  const load = useCallback(async () => {
    if (routeIdentity.current !== username) return null;
    const current = ++version.current;
    setError("");
    try { const result = await api(`/api/social/people/${encodeURIComponent(username)}`); if (current === version.current && routeIdentity.current === username) { setPerson(result); setLoadedUsername(username); } return result; }
    catch (cause) { if (current === version.current && routeIdentity.current === username) { setPerson(null); setLoadedUsername(username); setError(cause.message); } throw cause; }
  }, [username]);
  useEffect(() => {
    setPerson(null); setLoadedUsername(null); setError(""); load().catch(() => {});
    return () => { version.current += 1; };
  }, [load]);
  if (loadedUsername !== username) return <p className="product-loading" role="status">Загружаем профиль…</p>;
  if (error) return <div className="product-error" role="alert"><p>{error}</p><button onClick={() => load().catch(() => {})}>Повторить</button></div>;
  if (!person) return <p className="product-loading" role="status">Загружаем профиль…</p>;
  const name = person.display_name || person.username;
  return <section className="mx-auto max-w-3xl space-y-6">
    <ProfilePreview equipment={person} username={name} level={person.rank} stars={person.stars} userId={person.id} />
    <article className="glass rounded-3xl p-7">
      <h1 className="mt-1 text-3xl font-extrabold">{name}</h1>
      <p className="text-lime-200">@{person.username}</p>
      <p className="mt-6 text-slate-300">{person.about || "Пользователь ещё не рассказал о себе."}</p>
      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Card value={person.xp ?? "—"} label="опыт обучения" />
        <Card value={<StarAmount value={person.stars} />} label="звёзды" />
        <Card value={person.sessions_total} label="переговоров" />
      </div>
      <dl className="mt-6 grid gap-2 text-sm text-slate-400"><div>Специализация: <b className="text-slate-200">{person.specialization || "не указана"}</b></div>{person.city && <div>Город: <b className="text-slate-200">{person.city}</b></div>}</dl>
      <div className="mt-6"><ProfileSocialActions key={person.id} person={person} onRefresh={load} /></div>
    </article>
  </section>;
}

function Card({ value, label }) { return <div className="rounded-2xl bg-white/5 p-4"><b className="block text-xl text-lime-100">{value}</b><span className="text-xs text-slate-400">{label}</span></div>; }
