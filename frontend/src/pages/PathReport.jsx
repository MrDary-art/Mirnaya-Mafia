import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import ReportDocument from "../components/ReportDocument.jsx";

export default function PathReport() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/learning-path/attempts/${attemptId}/report`).then((result) => {
      setData(result);
      return api(`/api/learning-path/chapters/${result.level.chapter_id}`).then(setChapter);
    }).catch((cause) => setError(cause.message));
  }, [attemptId]);
  if (error && !data) return <section className="path-report glass"><TrainingNavigation fallback="/training/path" /><div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => nav("/training/path")}>К программе</button></div></section>;
  if (!data) return <p className="product-loading" role="status">Собираем разбор…</p>;
  const report = data.report;
  const nextLevel = chapter?.levels.find((level) => level.order > data.level.order && level.state !== "locked");
  const nextPath = nextLevel ? `/training/path/level/${nextLevel.id}` : chapter?.complete ? `/training/path/chapter/${data.level.chapter_id}/summary` : `/training/path/chapter/${data.level.chapter_id}`;
  const note = {
    scenario_title: data.level.title,
    narrative: {
      status: "Упражнение завершено",
      headline: data.level.title,
      lead: `Вы отработали навык «${report.skill}». Ниже — один выбранный ответ и объяснение, что в нём важно.`,
      takeaway: (report.what_worked || [])[0] || "Посмотрите свой ответ и ориентир для следующей попытки.",
      sections: [{
        id: "exercise", kind: report.what_to_improve?.length ? "improve" : "strength",
        title: report.key_moment.context,
        body: report.key_moment.explanation,
        evidence: { speaker: "Ваш выбор", quote: report.key_moment.selected_answer },
        alternative: report.key_moment.alternative || undefined,
      }],
      next_step: data.level.transition || (nextLevel ? "Перейдите к следующему уровню и примените принцип в более сложной ситуации." : "Откройте разбор всех ответов и выберите один момент для повторения."),
      source: "exercise",
    },
  };
  return <div className="space-y-5"><TrainingNavigation fallback={`/training/path/chapter/${data.level.chapter_id}`} />
    <ReportDocument report={note} onRetry={() => nav(nextPath)} retryLabel="Продолжить обучение" onReturn={() => nav(`/training/path/chapter/${data.level.chapter_id}`)} />
    <button className="subtle-button" onClick={() => nav(`/training/path/attempt/${attemptId}/review`, { state: { returnTo: `/training/path/attempt/${attemptId}/report` } })}>Посмотреть все ответы</button>
    {error && <p className="text-rose-300">Следующий уровень пока недоступен: {error}</p>}
  </div>;
}
