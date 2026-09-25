import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";

export default function PathReport() {
  const { attemptId } = useParams(); const nav = useNavigate(); const [data, setData] = useState(null); const [chapter, setChapter] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/attempts/${attemptId}/report`).then((result) => { setData(result); return api(`/api/learning-path/chapters/${result.level.chapter_id}`).then(setChapter); }).catch((e) => setError(e.message)); }, [attemptId]);
  if (error && !data) return <section className="path-report glass"><TrainingNavigation fallback="/training/path" /><div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={() => nav("/training/path")}>К программе</button></div></section>;
  if (!data) return <p className="product-loading" role="status">Собираем отчёт…</p>;
  const report = data.report;
  const nextLevel = chapter?.levels.find((level) => level.order > data.level.order && level.state !== "locked");
  const outcome = report.score >= 85
    ? { title: "Навык освоен", text: "Вы уверенно применили ключевой принцип уровня." }
    : report.score >= 70
      ? { title: "Навык в процессе", text: "Основа навыка уже есть — следующий проход поможет сделать ходы точнее." }
      : { title: "Стоит повторить позже", text: "Уровень пройден; разбор ниже подскажет, какой принцип стоит закрепить первым." };
  return <section className="path-report glass">
    <TrainingNavigation fallback={`/training/path/chapter/${data.level.chapter_id}`} />
    <div className="eyebrow">ИТОГ УРОВНЯ</div><h1>{data.level.title}</h1>{error && <div className="product-error" role="alert"><p>Следующий шаг пока недоступен: {error}</p><button onClick={() => setError("")}>Закрыть</button></div>}<div className={`report-outcome outcome-${report.stars}`}><b>{outcome.title}</b><p>{outcome.text}</p></div>
    <div className="report-score"><strong>{report.score}%</strong><span>{"★".repeat(report.stars)}{"☆".repeat(3 - report.stars)}</span></div>
    <div className="report-grid"><div><b>Что получилось</b>{report.what_worked.map((item) => <p key={item}>✓ {item}</p>)}</div><div><b>Что закрепить</b>{report.what_to_improve.length ? report.what_to_improve.map((item) => <p key={item}>→ {item}</p>) : <p>В этой попытке не было ответов с риском.</p>}</div></div>
    <div className="briefing-goal"><b>Главный учебный вывод</b><p>{report.key_moment.explanation}</p>{report.key_moment.alternative && <p className="report-detail"><b>Ориентир:</b> {report.key_moment.alternative}</p>}</div>
    <div className="report-next"><b>{data.level.transition ? "Разговор продолжается" : "Следующий шаг"}</b><p>{data.level.transition || (nextLevel ? "Продолжите программу: следующий уровень развивает навык в более сложной ситуации." : chapter?.complete ? "Перейдите к итогам главы и выберите навык для дальнейшего закрепления." : "Вернитесь к программе и выберите доступный уровень.")}</p></div>
    <div className="flex flex-wrap gap-3"><button className="primary-button" onClick={() => nextLevel ? nav(`/training/path/level/${nextLevel.id}`) : nav(chapter?.complete ? `/training/path/chapter/${data.level.chapter_id}/summary` : `/training/path/chapter/${data.level.chapter_id}`)}>{nextLevel ? "Следующий уровень" : chapter?.complete ? "Итоги главы" : "К главе"}</button><button className="subtle-button" onClick={() => nav(`/training/path/attempt/${attemptId}/review`, { state: { returnTo: `/training/path/attempt/${attemptId}/report` } })}>Разбор ответов</button></div>
  </section>;
}
