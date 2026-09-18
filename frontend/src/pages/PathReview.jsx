import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function PathReview() {
  const { attemptId } = useParams(); const nav = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/attempts/${attemptId}/review`).then(setData).catch((e) => setError(e.message)); }, [attemptId]);
  if (error) return <p className="text-rose-300">{error}</p>; if (!data) return <p className="text-slate-400">Загружаем разбор…</p>;
  return <section className="path-review"><div className="eyebrow">РАЗБОР ОТВЕТОВ</div><h1>{data.level.title}</h1>{data.items.map((item, index) => <article className="review-item glass" key={item.id}><span>Упражнение {index + 1}</span><h2>{item.question}</h2><p className={`review-quality ${item.answer.quality}`}>{item.answer.quality === "strong" ? "Сильный ход" : item.answer.quality === "acceptable" ? "Рабочий вариант" : "Есть риск"}</p><p>{item.answer.feedback}</p></article>)}<button className="primary-button" onClick={() => nav("/training/path")}>Вернуться к пути</button></section>;
}
