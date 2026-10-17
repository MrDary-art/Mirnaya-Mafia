import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { feedApi } from "../components/feed/feedApi.js";
import { FeedError, FeedIcon, FeedSkeleton } from "../components/feed/FeedPrimitives.jsx";
import PostCard from "../components/feed/PostCard.jsx";
import "../components/feed/feed.css";

export default function PostDetail() {
  const { postId } = useParams(); const [post, setPost] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0); const version = useRef(0);
  useEffect(() => { const current = ++version.current; setLoading(true); setPost(null); setError(""); feedApi.post(postId).then((result) => { if (current === version.current) setPost(result); }).catch((failure) => { if (current === version.current) setError(failure.message); }).finally(() => { if (current === version.current) setLoading(false); }); return () => { version.current += 1; }; }, [postId, retry]);
  return <div className="arena-feed-page arena-feed-detail"><Link className="arena-feed-back" to="/feed"><FeedIcon name="left" size={18} />В сообщество</Link><h1>Публикация</h1>{loading ? <FeedSkeleton /> : error ? <div className="arena-feed-panel"><h2>Публикация недоступна</h2><p className="arena-feed-muted">Возможно, автор удалил запись или изменил круг читателей.</p><FeedError error={error} retry={() => setRetry((value) => value + 1)} /></div> : post && <PostCard post={post} initialComments />}</div>;
}
