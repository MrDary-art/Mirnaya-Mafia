import { useEffect,useState } from "react";
import { api } from "../api.js";
const tactics={
 trust:["Доверие","Перед предложением уточните интерес другой стороны и проверьте, правильно ли вы её поняли."],
 goal:["Достижение цели","Сформулируйте желаемый результат и границы уступок до следующей попытки."],
 control:["Контроль разговора","Предложите повестку и завершите обсуждение конкретным следующим шагом."],
 eq:["Эмоциональная регуляция","В ответ на давление назовите проблему спокойной фразой и вернитесь к условиям задачи."]
};
export default function BusinessTrainer({data,reload,start}){
 const[enabled,setEnabled]=useState(Boolean(data.membership.personalization_enabled)),[attempts,setAttempts]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(!enabled){setAttempts([]);return;}let alive=true;api(`/api/company/${data.company.id}/attempts?membership_id=${data.membership.id}&limit=30`).then(rows=>{if(alive)setAttempts(rows.filter(row=>row.status==="COMPLETED"));}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[enabled,data.company.id,data.membership.id]);
 async function toggle(){setBusy(true);setError("");try{await api(`/api/company/${data.company.id}/personalization`,{method:"PUT",body:{enabled:!enabled}});setEnabled(!enabled);await reload();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const latest=attempts[0],metric=latest&&Object.keys(tactics).filter(key=>typeof latest.metrics?.[key]==="number").sort((a,b)=>latest.metrics[a]-latest.metrics[b])[0];
 const comparable=latest?attempts.filter(a=>a.assignment_id===latest.assignment_id):[];
 return <section className="business-panel"><div className="business-trainer-heading"><h2>Личная следующая тренировка</h2><button className="subtle-button" disabled={busy} onClick={toggle}>{busy?"Сохраняем…":enabled?"Отключить рекомендации":"Включить рекомендации"}</button></div><p>Добровольные подсказки по вашим корпоративным попыткам. Они описывают действия в конкретной ситуации и не являются оценкой личности.</p>{error&&<p className="business-alert" role="alert">{error}</p>}{enabled&&(metric?<div className="business-trainer-result"><h3>{tactics[metric][0]} · {latest.metrics[metric]}/100</h3><p>{tactics[metric][1]}</p><small>Основание: последняя завершённая попытка «{latest.assignment_title}». Попыток этого задания в выборке: {comparable.length}.</small><button className="primary-button" onClick={()=>start(latest.assignment_id)}>Потренировать снова</button></div>:<p className="business-muted">Рекомендация появится после завершения корпоративного задания.</p>)}</section>;
}
