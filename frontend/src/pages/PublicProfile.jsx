import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { StarAmount } from "../components/Icon.jsx";
import { ProfilePreview } from "../components/cosmetics/CosmeticVisual.jsx";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import ProfileSocialActions from "../components/social/ProfileSocialActions.jsx";
import "./public-profile.css";

export default function PublicProfile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [person, setPerson] = useState(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
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
    setPerson(null); setLoadedUsername(null); setError(""); setBlocked(false); load().catch(() => {});
    return () => { version.current += 1; };
  }, [load]);
  if (loadedUsername !== username) return <p className="product-loading" role="status">Загружаем профиль…</p>;
  if (blocked) return <section className="public-profile-page"><article className="public-profile-state"><h1>Пользователь заблокирован</h1><p>Управлять блокировками можно в разделе друзей.</p><Link className="subtle-button" to="/feed?section=friends">Перейти к друзьям</Link></article></section>;
  if (error) return <div className="product-error" role="alert"><p>{error}</p><button onClick={() => load().catch(() => {})}>Повторить</button></div>;
  if (!person) return <p className="product-loading" role="status">Загружаем профиль…</p>;
  const self = String(person.id) === String(user?.id) || person.username === user?.username;
  const name = person.display_name || person.username;
  return <section className="public-profile-page">
    <article className="public-profile-card">
      <ProfilePreview className="public-profile-hero" equipment={person} username={person.username} displayName={name} level={person.rank} stars={person.stars} userId={person.id} />
      <div className="public-profile-body">
      {person.about && <p className="public-profile-about">{person.about}</p>}
      <div className="public-profile-stats" aria-label="Показатели пользователя">
        <Card value={person.xp ?? "—"} label="опыт обучения" />
        <Card value={<StarAmount value={person.stars} />} label="звёзды" />
        <Card value={person.sessions_total} label="переговоров" />
      </div>
      <dl className="public-profile-details"><div><dt>Специализация</dt><dd>{person.specialization || "Не указана"}</dd></div>{person.city && <div><dt>Город</dt><dd>{person.city}</dd></div>}</dl>
      <div className="public-profile-actions"><ProfileSocialActions key={person.id} person={person} onRefresh={load} onBlocked={() => { version.current += 1; setBlocked(true); setPerson(null); }} /></div>
      </div>
    </article>
    {!self && <ProfileWall key={person.id} userId={person.id} publicView />}
  </section>;
}

function Card({ value, label }) { return <div className="public-profile-stat"><b>{value}</b><span>{label}</span></div>; }
