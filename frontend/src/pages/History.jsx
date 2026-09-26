import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const KIND_LABELS = { negotiation: "Переговоры", course: "Курсы", training: "Тренировка", room: "Встреча 1×1" };

export default function History() {
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState("all");
  const [state, setState] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nav = useNavigate();
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows(await api("/api/history")); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visibleRows = rows.filter((row) => (kind === "all" || row.kind === kind) && (state === "all" || (state === "finished" ? row.finished : !row.finished)));
  function open(row) {
    if (row.room_id) { nav(`/room/${row.room_id}`); return; }
    if (row.kind === "course") return nav(`/learn/${row.program_id}`);
    if (row.kind === "training") return nav(row.finished ? `/training/path/attempt/${row.attempt_id}/report` : row.status === "В процессе" ? `/training/path/attempt/${row.attempt_id}` : `/training/path/level/${row.level_id}`);
    return nav(row.finished || row.processing ? `/report/${row.session_id}` : row.mode === "online" ? `/practice?session=${row.session_id}` : `/play/${row.session_id}`);
  }

  return <section className="history-page">
    <header className="history-hero">
      <div><div className="eyebrow">МОЯ АКТИВНОСТЬ</div><h1>История решений</h1><p>Переговоры, курсы и тренировки — продолжайте незавершённое или возвращайтесь к разбору.</p></div>
    </header>
    <div className="history-toolbar">
      <div role="group" aria-label="Вид активности">
        <Filter active={kind === "all"} onClick={() => setKind("all")}>Всё</Filter>
        <Filter active={kind === "negotiation"} onClick={() => setKind("negotiation")}>Переговоры</Filter>
        <Filter active={kind === "room"} onClick={() => setKind("room")}>Встречи 1×1</Filter>
        <Filter active={kind === "course"} onClick={() => setKind("course")}>Курсы</Filter>
        <Filter active={kind === "training"} onClick={() => setKind("training")}>Тренировка</Filter>
      </div>
      <label>Состояние <select value={state} onChange={(event) => setState(event.target.value)}><option value="all">Все</option><option value="finished">Завершённые</option><option value="unfinished">Незавершённые</option></select></label>
    </div>
    {error && <div className="product-error" role="alert"><p>{error}</p><button className="subtle-button" onClick={load}>Повторить загрузку</button></div>}
    {loading ? <p className="product-loading" role="status">Загружаем историю…</p> : visibleRows.length ? <div className="history-list">{visibleRows.map((row, index) => <button key={row.id} className="history-row" onClick={() => open(row)}>
      <span className="history-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span className="history-row-main"><span className="history-row-kind">{KIND_LABELS[row.kind] || "Активность"} · {row.status}</span><b>{row.title}</b><small>{row.subtitle}</small>{row.verdict && <span className="history-row-verdict">{row.verdict}</span>}</span>
      <span className="history-row-action">{row.finished ? "Открыть разбор" : row.status === "В процессе" ? "Продолжить" : "Открыть"} <span aria-hidden="true">↗</span></span>
    </button>)}</div> : <div className="product-empty"><b>Здесь пока нет записей</b><p>{rows.length ? "Измените фильтры, чтобы увидеть другие события." : "Начните сценарий или тренировку — они появятся здесь."}</p>{rows.length > 0 && <button className="subtle-button" onClick={() => { setKind("all"); setState("all"); }}>Сбросить фильтры</button>}</div>}
  </section>;
}

function Filter({ active, onClick, children }) {
  return <button type="button" aria-pressed={active} onClick={onClick}>{children}</button>;
}
