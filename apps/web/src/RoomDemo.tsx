import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const stages=[
  {title:"Приглашение",description:"Вы отправляете другу приглашение на переговоры о сроках проекта."},
  {title:"Ответ партнёра",description:"В демонстрации виртуальный участник Анна принимает приглашение. В реальной комнате это действие совершает второй пользователь."},
  {title:"Время встречи",description:"Показываем назначенный день и получасовой интервал по московскому времени."},
  {title:"Лобби",description:"Оба участника проверяют камеру и микрофон и отмечают готовность."},
  {title:"Разговор",description:"Трёхминутная демонстрация звонка с вымышленным оппонентом. Камера и микрофон здесь не включаются."},
  {title:"Ожидание результата",description:"Каждый участник отдельно отмечает, удалось ли договориться."},
  {title:"Демонстрационный итог",description:"Оба подтвердили договорённость. В реальной комнате итог основывается на подтверждениях участников; оценка качества переговоров не выполняется."}
];
export default function RoomDemo(){
  const [step,setStep]=useState(0),[seconds,setSeconds]=useState(180);
  useEffect(()=>{if(step!==4)return;const timer=setInterval(()=>setSeconds(value=>Math.max(0,value-1)),1000);return()=>clearInterval(timer)},[step]);
  return <div className="page narrow"><Link className="back-link" to="/rooms">← К комнатам</Link><span className="kicker">ОБУЧАЮЩАЯ ДЕМОНСТРАЦИЯ · БЕЗ СОХРАНЕНИЯ</span><h1>Как проходит встреча 1×1</h1><div className="detail-panel"><p>Шаг {step+1} из {stages.length}</p><h2>{stages[step].title}</h2><p>{stages[step].description}</p>{step===4&&<p role="timer">{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</p>}{step===6&&<><p>Мягкий разбор: удалось согласовать новый срок.</p><p>Строгий разбор: без записи конкретных обязательств договорённость может оказаться непрочной.</p></>}<div className="exercise-actions">{step>0&&<button className="button secondary" onClick={()=>setStep(value=>value-1)}>Назад</button>}{step<stages.length-1&&<button className="button primary" onClick={()=>setStep(value=>value+1)}>Следующий этап</button>}{step===stages.length-1&&<button className="button secondary" onClick={()=>{setStep(0);setSeconds(180)}}>Повторить</button>}</div></div><p>Это управляемый макет процесса: виртуальный участник, звонок и оценки не создают реальную комнату и не меняют прогресс.</p></div>;
}
