import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, RequestHandler } from "express";
import { learningAnswerSchema, learningAttemptSchema } from "@arena/contracts";
import { db } from "./store.js";

type Option = { id:string; text:string; quality:"strong"|"acceptable"|"weak"; feedback:string; alternative:string };
type Exercise = { id:string; type:string; context:string; question:string; options:Option[] };
type Level = { id:string; chapter_id:string; order:number; title:string; objective:string; transition?:string; exercises:Exercise[] };
type Chapter = { id:string; order:number; title:string; description:string; story:string; learning:string; levels:string[] };
type Attempt = { id:string; userId:string; levelId:string; optionOrder:{id:string;sourceId:string}[][]; answers:{optionId:string;quality:Option["quality"];feedback:string;alternative:string}[]; status:"active"|"finished"; createdAt:string };
const contentPath=resolve(dirname(fileURLToPath(import.meta.url)),"../../../packages/content/learning-path.json");
const content=JSON.parse(readFileSync(contentPath,"utf8")) as {sourceCommit:string;chapters:Chapter[];levels:Level[]};
const levels=new Map(content.levels.map(level=>[level.id,level]));

function progress(userId:string) {
  return new Map((db.prepare("SELECT level_id, stars FROM learning_progress WHERE user_id=?").all(userId) as {level_id:string;stars:number}[]).map(row=>[row.level_id,row.stars]));
}
function unlocked(level:Level, done:Map<string,number>) {
  const index=content.levels.findIndex(item=>item.id===level.id);
  return index===0 || done.has(content.levels[index-1].id);
}
function shuffle<T>(ids:T[]) {
  for(let index=ids.length-1;index>0;index--){const swap=randomInt(index+1);[ids[index],ids[swap]]=[ids[swap],ids[index]];}
  return ids;
}
function attemptView(attempt:Attempt) {
  const level=levels.get(attempt.levelId)!;
  const next=level.exercises[attempt.answers.length];
  return {id:attempt.id,level:{id:level.id,title:level.title,objective:level.objective,transition:level.transition},status:attempt.status,step:attempt.answers.length,total:level.exercises.length,
    exercise:next?{id:next.id,type:next.type,context:next.context,question:next.question,options:attempt.optionOrder[attempt.answers.length].map(entry=>{const option=next.options.find(item=>item.id===entry.sourceId)!;return {id:entry.id,text:option.text};})}:null,
    answers:attempt.status==="finished"?attempt.answers:undefined,
    stars:attempt.status==="finished"?stars(attempt):undefined};
}
function stars(attempt:Attempt){const strong=attempt.answers.filter(answer=>answer.quality==="strong").length;return strong===4?3:strong>=3?2:1;}
function getAttempt(id:string,userId:string):Attempt|undefined {
  const row=db.prepare("SELECT data FROM learning_attempts WHERE id=? AND user_id=?").get(id,userId) as {data:string}|undefined;
  return row?JSON.parse(row.data) as Attempt:undefined;
}
export function registerLearningRoutes(app:Express, auth:RequestHandler, csrf:RequestHandler) {
  app.get("/api/path",auth,(_req,res)=>{
    const done=progress(res.locals.user.id);
    res.json({sourceCommit:content.sourceCommit,chapters:content.chapters.map(chapter=>({...chapter,completed:chapter.levels.filter(id=>done.has(id)).length,total:chapter.levels.length,bestStars:chapter.levels.reduce((sum,id)=>sum+(done.get(id)??0),0),levels:chapter.levels.map(id=>{const level=levels.get(id)!;return {id,title:level.title,objective:level.objective,order:level.order,unlocked:unlocked(level,done),stars:done.get(id)??0};})}))});
  });
  app.get("/api/path/chapters/:id/report",auth,(req,res)=>{
    const chapter=content.chapters.find(item=>item.id===String(req.params.id));
    if(!chapter){res.status(404).json({error:"Глава не найдена"});return;}
    const done=progress(res.locals.user.id);
    if(!chapter.levels.every(id=>done.has(id))){res.status(409).json({error:"Завершите все уровни главы"});return;}
    const rows=db.prepare("SELECT level_id,data FROM learning_attempts WHERE user_id=? AND status='finished' ORDER BY created_at DESC").all(res.locals.user.id) as {level_id:string;data:string}[];
    const latest=new Map<string,Attempt>();
    for(const row of rows)if(chapter.levels.includes(row.level_id)&&!latest.has(row.level_id))latest.set(row.level_id,JSON.parse(row.data) as Attempt);
    const errors=chapter.levels.flatMap(id=>{const attempt=latest.get(id),level=levels.get(id)!;return (attempt?.answers??[]).filter(answer=>answer.quality!=="strong").map(answer=>({levelId:id,levelTitle:level.title,quality:answer.quality,feedback:answer.feedback,alternative:answer.alternative}));});
    res.json({id:chapter.id,title:chapter.title,learning:chapter.learning,completed:chapter.levels.length,bestStars:chapter.levels.reduce((sum,id)=>sum+(done.get(id)??0),0),maxStars:chapter.levels.length*3,errors});
  });
  app.post("/api/path/attempts",auth,csrf,(req,res)=>{
    const parsed=learningAttemptSchema.safeParse(req.body);
    const level=parsed.success?levels.get(parsed.data.levelId):undefined;
    if(!level){res.status(400).json({error:"Неизвестный уровень"});return;}
    if(!unlocked(level,progress(res.locals.user.id))){res.status(403).json({error:"Сначала завершите предыдущий уровень"});return;}
    const attempt:Attempt={id:randomUUID(),userId:res.locals.user.id,levelId:level.id,optionOrder:level.exercises.map(exercise=>shuffle(exercise.options.map(option=>({id:randomUUID(),sourceId:option.id})))),answers:[],status:"active",createdAt:new Date().toISOString()};
    db.prepare("INSERT INTO learning_attempts VALUES (?,?,?,?,?,?)").run(attempt.id,attempt.userId,attempt.levelId,attempt.status,JSON.stringify(attempt),attempt.createdAt);
    res.status(201).json(attemptView(attempt));
  });
  app.get("/api/path/attempts/:id",auth,(req,res)=>{
    const attempt=getAttempt(String(req.params.id),res.locals.user.id);
    if(!attempt){res.status(404).json({error:"Попытка не найдена"});return;}
    res.json(attemptView(attempt));
  });
  app.post("/api/path/attempts/:id/answers",auth,csrf,(req,res)=>{
    const attempt=getAttempt(String(req.params.id),res.locals.user.id);
    if(!attempt){res.status(404).json({error:"Попытка не найдена"});return;}
    if(attempt.status!=="active"){res.status(409).json({error:"Уровень уже завершён"});return;}
    const parsed=learningAnswerSchema.safeParse(req.body);
    const level=levels.get(attempt.levelId)!;
    const exercise=level.exercises[attempt.answers.length];
    const selection=parsed.success?attempt.optionOrder[attempt.answers.length].find(item=>item.id===parsed.data.optionId):undefined;
    const option=exercise.options.find(item=>item.id===selection?.sourceId);
    if(!option){res.status(400).json({error:"Выберите один из ответов"});return;}
    const feedback={optionId:selection!.id,quality:option.quality,feedback:option.feedback,alternative:option.alternative};
    attempt.answers.push(feedback);
    if(attempt.answers.length===level.exercises.length)attempt.status="finished";
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE learning_attempts SET status=?, data=? WHERE id=? AND user_id=?").run(attempt.status,JSON.stringify(attempt),attempt.id,attempt.userId);
      if(attempt.status==="finished") {
        db.prepare("INSERT INTO learning_progress VALUES (?,?,?,?) ON CONFLICT(user_id,level_id) DO UPDATE SET stars=max(stars,excluded.stars),updated_at=excluded.updated_at").run(attempt.userId,attempt.levelId,stars(attempt),new Date().toISOString());
        db.prepare("INSERT OR IGNORE INTO learning_rewards VALUES (?,?,10)").run(attempt.userId,attempt.levelId);
      }
      db.exec("COMMIT");
    } catch(error){db.exec("ROLLBACK");throw error;}
    res.json({feedback,attempt:attemptView(attempt)});
  });
}
