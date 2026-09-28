import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import { answerQualityLabels } from "../components/answerQuality.js";

const typeLabels = { RECOGNIZE: "Распознайте сигнал", FIND_MISTAKE: "Найдите ошибку", CHOICE: "Выберите ответ", COMPARE: "Сравните подходы", NEXT_MOVE: "Выберите следующий шаг", APPLY: "Примените навык", ASSUMPTION_CHECK: "Проверьте предположение", SUMMARIZE: "Соберите главное", SEQUENCE: "Выстройте последовательность", GUIDED_RESPONSE: "Сформулируйте ответ", COMBINED: "Комплексное задание" };

export default function PathSession() {
  const { attemptId } = useParams(); const nav = useNavigate();
  const [data, setData] = useState(null); const [chapter, setChapter] = useState(null); const [selected, setSelected] = useState(null); const [feedback, setFeedback] = useState(null); const [error, setError] = useState(""); const [sending, setSending] = useState(false);
  useEffect(() => {
    api(`/api/learning-path/attempts/${attemptId}`).then((result) => {
      if (result.status === "completed") { nav(`/training/path/attempt/${attemptId}/report`, { replace: true }); return null; }
      setData(result);
      return api(`/api/learning-path/chapters/${result.level.chapter_id}`);
    }).then((chapterData) => { if (chapterData) setChapter(chapterData.chapter); }).catch((e) => setError(e.message));
  }, [attemptId, nav]);
  if (error && !data) return <section className="path-session"><TrainingNavigation fallback="/training/path" /><div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => nav("/training/path")}>К программе</button></div></section>;
  if (!data) return <p className="text-slate-400">Загружаем упражнение…</p>;
  const index = data.answers.length; const item = data.exercises[index];
  const strongCount = data.answers.filter((answer) => answer.quality === "strong").length;
  const remaining = data.exercises.length - index;
  const submit = async () => { if (!selected) return; setSending(true); setError(""); try { setFeedback(await api(`/api/learning-path/attempts/${attemptId}/answers`, { method: "POST", body: { exercise_id: item.id, option_id: selected.id } })); } catch (e) { setError(e.message); } finally { setSending(false); } };
  const next = () => { if (feedback.finished) nav(`/training/path/attempt/${attemptId}/report`, { replace: true }); else { setData({ ...data, answers: [...data.answers, feedback.answer] }); setSelected(null); setFeedback(null); } };
  return <section className="path-session">
    <TrainingNavigation fallback={`/training/path/chapter/${data.level.chapter_id}`} />
    <div className="session-layout">
      <aside className="session-sidebar glass"><div className="eyebrow">ГЛАВА {data.level.chapter_id.replace("chapter-", "")} · УРОВЕНЬ {data.level.order}</div><h2>{data.level.title}</h2><p className="session-skill">Навык: {data.level.skill}</p><ul className="session-brief-meta"><li><b>{data.exercises.length} задания</b></li><li>Формат: {typeLabels[data.level.exercise_type] || "практическое задание"}</li></ul>{chapter?.story && <div className="session-story"><b>Сюжет главы</b><p>{chapter.story}</p></div>}{chapter?.learning && <div className="session-tip"><b>Цель главы</b><p>{chapter.learning}</p></div>}</aside>
      <div className="session-workspace"><div className="session-head"><span>Задание {index + 1} из {data.exercises.length}</span></div><div className="session-progress"><i style={{ width: `${(index / data.exercises.length) * 100}%` }} /></div><div className="session-stats"><span><b>{index}</b> из {data.exercises.length} пройдено</span><span><b>{strongCount}</b> сильных ходов</span><span><b>{remaining}</b> осталось</span></div>
        <article className="exercise-card glass"><div className="exercise-type">{typeLabels[item.type] || "Задание"}</div>{item.context && <div className="exercise-context"><b>Ситуация</b><p>{item.context}</p></div>}<h1>{item.question}</h1>
          <div className="exercise-options">{item.options.map((option) => {
            const revealed = feedback && selected?.id === option.id;
            return <button type="button" aria-pressed={selected?.id === option.id} disabled={Boolean(feedback) || sending} className={`answer-button ${selected?.id === option.id ? "selected" : ""}${revealed ? ` answer-quality-revealed answer-quality-${feedback.answer.quality}` : ""}`} onClick={() => setSelected(option)} key={option.id}><span>{option.text}</span>{revealed && <span className={`answer-quality-badge answer-quality-${feedback.answer.quality}`}>{answerQualityLabels[feedback.answer.quality]}</span>}</button>;
          })}</div>
          {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
          {feedback ? <div className={`choice-feedback answer-quality-revealed answer-quality-${feedback.answer.quality}`}><b>{answerQualityLabels[feedback.answer.quality]}</b><div className="feedback-section"><strong>Что показывает ответ</strong><p>{feedback.answer.feedback}</p></div>{feedback.answer.quality !== "strong" && feedback.answer.alternative && <p className="feedback-alternative"><b>Более сильный ход:</b> {feedback.answer.alternative}</p>}<button className="primary-button" onClick={next}>{feedback.finished ? "Перейти к отчёту" : "Продолжить"}</button></div> : <button className="primary-button mt-6" aria-busy={sending} disabled={!selected || sending} onClick={submit}>{sending ? "Проверяем…" : "Ответить"}</button>}
        </article>
      </div>
    </div>
  </section>;
}
