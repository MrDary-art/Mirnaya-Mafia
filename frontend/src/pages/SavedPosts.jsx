import { Link } from "react-router-dom";
import { FeedIcon } from "../components/feed/FeedPrimitives.jsx";
import PostStream from "../components/feed/PostStream.jsx";
import "../components/feed/feed.css";

export default function SavedPosts() {
  return <div className="arena-feed-page arena-feed-saved"><header className="arena-feed-page-header"><div><h1>Сохранённое</h1><p>Полезное не должно теряться. Этот список виден только вам.</p></div><Link className="arena-feed-button" to="/collections"><FeedIcon name="book" size={19} />Мои подборки</Link></header><div className="arena-feed-saved-body"><Link className="arena-feed-back" to="/feed"><FeedIcon name="left" size={18} />В ленту</Link><PostStream saved emptyTitle="Соберите свою библиотеку опыта" emptyText="Нажмите на закладку под публикацией. Позже вы сможете добавить её в одну или несколько подборок." emptyAction={<Link className="arena-feed-button is-primary" to="/feed">Найти полезное <FeedIcon name="right" size={18} /></Link>} /></div></div>;
}
