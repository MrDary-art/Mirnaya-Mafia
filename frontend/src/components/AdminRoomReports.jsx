import { useEffect, useState } from "react";
import { api } from "../api.js";
import ReportDocument from "./ReportDocument.jsx";

const stateLabels = {ready:"Готов",queued:"В очереди",analyzing:"Анализируется",building_report:"Формируется",failed:"Ошибка анализа",not_requested:"Разбор не запрошен"};

export default function AdminRoomReports({ query }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null);
  const [room, setRoom] = useState(null), [error, setError] = useState("");
  const [page, setPage] = useState(1), [busy, setBusy] = useState(false);
  useEffect(() => { setPage(1); setRoom(null); }, [query]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const params = new URLSearchParams(query); params.set("page", page);
    setError(""); setData(null);
    api(`/api/admin/analytics/rooms?${params}`).then(value => active && setData(value)).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [open, query, page]);
  async function load(id, retry = false) {
    setBusy(true); setError("");
    try {
      if (retry) await api(`/api/admin/analytics/rooms/${id}/retry`, {method:"POST"});
      setRoom(await api(`/api/admin/analytics/rooms/${id}`));
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="ia-panel"><h2>Отчёты встреч 1×1</h2><p>Одна встреча и личные отчёты участников показаны отдельно. Период и организация берутся из фильтров выше; здесь оба формата 1×1.</p>
    <button onClick={() => setOpen(!open)}>{open ? "Скрыть встречи" : "Открыть встречи"}</button>
    {error && <p role="alert">{error}</p>}
    {open && (room ? <div><div className="ia-toolbar"><button onClick={() => setRoom(null)}>← Все встречи</button><button disabled={busy} onClick={() => load(room.id)}>Обновить</button>{(room.report_status === "failed" || room.comparison?.status === "unavailable") && <button disabled={busy} onClick={() => load(room.id,true)}>Повторить анализ</button>}</div><h3>Встреча #{room.id}</h3><p>{stateLabels[room.report_status] || room.status}</p>
      {Object.entries(room.reports).map(([id, report]) => <section key={id}><h3>{room.participants[id] || `Участник ${id}`}</h3><ReportDocument report={report} sessionMeta={{mode:room.mode}} /></section>)}
      {!Object.keys(room.reports).length && <p>Готовых личных отчётов пока нет.</p>}
      {room.comparison && <details><summary>Сохранённое сравнение</summary><p>{room.comparison.summary}</p>{room.comparison.status === "ready" && <p><b>{room.comparison.tie ? "Равный результат" : `Лучше справился: ${room.participants[room.comparison.winner_id] || room.comparison.winner_id}`}</b></p>}{(room.comparison.criteria || []).map(c => <section key={c.id}><h4>{c.label}</h4>{Object.entries(c.candidates || {}).map(([id, v]) => <p key={id}><b>{room.participants[id]} · {v.score}/4</b><br/>«{v.quote}»</p>)}</section>)}</details>}
      <details><summary>Переписка встречи</summary>{room.messages.length ? room.messages.map((m,i) => <p key={i}><b>{room.participants[m.user_id]}:</b> {m.text}</p>) : <p>Текстовых реплик встречи нет. Отдельные интервью доступны в истории личных сессий.</p>}</details>
    </div> : !data ? <p role="status">Загружаем встречи…</p> : <><div className="ia-table"><table><thead><tr>{["Встреча","Формат","Участники","Дата · МСК","Отчёты",""].map((x,i)=><th key={i}>{x}</th>)}</tr></thead><tbody>{data.items.map(r=><tr key={r.id}><td>#{r.id}</td><td>{r.mode === "duel" ? "Два интервью с ИИ" : "Переговоры людей"}</td><td>{r.participants.join(", ")}</td><td>{new Date(r.created_at + "Z").toLocaleString("ru",{timeZone:"Europe/Moscow"})}</td><td>{stateLabels[r.report_status] || r.report_status} · {r.report_count}</td><td><button disabled={busy} onClick={()=>load(r.id)}>Открыть</button></td></tr>)}</tbody></table></div>{!data.items.length && <p>За этот период встреч нет.</p>}<div className="ia-toolbar"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Назад</button><span>Всего: {data.total}</span><button disabled={page*25>=data.total} onClick={()=>setPage(p=>p+1)}>Далее</button></div></>)}
  </section>;
}
