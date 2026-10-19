import { StarRating } from "../components/Icon.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import LearningHeader from "../components/training/LearningHeader.jsx";

export default function LearningPath() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const nav = useNavigate();
  useEffect(() => { api("/api/learning-path").then(setData).catch((e) => setError(e.message)); }, []);
  return <section className="learning-path-page learning-forest"><TrainingNavigation fallback="/app" />
    <LearningHeader title="Программа" line="Навык за навыком." description="Последовательная программа: проходите главы и уровни, чтобы закреплять теорию в переговорах." />
    {error ? <p className="product-error" role="alert">{error}</p> : !data ? <p className="product-loading" role="status">Загружаем программу…</p> : !data.chapters.length ? <p className="learning-empty" role="status">Программа пока не содержит глав.</p> : <div className="chapter-cards">{data.chapters.map((chapter) => <article className={`chapter-card glass ${chapter.status}`} key={chapter.id}><div className="path-card-top"><span>Глава {chapter.order}</span><small>{chapter.status === "locked" ? "Закрыта" : chapter.status === "completed" ? "Завершена" : "Доступна"}</small></div><h2>{chapter.title}</h2><p>{chapter.description}</p><div className="chapter-progress"><span>{chapter.progress}/{chapter.total} уровней</span><span>{chapter.status === "completed" ? <StarRating value={chapter.stars} total={5} /> : null}</span></div><button className="primary-button" onClick={() => nav(`/training/path/chapter/${chapter.id}`)} disabled={chapter.status === "locked"}>{chapter.status === "locked" ? `Завершите главу ${chapter.order - 1}` : chapter.progress ? "Открыть главу" : "Начать главу"}</button></article>)}</div>}
  </section>;
}
