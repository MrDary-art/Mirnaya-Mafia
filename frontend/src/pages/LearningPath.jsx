import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import { StarRating } from "../components/Icon.jsx";

export default function LearningPath() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const nav = useNavigate();
  useEffect(() => { api("/api/learning-path").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <section className="learning-path-page"><TrainingNavigation fallback="/" /><p className="text-rose-300">{error}</p></section>; if (!data) return <p className="text-slate-400">Загружаем программу…</p>;
  return <section className="learning-path-page"><TrainingNavigation fallback="/" /><div className="path-hero glass"><div><div className="eyebrow">ТРЕНИРОВКА ПЕРЕГОВОРОВ</div><h1>Последовательная программа</h1><p>Десять глав: от понимания собеседника до сложных переговоров о цене, границах, ресурсах и договорённостях.</p></div><div className="path-xp">Опыт обучения: {data.xp}</div></div><div className="chapter-cards">{data.chapters.map((chapter) => <article className={`chapter-card glass ${chapter.status}`} key={chapter.id}><div className="path-card-top"><span>Глава {chapter.order}</span><small>{chapter.status === "locked" ? "Закрыта" : chapter.status === "completed" ? "Завершена" : "Доступна"}</small></div><h2>{chapter.title}</h2><p>{chapter.description}</p><div className="chapter-progress"><span>{chapter.progress}/{chapter.total} уровней</span><span>{chapter.status === "completed" ? <StarRating value={chapter.stars} /> : null}</span></div><button className="primary-button" onClick={() => nav(`/training/path/chapter/${chapter.id}`)} disabled={chapter.status === "locked"}>{chapter.status === "locked" ? `Завершите главу ${chapter.order - 1}` : chapter.progress ? "Открыть главу" : "Начать главу"}</button></article>)}</div></section>;
}
