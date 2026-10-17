import { Link, useLocation } from "react-router-dom";
import { FeedIcon } from "../feed/FeedPrimitives.jsx";
import { communityHref, communitySection } from "./communityNavigation.js";
import "./community.css";

export default function CommunityTabs({ postsLabel = "Публикации", label = "Разделы сообщества" }) {
  const { search } = useLocation();
  const section = communitySection(search);
  return <nav className="community-tabs" aria-label={label}>{[["posts", postsLabel, "book"], ["friends", "Друзья", "users"], ["messages", "Сообщения", "comment"]].map(([id, title, icon]) => <Link key={id} to={communityHref(id, { search })} aria-current={section === id ? "page" : undefined}><FeedIcon name={icon} size={19} /><span>{title}</span></Link>)}</nav>;
}
