import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import Icon, { StarRating } from "../components/Icon.jsx";

export default function PathReport() {
  const { attemptId } = useParams(); const nav = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { api(`/api/learning-path/attempts/${attemptId}/report`).then(setData).catch((e) => setError(e.message)); }, [attemptId]);
  if (error) return <section className="path-report glass"><TrainingNavigation fallback="/training/path" /><p className="text-rose-300">{error}</p></section>;
  if (!data) return <p className="text-slate-400">Собираем отчёт…</p>;
  const report = data.report;
  const chapterNumber = Number(data.level.chapter_id.replace("chapter-", ""));
  const nextLevel = data.level.order < 6 ? `chapter-${chapterNumber}-l${data.level.order + 1}` : null;
  const outcome = report.score >= 85
    ? { title: "Навык освоен", text: "Вы уверенно применили ключевой принцип уровня." }
    : report.score >= 70
      ? { title: "Навык в процессе", text: "Основа навыка уже есть — следующий проход поможет сделать ходы точнее." }
      : { title: "Стоит повторить позже", text: "Уровень пройден; разбор ниже подскажет, какой принцип стоит закрепить первым." };
  return <section className="path-report glass">
    <TrainingNavigation fallback={`/training/path/chapter/${data.level.chapter_id}`} />
    <div className="eyebrow">ИТОГ УРОВНЯ</div><h1>{data.level.title}</h1><div className={`report-outcome outcome-${report.stars}`}><b>{outcome.title}</b><p>{outcome.text}</p></div>
    <div className="report-score"><strong>{report.score}%</strong><StarRating value={report.stars} total={3} /></div>
    <div className="report-grid"><div><b>Что получилось</b>{report.what_worked.map((item) => <p className="ui-icon-label" key={item}><Icon name="check" size={16} />{item}</p>)}</div><div><b>Что закрепить</b>{report.what_to_improve.length ? report.what_to_improve.map((item) => <p className="ui-icon-label" key={item}><Icon name="arrow-right" size={16} />{item}</p>) : <p>В этой попытке не было ответов с риском.</p>}</div></div>
    <div className="briefing-goal"><b>Главный учебный вывод</b><p>{report.key_moment.explanation}</p><p className="report-detail"><b>Ориентир:</b> {report.key_moment.alternative}</p></div>
    <div className="report-next"><b>{data.level.transition ? "Разговор продолжается" : "Следующий шаг"}</b><p>{data.level.transition || (nextLevel ? "Продолжите программу: следующий уровень развивает навык в более сложной ситуации." : "Перейдите к итогам главы и выберите навык для дальнейшего закрепления.")}</p></div>
    <div className="flex flex-wrap gap-3"><button className="primary-button" onClick={() => nextLevel ? nav(`/training/path/level/${nextLevel}`) : nav(`/training/path/chapter/${data.level.chapter_id}/summary`)}>{nextLevel ? "Следующий уровень" : "Итоги главы"}</button><button className="subtle-button" onClick={() => nav(`/training/path/attempt/${attemptId}/review`, { state: { returnTo: `/training/path/attempt/${attemptId}/report` } })}>Разбор ответов</button></div>
  </section>;
}
