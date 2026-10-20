import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import "./council-flow.css";

export default function CouncilLaunch({ data, reload }) {
  const navigate = useNavigate();
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [now,setNow] = useState(Date.now());
  useEffect(() => {const timer=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(timer);},[]);
  const ended=["finished","cancelled"].includes(data.status);
  const participant=["confirmed","facilitator"].includes(data.my_status);
  const opens=new Date(data.scheduled_at).getTime()-15*60000;
  const atTime=now>=new Date(data.scheduled_at).getTime();
  const expired=Boolean(data.reserved_until && now>=new Date(data.reserved_until).getTime());
  const canEnter=participant && !ended && !expired && now>=opens && ["roles","preparation","active"].includes(data.status);
  const unready=(data.team || []).filter(person=>person.status==="confirmed" && !person.ready);
  const start=data.can_manage && data.status!=="active";
  const canStart=canEnter && atTime && (data.preparation_call || unready.length===0 && data.confirmed===data.capacity);
  const report=data.business_meeting_id && data.company_id ? `/business/${data.company_id}/meetings?meeting=${data.business_meeting_id}` : null;
  async function enter() {
    setBusy(true);setError("");
    try {
      if(start) await api(`/api/council/${data.id}/start`,{method:"POST",body:{}});
      navigate(`/council/${data.id}/call`);
    } catch(cause) {setError(cause.message);await reload?.();}
    finally {setBusy(false);}
  }
  const heading=ended ? data.status==="cancelled" ? "Встреча отменена" : "Разговор завершён" : data.status==="active" ? "Команда уже в комнате" : start ? "Начните встречу здесь" : "Ваша комната встречи";
  const copy=ended ? "Записи обрабатываются автоматически. В материалах встречи можно проверить решения, задачи и расшифровку." : start ? data.preparation_call ? "Нажмите кнопку, проверьте микрофон и камеру — и начинайте разговор. Подтверждать игровые роли для рабочей встречи не нужно." : "Участники принимают приглашение, читают свои роли и отмечают готовность. Когда все готовы, начните звонок." : "При входе вы сможете включить или выключить микрофон и камеру. Устройства можно изменить и во время разговора.";
  let reason="";
  if(!ended && !participant) reason="Сначала примите приглашение на этой странице.";
  else if(!ended && expired) reason="Время комнаты истекло. Обновите страницу, чтобы открыть итог.";
  else if(!ended && now<opens) reason="Вход откроется за 15 минут до назначенного времени.";
  else if(start && !atTime) reason="Начать встречу можно в назначенное время. Участники пока могут подготовиться.";
  else if(start && !data.preparation_call && !canStart) reason=`Ожидаем готовности команды: ${data.team?.filter(person=>person.ready).length || 0} из ${data.capacity}.`;
  return <section className="council-launch" aria-label="Вход во встречу"><div><h2>{heading}</h2><p>{copy}</p>{error && <p role="alert">{error}</p>}</div><div className="council-launch-action">{ended ? report && data.status!=="cancelled" && <Link className="council-button" to={report}>Отчёт и материалы</Link> : <button className="council-button" disabled={busy || (start ? !canStart : !canEnter)} onClick={enter}>{busy ? "Открываем…" : start ? "Начать встречу" : "Войти в звонок"}</button>}{reason && <small role="status">{reason}</small>}{!ended && participant && !reason && <small>Выход руководителя завершит звонок для всех.</small>}</div></section>;
}
