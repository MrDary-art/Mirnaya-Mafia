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
import "./community-forest.css";

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
  const showCommunitySide = !companyId && !userId;
  const [created, setCreated] = useState(null);
  const prefill = useMemo(() => params.get("attach") && params.get("id") ? { kind: params.get("attach"), id: params.get("id") } : null, [params.get("attach"), params.get("id")]);

  function publish(post) {
    setCreated(post);
    if (prefill) { const next = new URLSearchParams(params); next.delete("attach"); next.delete("id"); setParams(next, { replace: true }); }
  }
  function focusComposer() { document.querySelector(".arena-feed-center textarea[aria-label='Текст публикации']")?.focus(); }
  const streamTitle = userId ? userId === user?.id ? "Мои публикации" : "Публикации автора" : companyId ? "Новости компании" : SCOPE_LABELS[scope];

  return <div className="arena-feed-page community-forest" data-community-section={section}>
    {section === "posts" && <header className="arena-feed-page-header community-hero">
      <div className="community-hero-copy"><h1>Сообщество</h1><p className="community-hero-line">Разговор продолжается.</p><p className="community-hero-description">Делитесь опытом и находите единомышленников.</p></div>
      <button type="button" className="community-write" onClick={focusComposer}><FeedIcon name="edit" size={18} />Написать публикацию</button>
    </header>}
    <CommunityTabs />
    {section !== "posts" ? <Suspense fallback={<p className="community-loading" role="status">Загружаем раздел…</p>}>{section === "collections" ? <Collections embedded /> : section === "notifications" ? <SocialNotifications embedded /> : <FriendsWorkspace section={section} />}</Suspense> : <>
      <div className={`arena-feed-layout community-layout${showCommunitySide ? " has-sidebar" : ""}`}>
        {showCommunitySide && <aside className="arena-feed-side community-side" aria-label="Истории и ваша активность">
          <StoriesBar />
          {user?.id && <section className="community-connections"><header><h2>Ваш круг общения</h2><Link to="/profile" aria-label="Открыть свой профиль"><FeedIcon name="right" size={20} /></Link></header><ProfileWall userId={user.id} isSelf summaryOnly /></section>}
        </aside>}
        <main className="arena-feed-center"><PostComposer onCreated={publish} prefill={prefill} /><div className="arena-feed-stream-toolbar"><h2>{streamTitle}</h2></div><PostStream scope={scope} userId={userId} companyId={companyId} created={created} emptyTitle={scope === "following" ? "Найдите своих авторов" : scope === "friends" ? "Друзья ещё не опубликовали записи" : undefined} emptyText={scope === "following" ? "Подпишитесь на интересных людей или компании. Их публикации будут появляться здесь." : undefined} emptyAction={scope === "following" || scope === "friends" ? <Link className="arena-feed-button" to="/people">Найти людей<FeedIcon name="users" size={17} /></Link> : <button className="arena-feed-button" type="button" onClick={focusComposer}>Написать публикацию</button>} /></main>
      </div>
    </>}
  </div>;
}
