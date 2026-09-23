import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { api } from "./api";

type Level={id:string;title:string;objective:string;order:number;unlocked:boolean;stars:number};
type Chapter={id:string;order:number;title:string;description:string;story:string;levels:Level[]};
type Path={chapters:Chapter[]};
type Attempt={id:string;level:{id:string;title:string;objective:string;transition?:string};status:"active"|"finished";step:number;total:number;stars?:number;exercise:null|{id:string;type:string;context:string;question:string;options:{id:string;text:string}[]}};
type Feedback={quality:"strong"|"acceptable"|"weak";feedback:string;alternative:string};
const qualityLabel={strong:"Сильный ход",acceptable:"Рабочий вариант",weak:"Есть риск"};

export function LearningPath(){
  const [data,setData]=useState<Path|null>(null),[error,setError]=useState("");
  const navigate=useNavigate();
  useEffect(()=>{api<Path>("/path").then(setData).catch(e=>setError(e.message));},[]);
  async function start(levelId:string){try{const attempt=await api<Attempt>("/path/attempts","POST",{levelId});navigate(`/path/attempts/${attempt.id}`);}catch(e){setError((e as Error).message)}}
  return <div className="page"><span className="kicker">10 ГЛАВ · 60 УРОВНЕЙ</span><h1>Путь развития</h1><p className="lead">Авторские упражнения из прежней версии. Проходите уровни по порядку: ответы и звёзды сохраняются в вашем аккаунте.</p><Link className="button secondary" to="/skills">Дерево навыков →</Link><Link className="button secondary" to="/theory">Теория: BATNA и ZOPA →</Link>{error&&<p className="error" role="alert">{error}</p>}{!data?<div className="skeleton">Загружаем путь…</div>:data.chapters.map(chapter=><section className="learning-chapter" key={chapter.id}><span className="card-number">ГЛАВА {chapter.order}</span><h2>{chapter.title}</h2><p>{chapter.story}</p><p>{chapter.description}</p><div className="learning-levels">{chapter.levels.map(level=><button key={level.id} className="learning-level" disabled={!level.unlocked} onClick={()=>start(level.id)}><span><small>УРОВЕНЬ {level.order}</small><strong>{level.title}</strong><small>{level.objective}</small></span><span>{level.stars?`${"★".repeat(level.stars)}${"☆".repeat(3-level.stars)}`:level.unlocked?"Начать →":"🔒"}</span></button>)}</div></section>)}</div>;
}

export function LearningAttempt(){
  const {id}=useParams();const navigate=useNavigate();const [attempt,setAttempt]=useState<Attempt|null>(null),[feedback,setFeedback]=useState<Feedback|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{api<Attempt>(`/path/attempts/${id}`).then(setAttempt).catch(e=>setError(e.message));},[id]);
  async function answer(optionId:string){setBusy(true);setError("");try{const result=await api<{feedback:Feedback;attempt:Attempt}>(`/path/attempts/${id}/answers`,"POST",{optionId});setFeedback(result.feedback);setAttempt(result.attempt);}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <div className="page narrow"><Link className="back-link" to="/path"><ChevronLeft size={17}/> К пути развития</Link>{error&&<p className="error" role="alert">{error}</p>}{!attempt?<div className="skeleton">Открываем упражнение…</div>:<><span className="kicker">УРОВЕНЬ · {attempt.step} / {attempt.total}</span><h1 className="detail-title">{attempt.level.title}</h1><p className="lead">{attempt.level.objective}</p>{feedback&&<div className="detail-panel" role="status"><strong>{qualityLabel[feedback.quality]}</strong><p>{feedback.feedback}</p>{feedback.quality!=="strong"&&<p>Сильный вариант: {feedback.alternative}</p>}<button className="button primary" onClick={()=>{setFeedback(null);if(attempt.status==="finished")navigate("/path")}}>{attempt.status==="finished"?"К главам":"Дальше"}<ArrowRight size={18}/></button></div>}{attempt.status==="finished"?<div className="detail-panel"><h2>Уровень завершён · {attempt.stars} из 3 звёзд</h2>{attempt.level.transition&&<p>{attempt.level.transition}</p>}<Link to="/path">Вернуться к главам →</Link></div>:!feedback&&attempt.exercise&&<div className="detail-panel"><span className="card-number">ЗАДАНИЕ {attempt.step+1}</span><p>{attempt.exercise.context}</p><h2>{attempt.exercise.question}</h2><div className="learning-levels">{attempt.exercise.options.map(option=><button className="learning-level" key={option.id} disabled={busy} onClick={()=>answer(option.id)}>{option.text}</button>)}</div></div>}</>}</div>;
}
