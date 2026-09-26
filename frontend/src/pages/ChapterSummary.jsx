import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import "./analytics-note.css";

export default function ChapterSummary() {
  const { chapterId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/chapters/${chapterId}/summary`).then(setData).catch((cause) => setError(cause.message)); }, [chapterId]);
  if (error) return <section className="chapter-summary glass"><TrainingNavigation fallback={`/training/path/chapter/${chapterId}`} /><p className="text-rose-300">{error}</p></section>;
  if (!data) return <p className="text-slate-400" role="status">Подводим итоги главы…</p>;
  const nextChapter = data.chapter.order < 10 ? `chapter-${data.chapter.order + 1}` : null;
  const revisit = new Set((data.weakest_levels || []).map((item) => item.id));
  return <main className="analytics-note-page space-y-5"><TrainingNavigation fallback={`/training/path/chapter/${chapterId}`} />
    <header className="analytics-note-hero"><div className="analytics-note-eyebrow">ИТОГ УЧЕБНОЙ ГЛАВЫ</div><h1>{data.chapter.title}</h1><p>Вы завершили {data.levels.length} уровней. Лучше всего в упражнениях этой главы вы справились с навыком «{data.strongest_skill}». Ниже можно открыть конкретные ответы каждого уровня.</p></header>
    <section className="analytics-note-section"><div className="analytics-note-eyebrow">РАЗБОР ПО УРОВНЯМ</div><h2>К каким решениям вернуться</h2><div className="analytics-note-report-list">{data.levels.map(({ level, attempt_id }) => <Link key={level.id} to={`/training/path/attempt/${attempt_id}/report`}><span><strong>{level.order}. {level.title}</strong><small>{revisit.has(level.id) ? "Полезно повторить" : "Разбор ответа"}</small></span><span>Открыть ↗</span></Link>)}</div><p className="mt-6">{data.recommendation}</p></section>
    <div className="flex flex-wrap gap-3">{nextChapter ? <button className="primary-button" onClick={() => nav(`/training/path/chapter/${nextChapter}`)}>Начать следующую главу</button> : <button className="primary-button" onClick={() => nav("/training/path")}>Вернуться к программе</button>}</div>
  </main>;
}
