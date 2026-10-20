import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import PageHeader from "../design/PageHeader.jsx";
import Icon from "../components/Icon.jsx";
import "./admin-dashboard.css";

const bytes = value => value == null ? "—" : `${(value / 1024 ** 3).toLocaleString("ru-RU", {maximumFractionDigits:1})} ГБ`;
const plural = (value, one, few, many) => {
  const remainder = Math.abs(value) % 100;
  const lastDigit = Math.abs(value) % 10;
  return remainder >= 11 && remainder <= 14 ? many : lastDigit === 1 ? one : lastDigit >= 2 && lastDigit <= 4 ? few : many;
};
const uptime = seconds => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return days ? `${days} ${plural(days, "день", "дня", "дней")} ${hours} ${plural(hours, "час", "часа", "часов")}` : `${hours} ${plural(hours, "час", "часа", "часов")} ${minutes} ${plural(minutes, "минута", "минуты", "минут")}`;
};
function Resource({title, value, detail, icon}) {
  const tone = value == null ? "unknown" : value >= 90 ? "danger" : value >= 75 ? "warning" : "normal";
  return <article className={`admin-resource is-${tone}`}><div className="admin-resource-title"><span>{title}</span><Icon name={icon} size={20}/></div><strong>{value == null ? "Нет данных" : `${value.toLocaleString("ru-RU")}%`}</strong>{value != null && <meter aria-label={title} min="0" max="100" value={value}/>}<p>{detail}</p></article>;
}

export default function AdminDashboard() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const active = useRef(false), pending = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { const result = await api("/api/admin/server-status"); if (!result.resources || !result.whisper || !Number.isFinite(result.api_uptime_seconds) || !Number.isFinite(Date.parse(result.checked_at))) throw new Error("Сервер не вернул показатели. Обновите API до текущей версии."); if (active.current) { setData(result); setError(""); } }
    catch (cause) { if (active.current) setError(cause.message); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }, []);
  useEffect(() => { active.current = true; load(); const timer = setInterval(load, 60_000); return () => { active.current = false; clearInterval(timer); }; }, [load]);
  const resources = data?.resources, whisper = data?.whisper;
  const localStates = {ready:"Модель загружена и готова",missing:"Файлы модели не установлены",error:"Ошибка загрузки модели",not_loaded:"Файлы есть, модель не загружена"};
  return <section className="admin-dashboard">
    <PageHeader title="Состояние сервера" description="Текущая нагрузка и готовность распознавания речи." aside={<button type="button" disabled={busy} onClick={load}><Icon name="refresh-cw" size={16}/>{busy ? "Обновляем…" : "Обновить"}</button>}/>
    <div className="admin-monitor-meta"><span className={`admin-status-dot${error ? " is-error" : ""}`}/><span role="status">{error ? "Не удалось обновить показатели" : data ? "API отвечает" : "Получаем показатели…"}</span><span>Обновление раз в минуту</span><span>{data ? `Проверено в ${new Date(data.checked_at).toLocaleTimeString("ru-RU",{timeZone:"Europe/Moscow"})} московское время` : "Первый замер может занять несколько секунд"}</span></div>
    {error && <div role="alert" className="admin-monitor-error"><b>{data ? "Показаны последние полученные данные." : "Данные недоступны."}</b><p>{error}</p><button type="button" disabled={busy} onClick={load}>Повторить</button></div>}
    <div className="admin-resources" aria-busy={busy}>
      <Resource title="Процессор" icon="cpu" value={resources?.cpu_percent} detail="Загрузка CPU за короткий замер"/>
      <Resource title="Оперативная память" icon="memory-stick" value={resources?.memory?.percent} detail={resources?.memory ? `${bytes(resources.memory.used_bytes)} занято из ${bytes(resources.memory.total_bytes)}` : "Ожидаем измерение памяти"}/>
      <Resource title="Диск" icon="hard-drive" value={resources?.disk?.percent} detail={resources?.disk ? `${bytes(resources.disk.used_bytes)} занято из ${bytes(resources.disk.total_bytes)}` : "Раздел, на котором находится база сайта"}/>
    </div>
    {data?.recognition && <section className="admin-service"><header><div><span className="admin-eyebrow">За последние 30 дней</span><h2>Результаты распознавания речи</h2></div><span className="admin-health">{data.recognition.success_percent == null ? "Нет завершённых записей" : `${data.recognition.success_percent}% успешно`}</span></header><div className="admin-queue"><div><strong>{data.recognition.total}</strong><span>Записей</span></div><div><strong>{data.recognition.completed}</strong><span>Обработано</span></div><div><strong>{data.recognition.failed}</strong><span>Ошибок</span></div></div><dl><div><dt>Без речи</dt><dd>{data.recognition.no_speech}</dd></div><div><dt>Среднее время обработки</dt><dd>{data.recognition.mean_seconds == null ? "Нет измерений" : `${data.recognition.mean_seconds.toFixed(1)} с`}</dd></div></dl></section>}
    <div className="admin-service-grid"><section className="admin-service"><header><div><span className="admin-eyebrow">Распознавание речи</span><h2>Whisper</h2></div><span className={`admin-health ${!whisper ? "is-unknown" : whisper.ready ? "is-ready" : "is-warning"}`}>{!whisper ? "Проверяем" : whisper.ready ? "Готов" : "Требует внимания"}</span></header>
      <dl><div><dt>Режим работы</dt><dd>{{local:"Локальный сервер",remote:"Внешний сервер",auto:"Внешний с локальным резервом"}[whisper?.policy] || "—"}</dd></div><div><dt>Локальная модель</dt><dd>{whisper?.local_model || "—"}</dd></div><div><dt>Состояние модели</dt><dd>{localStates[whisper?.local_state] || "—"}</dd></div><div><dt>Внешние серверы готовы</dt><dd>{whisper ? `${whisper.remote_ready} из ${whisper.remote_total}` : "—"}</dd></div></dl>
      <div className="admin-queue"><div><strong>{whisper?.queued ?? "—"}</strong><span>В очереди</span></div><div><strong>{whisper?.running ?? "—"}</strong><span>В обработке</span></div><div><strong>{whisper?.local_tasks ?? "—"}</strong><span>Локальных задач</span></div></div><Link className="subtle-button" to="/admin/settings" target="_blank" rel="noopener">Открыть настройки речи<Icon name="arrow-up-right" size={15}/></Link></section>
      <section className="admin-service"><header><div><span className="admin-eyebrow">Работа установки</span><h2>Сервер приложения</h2></div><Icon name="server" size={24}/></header><dl><div><dt>API</dt><dd>{error ? "Связь потеряна" : data ? "Доступен" : "Проверяем"}</dd></div><div><dt>Время работы API</dt><dd>{data ? uptime(data.api_uptime_seconds) : "—"}</dd></div><div><dt>Интервал обновления</dt><dd>60 секунд</dd></div></dl><p>CPU и память относятся к операционной системе, доступной процессу API. В контейнере эти значения могут отражать ресурсы хоста. Диск — раздел с базой данных сайта.</p><p>Готовность Whisper определяется состоянием модели и связью с внешними серверами. Процент выполнения отдельной записи движок не сообщает.</p></section></div>
  </section>;
}
