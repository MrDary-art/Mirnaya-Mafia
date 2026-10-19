import { Link, useLocation } from "react-router-dom";
import { FeedIcon } from "../feed/FeedPrimitives.jsx";
import { communityHref, communitySection } from "./communityNavigation.js";
import "./community.css";

export default function CommunityTabs({ base = "/feed", postsLabel = "Публикации", label = "Разделы сообщества" }) {
  const { pathname, search } = useLocation();
  const section = communitySection(search);
  const items = [
    ["posts", postsLabel, "book", communityHref("posts", { base, search })],
    ["messages", "Сообщения", "comment", communityHref("messages", { base, search })],
    ["friends", "Друзья", "users", communityHref("friends", { base, search })],
    ["collections", "Подборки", "bookmark", communityHref("collections", { base, search })],
    ["notifications", "Уведомления", "bell", communityHref("notifications", { base, search })],
  ];
  return <nav className="community-tabs" aria-label={label}>{items.map(([id, title, icon, to]) => {
    const current = section === id && pathname === base;
    return <Link key={id} to={to} aria-current={current ? "page" : undefined}><FeedIcon name={icon} size={19} /><span>{title}</span></Link>;
  })}</nav>;
}
