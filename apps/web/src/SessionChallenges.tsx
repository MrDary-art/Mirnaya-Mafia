import { useEffect, useState } from "react";
import type { Session } from "@arena/domain";
import { api } from "./api";

type Challenge={chaos:{id:string;text:string;options:{index:number;text:string}[]}|null;hiddenOptions:string[]|null;session:Session};
export function MissionModifiers({hasHiddenGoal,hiddenGoal,chaos,pressure,onHiddenGoal,onChaos,onPressure}:{hasHiddenGoal:boolean;hiddenGoal:boolean;chaos:boolean;pressure:number;onHiddenGoal:(value:boolean)=>void;onChaos:(value:boolean)=>void;onPressure:(value:number)=>void}){
  return <div className="detail-panel"><h2>Условия тренировки</h2><label className="item-choice"><input type="checkbox" checked={hiddenGoal} disabled={!hasHiddenGoal} onChange={e=>onHiddenGoal(e.target.checked)}/><span>Угадать скрытую цель собеседника {hasHiddenGoal?"":"· для этого сценария нет авторских вариантов"}</span></label><label className="item-choice"><input type="checkbox" checked={chaos} onChange={e=>onChaos(e.target.checked)}/><span>Неожиданное событие и выбор реакции</span></label><label className="field-label">Время на каждый ответ<select value={pressure} onChange={e=>onPressure(Number(e.target.value))}><option value="0">Без ограничения</option><option value="30">30 секунд</option><option value="60">60 секунд</option></select></label><p>После истечения времени решение остаётся доступным, но сервер уменьшит Контроль и EQ.</p></div>;
}
export function SessionChallenges({view,onUpdate}:{view:Challenge;onUpdate:()=>Promise<void>}){
  const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(!view.session.settings?.pressureSeconds)return;const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[view.session.settings?.pressureSeconds]);
  const seconds=view.session.settings?.pressureSeconds;
  const left=seconds&&view.session.stepStartedAt?Math.max(0,Math.ceil((Date.parse(view.session.stepStartedAt)+seconds*1000-now)/1000)):null;
  async function guess(index:number){setBusy(true);try{await api(`/sessions/${view.session.id}/hidden-guess`,"POST",{optionIndex:index});await onUpdate();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function react(index:number){setBusy(true);try{await api(`/sessions/${view.session.id}/chaos`,"POST",{requestId:crypto.randomUUID(),optionIndex:index});await onUpdate();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <>{left!==null&&<p className="pressure-clock" role="timer">Время на ответ: {left} с {left===0?"· штраф к Контролю и EQ":""}</p>}{view.hiddenOptions&&<div className="detail-panel"><h3>Какова скрытая цель собеседника?</h3><p>Выберите гипотезу до окончания разговора. Ответ откроется в отчёте.</p>{view.hiddenOptions.map((option,index)=><button className="choice" key={index} disabled={busy} aria-pressed={view.session.hiddenGuess===index} onClick={()=>guess(index)}>{option}{view.session.hiddenGuess===index?" ✓":""}</button>)}</div>}{view.chaos&&<div className="detail-panel chaos-event"><h3>Неожиданное событие</h3><p>{view.chaos.text}</p>{view.chaos.options.map(option=><button className="choice" key={option.index} disabled={busy} onClick={()=>react(option.index)}>{option.text}</button>)}</div>}{error&&<p className="error" role="alert">{error}</p>}</>;
}
