import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./admin-overview.css";

const labels = {trust:"Доверие", goal:"Цель", control:"Контроль", eq:"EQ"};
export default function AdminMonthlyOverview() {
  const [data,setData]=useState(null),[error,setError]=useState(""),[direction,setDirection]=useState(""),[search,setSearch]=useState("");
  async function load(){try{setData(await api("/api/admin/monthly-overview"));setError("");}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  if(error)return <section className="product-error" role="alert">{error}<button onClick={load}>Повторить загрузку статистики</button></section>;
  if(!data)return <p role="status">Собираем статистику за месяц…</p>;
  const candidates=data.candidates.filter(c=>!direction || c.industry===direction);
  const people=data.users.filter(u=>`${u.name} ${u.username} ${u.specialization || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="monthly-overview">
    <header><div><div className="eyebrow">ПОСЛЕДНИЕ 30 ДНЕЙ</div><h2>Люди и результаты</h2><p>{new Date(data.since).toLocaleDateString("ru-RU")} — {new Date(data.until).toLocaleDateString("ru-RU")}</p></div><button className="subtle-button" onClick={load}>Обновить</button></header>
    <div className="monthly-kpis">{[["Всего пользователей",data.total_users],["Новых за месяц",data.new_users],["С результатами за месяц",data.active_users],["Завершённых попыток",data.completed_attempts],["Созданных встреч",data.bookings],["Отменённых встреч",data.cancelled]].map(([title,value])=><article key={title}><strong>{value}</strong><span>{title}</span></article>)}</div>
    <h3>Средние показатели тренировок</h3><div className="monthly-metrics">{Object.entries(labels).map(([key,label])=><div key={key}><span>{label}</span><b>{data.averages[key] ?? "Нет данных"}</b>{data.averages[key]!=null && <progress max="100" value={data.averages[key]} aria-label={label}/>}</div>)}</div>
    <div className="monthly-heading"><div><h3>Игровые результаты по направлениям</h3><p>Средний игровой балл: 50% цель, 30% доверие, 20% контроль. Задачи и использование помощи могут отличаться; эта таблица не определяет победителя собеседования или уровень специалиста.</p></div><label>Направление<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="">Все направления</option>{[...new Set(data.candidates.map(c=>c.industry))].map(d=><option key={d}>{d}</option>)}</select></label></div>
    <div className="monthly-table"><table><thead><tr><th>Участник / направление</th><th>Средний</th><th>Лучший</th><th>Попыток</th><th>Наименьший игровой показатель</th></tr></thead><tbody>{candidates.map(c=><tr key={`${c.user_id}-${c.industry}`}><td><b>{c.name}</b><small>@{c.username} · {c.industry}</small></td><td>{c.average}/100</td><td>{c.best}</td><td>{c.attempts}</td><td>{labels[c.weakest]} · {c.metrics[c.weakest]}</td></tr>)}</tbody></table>{!candidates.length && <p className="product-empty">Пока нет завершённых тренировок с оценкой в этом направлении.</p>}</div>
    <p className="monthly-note">Это результаты учебных переговоров, а не заключение о профессиональной пригодности. Направление определяется по теме и специализации. Аккаунты demo и администраторов не входят в рейтинг и средние оценки.</p>
    <details><summary>Все пользователи · {data.total_users}</summary><label className="monthly-search">Найти участника<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Имя, логин или специализация"/></label><div className="monthly-table"><table><thead><tr><th>Пользователь</th><th>Специализация</th><th>Оценённых попыток за месяц</th></tr></thead><tbody>{people.map(u=><tr key={u.id}><td><b>{u.name}</b><small>@{u.username}</small></td><td>{u.specialization || "Не указана"}</td><td>{u.sample_account ? "Служебный аккаунт" : u.attempts || "Пока нет результатов"}</td></tr>)}</tbody></table></div></details>
  </section>;
}
