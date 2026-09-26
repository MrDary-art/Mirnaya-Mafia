import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";

const qualityMeta = { strong: { title: "Удачное решение" }, acceptable: { title: "Рабочее решение" }, weak: { title: "Есть риск" } };

function keyDifference(feedback) {
  return feedback.split(/[.!?]/)[0].trim() || feedback;
}

export default function PathReview() {
  const { attemptId } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/attempts/${attemptId}/review`).then(setData).catch((e) => setError(e.message)); }, [attemptId]);
  if (error) return <section className="path-review"><TrainingNavigation fallback="/training/path" /><p className="text-rose-300">{error}</p></section>;
  if (!data) return <p className="text-slate-400">Готовим разбор…</p>;
  return <section className="path-review">
    <TrainingNavigation fallback={`/training/path/chapter/${data.level.chapter_id}`} />
    <div className="eyebrow">УЧЕБНЫЙ РАЗБОР</div><h1>{data.level.title}</h1>
    <p className="review-intro">Здесь не просто перечислены ответы: для каждого шага показано, какой принцип вы применили и как усилить ход.</p>
    {data.items.map((item, index) => {
      const answer = item.answer; const meta = qualityMeta[answer.quality] || qualityMeta.weak; const strong = item.options.find((option) => option.quality === "strong");
      return <article className="review-item glass" key={item.id}>
        <div className="review-item-head"><span>ШАГ {index + 1}</span><b className={`review-quality ${answer.quality}`}>{meta.title}</b></div>
        <h2>{item.question}</h2>
        <div className="review-block selected-answer"><b>Ваш ответ</b><p>{answer.text}</p></div>
        <div className="review-block"><b>Логика разбора</b><p>{answer.feedback}</p></div>
        {answer.quality !== "strong" && strong && <div className="review-block recommendation"><b>Ключевое отличие сильного варианта</b><p>{keyDifference(strong.feedback)}</p></div>}
      </article>;
    })}
  </section>;
}
