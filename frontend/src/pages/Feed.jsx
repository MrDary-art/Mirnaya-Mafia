import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { FeedIcon } from "../components/feed/FeedPrimitives.jsx";
import PostComposer from "../components/feed/PostComposer.jsx";
import PostStream from "../components/feed/PostStream.jsx";
import StoriesBar from "../components/feed/StoriesBar.jsx";
import ProfileWall from "../components/feed/ProfileWall.jsx";
import CommunityTabs from "../components/social/CommunityTabs.jsx";
import "../components/feed/feed.css";

const FriendsWorkspace = lazy(() => import("../components/social/FriendsWorkspace.jsx"));
const Collections = lazy(() => import("./Collections.jsx"));
const SocialNotifications = lazy(() => import("./SocialNotifications.jsx"));
const SCOPE_LABELS = { for_you: "Публикации", following: "Подписки", friends: "Друзья", popular: "Популярное", companies: "Компании" };

export default function Feed() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const section = ["friends", "messages", "collections", "notifications"].includes(params.get("section")) ? params.get("section") : "posts";
  const requestedScope = params.get("scope") === "company" ? "companies" : params.get("scope");
  const scope = requestedScope in SCOPE_LABELS ? requestedScope : "for_you";
  const companyId = Number(params.get("company_id")) || null;
  const userId = Number(params.get("user_id")) || null;
  const [created, setCreated] = useState(null);
  const prefill = useMemo(() => params.get("attach") && params.get("id") ? { kind: params.get("attach"), id: params.get("id") } : null, [params.get("attach"), params.get("id")]);

  function publish(post) {
    setCreated(post);
    if (prefill) { const next = new URLSearchParams(params); next.delete("attach"); next.delete("id"); setParams(next, { replace: true }); }
  }
  function focusComposer() { document.querySelector(".arena-feed-center textarea[aria-label='Текст публикации']")?.focus(); }
  const streamTitle = userId ? userId === user?.id ? "Мои публикации" : "Публикации автора" : companyId ? "Новости компании" : SCOPE_LABELS[scope];

  return <div className="arena-feed-page">
    {section === "posts" && <header className="arena-feed-page-header"><div><h1>Сообщество</h1></div></header>}
    <CommunityTabs />
    {section !== "posts" ? <Suspense fallback={<p className="community-loading" role="status">Загружаем раздел…</p>}>{section === "collections" ? <Collections embedded /> : section === "notifications" ? <SocialNotifications embedded /> : <FriendsWorkspace section={section} />}</Suspense> : <>
      {user?.id && !companyId && !userId && <ProfileWall userId={user.id} isSelf summaryOnly />}
      <div className="arena-feed-layout">
        <main className="arena-feed-center">{!companyId && !userId && <StoriesBar />}<PostComposer onCreated={publish} prefill={prefill} /><div className="arena-feed-stream-toolbar"><h2>{streamTitle}</h2></div><PostStream scope={scope} userId={userId} companyId={companyId} created={created} emptyTitle={scope === "following" ? "Найдите своих авторов" : scope === "friends" ? "Друзья ещё не опубликовали записи" : undefined} emptyText={scope === "following" ? "Подпишитесь на интересных людей или компании. Их публикации будут появляться здесь." : undefined} emptyAction={scope === "following" || scope === "friends" ? <Link className="arena-feed-button" to="/people">Найти людей<FeedIcon name="users" size={17} /></Link> : <button className="arena-feed-button" type="button" onClick={focusComposer}>Написать публикацию</button>} /></main>
      </div>
    </>}
  </div>;
}
