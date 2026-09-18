import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function LearningPath() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const nav = useNavigate();
  useEffect(() => { api("/api/learning-path").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="text-rose-300">{error}</p>; if (!data) return <p className="text-slate-400">Загружаем программу…</p>;
  return <section className="learning-path-page"><div className="path-hero glass"><div><div className="eyebrow">ТРЕНИРОВКА ПЕРЕГОВОРОВ</div><h1>Последовательная программа</h1><p>Две главы: сначала понять собеседника, затем уверенно вести сложный разговор.</p></div><div className="path-xp">{data.xp} XP</div></div><div className="chapter-cards">{data.chapters.map((chapter) => <article className={`chapter-card glass ${chapter.status}`} key={chapter.id}><div className="path-card-top"><span>Глава {chapter.order}</span><small>{chapter.status === "locked" ? "Закрыта" : chapter.status === "completed" ? "Завершена" : "Доступна"}</small></div><h2>{chapter.title}</h2><p>{chapter.description}</p><div className="chapter-progress"><span>{chapter.progress}/{chapter.total} уровней</span><span>{chapter.status === "completed" ? `${"★".repeat(chapter.stars)}${"☆".repeat(5 - chapter.stars)}` : ""}</span></div><button className="primary-button" onClick={() => chapter.status === "completed" ? nav(`/training/path/chapter/${chapter.id}/summary`) : nav(`/training/path/chapter/${chapter.id}`)} disabled={chapter.status === "locked"}>{chapter.status === "locked" ? "Завершите главу 1" : chapter.status === "completed" ? "Итоги" : chapter.progress ? "Продолжить" : "Начать"}</button></article>)}</div></section>;
}
