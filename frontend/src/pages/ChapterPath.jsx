import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

const chapterContext = {
  "chapter-1": {
    story: "Вы — Марина, руководитель продуктовой команды. Алексей три года работает в команде и после тяжёлого запуска получил оценку «соответствует ожиданиям», хотя рассчитывал на большее. Пока важно не убеждать его, а понять, что стоит за его реакцией.",
    learning: "Слышать смысл за словами, задавать уточняющие вопросы, отделять позицию от интереса и не переходить к аргументам раньше времени.",
  },
  "chapter-2": {
    story: "Вы уже разобрались, почему оценка стала для Алексея болезненной: речь не только о балле, но и о признании вклада, ясности критериев и перспективе роста. Теперь разговор нужно привести к решению.",
    learning: "Удерживать предмет разговора, исследовать возражения, снижать напряжение, опираться на критерии и завершать понятной договорённостью.",
  },
};

export default function ChapterPath() {
  const { chapterId } = useParams(); const nav = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/chapters/${chapterId}`).then(setData).catch((e) => setError(e.message)); }, [chapterId]);
  if (error) return <section className="glass rounded-3xl p-7"><p className="text-rose-300">{error}</p><button className="subtle-button mt-5" onClick={() => nav("/training/path")}>К программе</button></section>; if (!data) return <p className="text-slate-400">Загружаем главу…</p>;
  const context = chapterContext[chapterId];
  return <section className="learning-path-page"><div className="path-hero glass"><div><div className="eyebrow">ГЛАВА {data.chapter.order}</div><h1>{data.chapter.title}</h1><p>{data.chapter.description}</p></div>{data.complete && <button className="primary-button" onClick={() => nav(`/training/path/chapter/${chapterId}/summary`)}>Итоги главы</button>}</div><div className="chapter-intro"><article className="chapter-info glass"><div className="section-label">История</div><p>{context.story}</p></article><article className="chapter-info glass"><div className="section-label">Чему учит глава</div><p>{context.learning}</p></article></div><p className="chapter-count">{data.levels.filter((level) => level.best_score !== null).length} из 6 уровней</p><div className="path-content"><div className="path-timeline">{data.levels.map((level, index) => <div className="path-step" key={level.id}><div className={`path-line ${index === data.levels.length - 1 ? "last" : ""} ${level.state}`}><span>{level.state === "completed" || level.state === "mastered" ? "✓" : index + 1}</span></div><article className={`path-card ${level.state}`}><div className="path-card-top"><span>Уровень {level.order}</span><small>{level.state === "locked" ? "Закрыт" : level.state === "mastered" ? "Освоен" : level.state === "completed" ? "Пройден" : "Текущий"}</small></div><h2>{level.title}</h2><p>{level.skill}</p><div className="path-card-bottom"><span>{level.difficulty}</span>{level.best_score !== null && <span className="path-stars">{"★".repeat(level.stars)}{"☆".repeat(3 - level.stars)} · {level.best_score}%</span>}</div><button disabled={level.state === "locked"} className="primary-button" onClick={() => nav(`/training/path/level/${level.id}`)}>{level.state === "locked" ? "Сначала предыдущий уровень" : level.best_score !== null ? "Подробнее и повторить" : "Открыть брифинг"}</button></article></div>)}</div></div></section>;
}
