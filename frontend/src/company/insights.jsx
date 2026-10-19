import { lazy, Suspense, useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice } from "./shared.jsx";
import { AssignmentCard } from "./learning.jsx";
import { Calendar } from "./engagement.jsx";


const ratingDimensions = [
  ["trust", "Доверие"],
  ["goal", "Цель"],
  ["control", "Контроль"],
  ["eq", "Эмпатия"],
];

function RatingMethod({ value }) {
  return <section className="business-rating-method" aria-label="Как формируется рейтинг">
    <div className="business-rating-method-copy">
      <span>Как формируется рейтинг</span>
      <h3>Лучший итоговый балл за завершённую практику</h3>
      <p>{value.methodology || "Для места в рейтинге выбирается лучший результат каждого сотрудника по шкале от 0 до 100."}</p>
    </div>
    <div className="business-rating-principles">
      <div><b>1 результат</b><span>выбирается для места</span></div>
      <div><b>0–100 баллов</b><span>единая шкала сравнения</span></div>
      <div><b>4 показателя</b><span>раскрывают профиль практики</span></div>
    </div>
    <p className="business-rating-method-note">Параметры в строке показывают результат практики, которая сформировала место. Они помогают понять сильные стороны, но отдельно место не меняют.</p>
  </section>;
}

export function Ratings({ data }) {
  const [value, setValue] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api(`/api/company/${data.company.id}/ratings`).then(setValue).catch(e => setError(e.message)); }, [data.company.id]);
  if (!value) return <Loader error={error} />;
  if (!value.enabled) return <Empty>{value.reason}</Empty>;
  if (!data.permissions.manage_team) return <section className="business-ratings">
    <div className="business-ratings-heading"><h2>{ru("moya pozitsiya")}</h2><p>Сравнение строится только по завершённым корпоративным практикам.</p></div>
    <RatingMethod value={value} />
    <div className="business-rating-personal-stats">{[[ru("mesto"), value.my_place], [ru("rezultat"), value.my_score == null ? "—" : `${value.my_score}/100`], [ru("protsentil"), value.percentile == null ? "—" : `${value.percentile}%`]].map(([label, score]) => <article key={label}><span>{label}</span><b>{score}</b></article>)}</div>
  </section>;
  return <section className="business-ratings">
    <div className="business-ratings-heading"><div><h2>{ru("reiting kompanii")}</h2><p>{value.participants} {value.participants === 1 ? "сотрудник" : "сотрудников"} с завершёнными практиками</p></div><span className="business-rating-scale">Шкала 0–100</span></div>
    <RatingMethod value={value} />
    <div className="business-rating-list">{value.ratings.map(person => <article key={person.membership_id} className="business-rating-row">
      <div className="business-rating-person"><span className="business-rating-place">#{person.position}</span><div><b>{person.name}</b><p>{person.assignment_title || "Завершённая практика"}{person.completed_at ? ` · ${formatDate(person.completed_at)}` : ""}</p></div></div>
      <div className="business-rating-parameters" aria-label={`Показатели ${person.name}`}>{ratingDimensions.map(([key, label]) => <span key={key}><small>{label}</small><b>{person.metrics?.[key] ?? "—"}</b></span>)}</div>
      <strong className="business-rating-score">{person.score}<small>/100</small></strong>
    </article>)}</div>
  </section>;
}



const AnalyticsModule = lazy(() => import("./analytics.jsx").then(module => ({ default: module.Analytics })));
export function Analytics(props) { return <Suspense fallback={<Loader />}><AnalyticsModule {...props} /></Suspense>; }

export { ManagerOverview } from "./overview.jsx";

export { MyResults } from "./results.jsx";
