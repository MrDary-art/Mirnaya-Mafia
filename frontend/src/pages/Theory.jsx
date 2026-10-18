import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import { answerFeedbackText, answerQualityLabels, theoryAnswerQuality } from "../components/answerQuality.js";
import "./theory.css";

const theoryQualityDescriptions = {
  strong: "Вы выбрали опору, которую можно использовать в разговоре.",
  acceptable: "Логика есть, но перед разговором стоит сверить условия точнее.",
  weak: "Ответ может увести разговор в сторону — посмотрите, какой принцип здесь важен.",
};
const optionLetters = ["А", "Б", "В", "Г", "Д", "Е"];

export function TheoryCatalog() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openingLessonId, setOpeningLessonId] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api("/api/theory").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => { setError(""); api("/api/theory").then(setData).catch((failure) => setError(failure.message)); }}>Повторить загрузку</button></div>;
  if (!data) return <p className="product-loading" role="status">Загружаем уроки…</p>;
  const modules = data.modules || [{ ...data.module, lessons: data.lessons, completed: data.completed, total: data.total }];
  async function openLesson(lesson) {
    setOpeningLessonId(lesson.id); setError("");
    try {
      await api(`/api/theory/${lesson.id}/start`, { method: "POST" });
      nav(`/theory/${lesson.id}`);
    } catch (e) { setError(e.message); } finally { setOpeningLessonId(null); }
  }
  return <section className="theory-catalog"><TrainingNavigation fallback="/training" />
    {data.course && <TheoryCourseResult course={data.course} onPractice={() => nav("/scenarios")} onRepeat={openLesson} />}
    <div className="theory-modules">{modules.map((module) => <TheoryModuleSection key={module.id} module={module} openingLessonId={openingLessonId} onOpen={openLesson} />)}</div>
  </section>;
}

function TheoryModuleSection({ module, onOpen, openingLessonId }) { return <section className="theory-module-section" aria-labelledby={`module-${module.id}`}><header className="theory-module-header"><div className="theory-module-copy"><h2 id={`module-${module.id}`}>{module.title}</h2><p>{module.description}</p></div></header><div className="theory-catalog-list">{module.lessons.map((lesson) => <article key={lesson.id} className={`theory-lesson-card${lesson.unlocked ? "" : " is-locked"}`}><div className="theory-lesson-number">{String(lesson.order).padStart(2, "0")}</div><div className="theory-lesson-summary"><span>УРОК · ~{lesson.duration_minutes} МИН</span><h3>{lesson.title}</h3><p>{lesson.subtitle}</p>{!lesson.unlocked && <small>Откроется после урока {lesson.order - 1}</small>}</div><button className="primary-button" disabled={!lesson.unlocked || openingLessonId !== null} aria-describedby={!lesson.unlocked ? `lock-${lesson.id}` : undefined} onClick={() => onOpen(lesson)}>{openingLessonId === lesson.id ? "Открываем…" : !lesson.unlocked ? "Закрыт" : "Начать"} →</button>{!lesson.unlocked && <span id={`lock-${lesson.id}`} className="sr-only">Сначала завершите предыдущий урок</span>}</article>)}</div></section>; }
function TheoryCourseResult({ course, onPractice, onRepeat }) { return <section className="theory-course-result glass"><div><div className="eyebrow">КУРС ЗАВЕРШЁН</div><h2>Базовый теоретический курс завершён</h2><p>Вы изучили 10 методов. Средний лучший результат: <b>{course.average_score}%</b>.</p></div><div className="theory-course-columns"><CourseList title="Уверенные методы" items={course.strongest} /><CourseList title="Стоит повторить" items={course.to_repeat} action={onRepeat} /></div><div className="mt-5 flex flex-wrap gap-3"><button className="primary-button" onClick={onPractice}>Перейти к сюжетной практике →</button></div></section>; }
function CourseList({ title, items, action }) { return <div><h3>{title}</h3><ul>{items.map((item) => <li key={item.id}>{action ? <button className="subtle-button" onClick={() => action(item)}>{item.title}</button> : <span>{item.title}</span>} <small>{item.score}%</small></li>)}</ul></div>; }

export function TheoryLesson() {
  const { lessonId } = useParams(); const nav = useNavigate();
  const [data, setData] = useState(null); const [step, setStep] = useState(0); const [selected, setSelected] = useState(null); const [answers, setAnswers] = useState({}); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null); setStep(0); setSelected(null); setAnswers({}); setResult(null); setError("");
    api(`/api/theory/${lessonId}`).then((lesson) => {
      if (!active) return;
      setData(lesson); setStep(lesson.progress.current_step); setAnswers(lesson.answered || {});
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [lessonId]);
  function openNextLesson(nextLessonId) { setData(null); setStep(0); setSelected(null); setAnswers({}); setResult(null); setError(""); nav(`/theory/${nextLessonId}`); }
  async function move(next) { setBusy(true); setError(""); try { await api(`/api/theory/${lessonId}/step`, { method: "PUT", body: { current_step: next } }); setStep(next); setSelected(null); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function submit(exercise) { setBusy(true); setError(""); try { const reply = await api(`/api/theory/${lessonId}/practice/${exercise.id}`, { method: "POST", body: { option_id: selected } }); setAnswers((old) => ({ ...old, [exercise.id]: reply })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function finish() { setBusy(true); setError(""); try { const completed = await api(`/api/theory/${lessonId}/complete`, { method: "POST" }); setResult(completed); setStep(completed.progress.current_step); setData((old) => ({ ...old, progress: completed.progress })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  if (error && !data) return <div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => nav("/theory")}>К каталогу</button></div>;
  if (!data) return <p className="product-loading" role="status">Загружаем урок…</p>;
  const mistakesStep = data.sections.length + 1;
  const practiceStart = mistakesStep + 1;
  const practiceEnd = practiceStart + data.practice.length - 1;
  const lessonStep = Math.max(step, 1);
  const exercise = lessonStep >= practiceStart && lessonStep <= practiceEnd ? data.practice[lessonStep - practiceStart] : null;
  const exerciseAnswer = exercise ? answers[exercise.id] : null;
  const exerciseQuality = exerciseAnswer ? theoryAnswerQuality(exerciseAnswer.quality) : null;
  const isResult = Boolean(result) || lessonStep > practiceEnd;
  const resultScore = result?.score ?? data.progress.best_practice_score ?? 0;
  return <section className="theory-lesson"><TrainingNavigation fallback="/theory" /><header className="theory-lesson-head"><div className="eyebrow">УРОК {data.order} · ~{data.duration_minutes} МИН</div><h1 className="mt-2 text-3xl font-extrabold">{data.title}</h1><p className="mt-2 text-slate-400">{data.subtitle}</p><ul className="theory-lesson-objectives">{data.objectives.map((item) => <li key={item}>{item}</li>)}</ul><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Прогресс урока" aria-valuenow={Math.min(100, Math.round(((lessonStep + 1) / (practiceEnd + 2)) * 100))} aria-valuemin={0} aria-valuemax={100}><i className="block h-full bg-lime-300" style={{ width: `${Math.min(100, ((lessonStep + 1) / (practiceEnd + 2)) * 100)}%` }} /></div></header>{error && <p className="mt-4 text-rose-300" role="alert">{error}</p>}
    {lessonStep >= 1 && lessonStep <= data.sections.length && <Card title={data.sections[lessonStep - 1].title}><div className="theory-reading-copy"><p>{data.sections[lessonStep - 1].body}</p></div>{data.sections[lessonStep - 1].callout && <aside className="theory-reading-note theory-reading-note--key"><span>Ключевая мысль</span><p>{data.sections[lessonStep - 1].callout}</p></aside>}{data.sections[lessonStep - 1].example && <aside className="theory-reading-note"><span>Пример</span><p>{data.sections[lessonStep - 1].example}</p></aside>}<Controls step={lessonStep} move={move} busy={busy} /></Card>}
    {lessonStep === mistakesStep && <Card title="Перед практикой"><div className="theory-guide"><section><h3>Чего избегать</h3><ul>{data.mistakes.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>Шпаргалка перед разговором</h3><ul>{data.cheat_sheet.map((item) => <li key={item}>{item}</li>)}</ul></section></div><Visualizations items={data.visualizations} /><Controls step={lessonStep} move={move} label="Перейти к практике" busy={busy} /></Card>}
    {exercise && <Card title={`Практика · вопрос ${lessonStep - practiceStart + 1} из ${data.practice.length}`}><div className="theory-practice-intro"><span>Проверка навыка</span><p>{exerciseAnswer ? "Посмотрите разбор и переходите к следующему вопросу." : "Выберите один вариант — после ответа появится короткий разбор."}</p></div><section className="theory-practice-context" aria-label="Ситуация"><span>Ситуация</span><p>{exercise.context}</p></section><section className="theory-practice-question"><span>Ваше решение</span><h3>{exercise.question}</h3></section>
      <div className="theory-practice-options">{exercise.options.map((option, index) => {
        const revealed = exerciseAnswer?.option_id === option.id;
        const isSelected = selected === option.id || revealed;
        return <button type="button" key={option.id} disabled={Boolean(exerciseAnswer) || busy} aria-pressed={isSelected} onClick={() => setSelected(option.id)} className={`answer-button theory-practice-option ${isSelected ? "selected" : ""}${revealed ? ` answer-quality-revealed answer-quality-${exerciseQuality}` : ""}`}><span className="theory-practice-option-letter" aria-hidden="true">{optionLetters[index] || index + 1}</span><span className="theory-practice-option-text">{option.text}</span>{!revealed && isSelected ? <span className="theory-practice-selected">Выбрано</span> : null}</button>;
      })}</div>
      {exerciseAnswer && <aside className={`choice-feedback theory-practice-feedback answer-quality-revealed answer-quality-${exerciseQuality}`} role="status"><div className="theory-practice-feedback-head"><div><span>Разбор ответа</span><b>{answerQualityLabels[exerciseQuality]}</b></div><span className={`answer-quality-badge answer-quality-${exerciseQuality}`}>{answerQualityLabels[exerciseQuality]}</span></div><p>{answerFeedbackText(exerciseAnswer.feedback)}</p><div className="theory-practice-takeaway"><span>Что запомнить</span><p>{exerciseAnswer.explanation || theoryQualityDescriptions[exerciseQuality]}</p></div></aside>}
      <div className="mt-6 flex items-center justify-between gap-3"><button disabled={busy} className="subtle-button" onClick={() => move(lessonStep - 1)}>Назад</button>{exerciseAnswer ? <button className="primary-button" onClick={() => lessonStep === practiceEnd ? finish() : move(lessonStep + 1)} disabled={busy}>{busy ? "Сохраняем…" : lessonStep === practiceEnd ? "Завершить урок" : "Продолжить"} →</button> : <button disabled={!selected || busy} onClick={() => submit(exercise)} className="primary-button">Проверить ответ</button>}</div>
    </Card>}
    {isResult && <Card title="Урок завершён"><div className="theory-lesson-result"><strong>{resultScore}%</strong><p>Практика завершена. Переходите к следующему уроку, когда будете готовы.</p></div><button className="primary-button mt-6" disabled={busy} onClick={() => result?.next_lesson_id ? openNextLesson(result.next_lesson_id) : nav("/theory")}>{result?.next_lesson_id ? "Следующий урок" : "К урокам"} →</button></Card>}
    <Sources items={data.sources} />
  </section>;
}

function Card({ title, children }) { return <article className="glass mt-6 rounded-3xl p-6 md:p-8"><h2 className="text-2xl font-bold">{title}</h2><div className="mt-4 whitespace-pre-line leading-7 text-slate-300">{children}</div></article>; }
function Controls({ step, move, label = "Далее", busy }) { return <div className="mt-7 flex justify-between"><button className="subtle-button" onClick={() => move(step - 1)} disabled={step <= 1 || busy}>Назад</button><button className="primary-button" onClick={() => move(step + 1)} disabled={busy}>{label} →</button></div>; }
function Sources({ items }) { if (!items?.length) return null; return <details className="theory-sources"><summary><span>Источники урока</span><span className="theory-sources-count">{items.length} материалов</span></summary><ul>{items.map((item) => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer"><span className="theory-source-copy"><strong>{item.title}</strong><span>{item.organization}</span></span><span className="theory-source-link">Открыть</span></a></li>)}</ul></details>; }
function Visualizations({ items }) { if (!items?.length) return null; return <div className="mt-7 grid gap-4">{items.map((item) => <section key={item.title} className="rounded-2xl border border-lime-300/20 bg-lime-300/5 p-4"><b className="text-lime-100">{item.title}</b>{item.type === "range" && <div className="mt-4"><div className="h-3 rounded-full bg-gradient-to-r from-lime-400 via-lime-300 to-lime-400" /><div className="mt-2 flex justify-between gap-3 text-xs text-slate-300"><span>{item.left_label}</span><span>{item.right_label}</span></div></div>}{item.type === "gap" && <div className="mt-4"><div className="h-3 rounded-full bg-slate-600" /><div className="mt-2 flex justify-between gap-3 text-xs text-slate-300"><span>{item.left_label}</span><span>{item.right_label}</span></div></div>}{item.type === "comparison" && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{item.columns.map((column) => <th className="p-2 text-lime-100" key={column}>{column}</th>)}</tr></thead><tbody>{item.rows.map((row, index) => <tr className="border-t border-white/10" key={index}>{row.map((cell) => <td className="p-2" key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>}{item.items && <div className="mt-3 flex flex-wrap gap-2">{item.items.map((value) => <span key={value} className="rounded-full bg-white/10 px-3 py-1 text-sm">{value}</span>)}</div>}<p className="mt-3 text-sm text-slate-400">{item.note}</p></section>)}</div>; }
