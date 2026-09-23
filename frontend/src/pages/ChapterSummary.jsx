import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";

export default function ChapterSummary() {
  const { chapterId } = useParams(); const nav = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/chapters/${chapterId}/summary`).then(setData).catch((e) => setError(e.message)); }, [chapterId]);
  if (error) return <section className="chapter-summary glass"><TrainingNavigation fallback={`/training/path/chapter/${chapterId}`} /><p className="text-rose-300">{error}</p></section>;
  if (!data) return <p className="text-slate-400">Подводим итоги главы…</p>;
  const nextChapter = data.chapter.order < 10 ? `chapter-${data.chapter.order + 1}` : null;
  return <section className="chapter-summary glass">
    <TrainingNavigation fallback={`/training/path/chapter/${chapterId}`} />
    <div className="eyebrow">ГЛАВА ЗАВЕРШЕНА</div><h1>{data.chapter.title}</h1>
    <div className="report-score"><strong>{data.score}%</strong><span>{"★".repeat(data.stars)}{"☆".repeat(5 - data.stars)}</span></div>
    <div className="chapter-levels">{data.levels.map(({ level, score, stars }) => <div key={level.id}><b>{level.order}. {level.title}</b><span>{score}% · {"★".repeat(stars)}{"☆".repeat(3 - stars)}</span></div>)}</div>
    <div className="report-grid"><div><b>Самый сильный навык</b><p>{data.strongest_skill}</p></div><div><b>На что обратить внимание</b><p>{data.weakest_levels.map((item) => item.title).join(" · ")}</p></div></div>
    <p>{data.recommendation}</p>
    <div className="flex flex-wrap gap-3">
      {nextChapter ? <button className="primary-button" onClick={() => nav(`/training/path/chapter/${nextChapter}`)}>Начать следующую главу</button> : <button className="primary-button" onClick={() => nav("/training/path")}>Вернуться к программе</button>}
    </div>
  </section>;
}
