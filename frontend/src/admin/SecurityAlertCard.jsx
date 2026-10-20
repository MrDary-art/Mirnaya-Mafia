import {useEffect, useState} from "react";
import {api} from "../api.js";

const date = value => new Date(value * 1000).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"});

export default function SecurityAlertCard({row, archive, onAcknowledge}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setDetail(null); setError("");
    api(`/api/admin/security/alerts/${row.id}/evidence`)
      .then(value => { if (active) setDetail(value); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [open, row.id, row.last_seen, retry]);
  async function acknowledge() {
    setBusy(true); setError("");
    try { await api(`/api/admin/security/alerts/${row.id}/acknowledge`, {method: "POST"}); onAcknowledge(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <article className={`settings-alert severity-${row.severity}`}>
    <div className="settings-heading"><h3>{row.title || "Событие требует проверки"}</h3><b>{row.severity === "high" ? "Высокий приоритет" : "Проверить"}</b></div>
    <p><strong>Что произошло.</strong> {row.reason}</p>
    <p><strong>Почему появился сигнал.</strong> {row.trigger}</p>
    <p><strong>Что проверить.</strong> {row.recommendation}</p>
    <dl><dt>IP, видимый серверу</dt><dd>{row.ip}</dd><dt>Последний адрес API</dt><dd><code>{row.route}</code></dd>
      <dt>Первое / последнее обнаружение · московское время</dt><dd>{date(row.first_seen)} / {date(row.last_seen)}</dd></dl>
    <div className="settings-actions"><button type="button" aria-expanded={open} aria-controls={`security-evidence-${row.id}`} onClick={() => setOpen(value => !value)}>{open ? "Скрыть запросы" : "Показать запросы"}</button>
      {!archive && <button type="button" disabled={busy} onClick={acknowledge}>{busy ? "Сохраняем…" : "Отметить рассмотренным"}</button>}</div>
    {error && <p role="alert">{error} {open && <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить загрузку</button>}</p>}
    <div id={`security-evidence-${row.id}`} hidden={!open} className="security-evidence">
      {open && !detail && !error && <p role="status">Загружаем выдержку из журнала…</p>}
      {open && detail && <><h4>Запросы, связанные с сигналом №{row.id}</h4><p>{detail.notice}</p>
        <p>Окно · московское время: {date(detail.window_start)} — {date(detail.window_end)}.</p>
        {detail.items.length ? <div className="ia-table"><table><caption>Сохранённые ответы API · новые сверху</caption><thead><tr><th>Время · московское время</th><th>Метод и адрес API</th><th>Ответ сервера</th><th>Запись журнала</th></tr></thead>
          <tbody>{detail.items.map(event => <tr key={event.id}><td>{date(event.created)}</td><td><code>{event.method} {event.route}</code></td><td>{event.status ? `HTTP ${event.status} — ` : ""}{event.result}</td><td>#{event.id}</td></tr>)}</tbody></table></div>
          : <p>Связанные записи в журнале не найдены. Сводный сигнал сохранился, но подробности могли быть удалены или не записаны. По нему нельзя восстановить содержимое запросов.</p>}
        <p>Показано запросов: {detail.items.length}. {detail.truncated && "Выдержка ограничена; это не все события окна."}</p>
      </>}
    </div>
  </article>;
}
