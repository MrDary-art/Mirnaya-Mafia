import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function ChapterSummary() {
  const { chapterId } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState(""); const nav = useNavigate();
  useEffect(() => { api(`/api/learning-path/chapters/${chapterId}/summary`).then(setData).catch((e) => setError(e.message)); }, [chapterId]);
  if (error) return <section className="glass rounded-3xl p-7"><p className="text-rose-300">{error}</p><button className="subtle-button mt-5" onClick={() => nav(`/training/path/chapter/${chapterId}`)}>К главе</button></section>; if (!data) return <p className="text-slate-400">Подводим итоги главы…</p>;
  const nextChapter = chapterId === "chapter-1" ? "chapter-2" : null;
  return <section className="chapter-summary glass"><div className="eyebrow">ГЛАВА ЗАВЕРШЕНА</div><h1>{data.chapter.title}</h1><div className="report-score"><strong>{data.score}%</strong><span>{"★".repeat(data.stars)}{"☆".repeat(5 - data.stars)}</span></div><div className="chapter-levels">{data.levels.map(({ level, score, stars }) => <div key={level.id}><b>{level.order}. {level.title}</b><span>{score}% · {"★".repeat(stars)}{"☆".repeat(3 - stars)}</span></div>)}</div><div className="report-grid"><div><b>Самый сильный навык</b><p>{data.strongest_skill}</p></div><div><b>Стоит закрепить</b><p>{data.weakest_levels.map((item) => item.title).join(" · ")}</p></div></div><p>{data.recommendation}</p><div className="flex flex-wrap gap-3"><button className="primary-button" onClick={() => nav(`/training/path/level/${data.weakest_levels[0].id}`)}>Повторить слабый уровень</button>{nextChapter && <button className="subtle-button" onClick={() => nav(`/training/path/chapter/${nextChapter}`)}>Перейти к главе 2</button>}<button className="subtle-button" onClick={() => nav("/training/path")}>{nextChapter ? "К программе" : "В AI Training"}</button></div></section>;
}
