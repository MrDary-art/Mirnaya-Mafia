import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import { answerQualityLabels } from "../components/answerQuality.js";

const typeLabels = { RECOGNIZE: "Распознайте сигнал", FIND_MISTAKE: "Найдите ошибку", CHOICE: "Выберите ответ", COMPARE: "Сравните подходы", NEXT_MOVE: "Выберите следующий шаг", APPLY: "Примените навык", ASSUMPTION_CHECK: "Проверьте предположение", SUMMARIZE: "Соберите главное", SEQUENCE: "Выстройте последовательность", GUIDED_RESPONSE: "Сформулируйте ответ", COMBINED: "Комплексное задание" };

export default function PathSession() {
  const { attemptId } = useParams(); const nav = useNavigate();
  const [data, setData] = useState(null); const [selected, setSelected] = useState(null); const [feedback, setFeedback] = useState(null); const [error, setError] = useState(""); const [sending, setSending] = useState(false);
  useEffect(() => {
    api(`/api/learning-path/attempts/${attemptId}`).then((result) => {
      if (result.status === "completed") { nav(`/training/path/attempt/${attemptId}/report`, { replace: true }); return null; }
      setData(result);
    }).catch((e) => setError(e.message));
  }, [attemptId, nav]);
  if (error && !data) return <section className="path-session"><TrainingNavigation fallback="/training/path" /><div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => nav("/training/path")}>К программе</button></div></section>;
  if (!data) return <p className="text-slate-400">Загружаем упражнение…</p>;
  const index = data.answers.length; const item = data.exercises[index];
  const submit = async () => { if (!selected) return; setSending(true); setError(""); try { setFeedback(await api(`/api/learning-path/attempts/${attemptId}/answers`, { method: "POST", body: { exercise_id: item.id, option_id: selected.id } })); } catch (e) { setError(e.message); } finally { setSending(false); } };
  const next = () => { if (feedback.finished) nav(`/training/path/attempt/${attemptId}/report`, { replace: true }); else { setData({ ...data, answers: [...data.answers, feedback.answer] }); setSelected(null); setFeedback(null); } };
  return <section className="path-session">
    <TrainingNavigation fallback={`/training/path/chapter/${data.level.chapter_id}`} />
    <div className="session-layout">
      <aside className="session-sidebar glass"><div className="eyebrow">ГЛАВА {data.level.chapter_id.replace("chapter-", "")} · УРОВЕНЬ {data.level.order} · ЗАДАНИЕ {index + 1}/{data.exercises.length}</div></aside>
      <div className="session-workspace"><div className="session-head"><span>Задание {index + 1} из {data.exercises.length}</span></div><div className="session-progress"><i style={{ width: `${(index / data.exercises.length) * 100}%` }} /></div>
        <article className="exercise-card glass"><div className="exercise-type">{typeLabels[item.type] || "Задание"}</div>{item.context && <div className="exercise-context"><b>Ситуация</b><p>{item.context}</p></div>}<h1>{item.question}</h1>
          <div className="exercise-options">{item.options.map((option, optionIndex) => {
            const revealed = feedback && selected?.id === option.id;
            return <button type="button" aria-pressed={selected?.id === option.id} disabled={Boolean(feedback) || sending} className={`answer-button ${selected?.id === option.id ? "selected" : ""}${revealed ? ` answer-quality-revealed answer-quality-${feedback.answer.quality}` : ""}`} onClick={() => setSelected(option)} key={option.id}><span className="path-option-index" aria-hidden="true">{optionIndex + 1}</span><span className="path-option-body">{option.text}{revealed && <span className="path-option-feedback" role="status"><b>{answerQualityLabels[feedback.answer.quality]}</b>{feedback.answer.feedback}{feedback.answer.quality !== "strong" && feedback.answer.alternative && <em>Более сильный ход: {feedback.answer.alternative}</em>}</span>}</span></button>;
          })}</div>
          {error && <div className="product-error" role="alert"><p>{error}</p><button onClick={() => setError("")}>Закрыть</button></div>}
          <div className="mt-6 flex items-center justify-between gap-3"><button type="button" className="subtle-button" disabled={sending} onClick={() => nav(`/training/path/chapter/${data.level.chapter_id}`)}>Назад</button>{feedback ? <button type="button" className="primary-button" onClick={next}>{feedback.finished ? "Перейти к отчёту" : "Продолжить"}</button> : <button type="button" className="primary-button" aria-busy={sending} disabled={!selected || sending} onClick={submit}>{sending ? "Проверяем…" : "Ответить"}</button>}</div>
        </article>
      </div>
    </div>
  </section>;
}
