import PageHeader from "../design/PageHeader.jsx";
import { StarRating } from "../components/Icon.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";

export default function LearningPath() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const nav = useNavigate();
  useEffect(() => { api("/api/learning-path").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <section className="learning-path-page"><TrainingNavigation fallback="/app" /><p className="text-rose-300">{error}</p></section>; if (!data) return <p className="text-slate-400">Загружаем программу…</p>;
  return <section className="learning-path-page"><TrainingNavigation fallback="/app" /><PageHeader eyebrow="Тренировка переговоров" title="Последовательная программа" description={`Глав в программе: ${data.chapters.length}. Изучайте навыки по порядку — новые уровни открываются по вашему прогрессу.`}><span className="ui-context-badge">Опыт обучения: {data.xp}</span></PageHeader><div className="chapter-cards">{data.chapters.map((chapter) => <article className={`chapter-card glass ${chapter.status}`} key={chapter.id}><div className="path-card-top"><span>Глава {chapter.order}</span><small>{chapter.status === "locked" ? "Закрыта" : chapter.status === "completed" ? "Завершена" : "Доступна"}</small></div><h2>{chapter.title}</h2><p>{chapter.description}</p><div className="chapter-progress"><span>{chapter.progress}/{chapter.total} уровней</span><span>{chapter.status === "completed" ? <StarRating value={chapter.stars} total={5} /> : null}</span></div><button className="primary-button" onClick={() => nav(`/training/path/chapter/${chapter.id}`)} disabled={chapter.status === "locked"}>{chapter.status === "locked" ? `Завершите главу ${chapter.order - 1}` : chapter.progress ? "Открыть главу" : "Начать главу"}</button></article>)}</div></section>;
}
