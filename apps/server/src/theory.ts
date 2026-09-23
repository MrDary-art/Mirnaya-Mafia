import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, RequestHandler } from "express";
import { theoryAnswerSchema } from "@arena/contracts";
import { db } from "./store.js";

type Option={id:string;text:string;quality:number;feedback:string;explanation:string};
type Exercise={id:string;context:string;question:string;options:Option[]};
type Lesson={id:string;title:string;subtitle:string;order:number;duration_minutes:number;objectives:string[];sections:{title:string;body:string;example?:string;callout?:string}[];mistakes:string[];cheat_sheet:string[];practice:Exercise[];sources:{title:string;organization:string;url:string;note:string}[]};
type Progress={userId:string;lessonId:string;optionOrder:{id:string;sourceId:string}[][];answers:{exerciseId:string;quality:number;feedback:string;explanation:string}[];completed:boolean};
const path=resolve(dirname(fileURLToPath(import.meta.url)),"../../../packages/content/theory.json");
const content=JSON.parse(readFileSync(path,"utf8")) as {lessons:Record<string,Lesson>};
function getProgress(userId:string,lessonId:string):Progress|undefined{
  const row=db.prepare("SELECT data FROM theory_progress WHERE user_id=? AND lesson_id=?").get(userId,lessonId) as {data:string}|undefined;
  return row?JSON.parse(row.data) as Progress:undefined;
}
function shuffle<T>(items:T[]){for(let i=items.length-1;i>0;i--){const j=randomInt(i+1);[items[i],items[j]]=[items[j],items[i]];}return items;}
function view(lesson:Lesson,progress?:Progress){
  const {practice,...publicLesson}=lesson;
  return {...publicLesson,completed:progress?.completed??false,answered:progress?.answers.length??0,
    practice:practice.map((exercise,index)=>({id:exercise.id,context:exercise.context,question:exercise.question,
      options:progress?progress.optionOrder[index].map(entry=>({id:entry.id,text:exercise.options.find(option=>option.id===entry.sourceId)!.text})):[],
      result:progress?.answers[index]??null}))};
}
export function registerTheoryRoutes(app:Express,auth:RequestHandler,csrf:RequestHandler){
  app.get("/api/theory",auth,(_req,res)=>res.json(Object.values(content.lessons).map(lesson=>({id:lesson.id,title:lesson.title,subtitle:lesson.subtitle,order:lesson.order,duration_minutes:lesson.duration_minutes,completed:getProgress(res.locals.user.id,lesson.id)?.completed??false}))));
  app.get("/api/theory/:id",auth,(req,res)=>{
    const lesson=content.lessons[String(req.params.id)];if(!lesson){res.status(404).json({error:"Урок не найден"});return;}
    res.json(view(lesson,getProgress(res.locals.user.id,lesson.id)));
  });
  app.post("/api/theory/:id/start",auth,csrf,(req,res)=>{
    const lesson=content.lessons[String(req.params.id)];if(!lesson){res.status(404).json({error:"Урок не найден"});return;}
    let progress=getProgress(res.locals.user.id,lesson.id);
    if(!progress){
      progress={userId:res.locals.user.id,lessonId:lesson.id,optionOrder:lesson.practice.map(exercise=>shuffle(exercise.options.map(option=>({id:randomUUID(),sourceId:option.id})))),answers:[],completed:false};
      db.prepare("INSERT INTO theory_progress VALUES (?,?,?)").run(progress.userId,progress.lessonId,JSON.stringify(progress));
    }
    res.json(view(lesson,progress));
  });
  app.post("/api/theory/:id/answers",auth,csrf,(req,res)=>{
    const lesson=content.lessons[String(req.params.id)],progress=lesson&&getProgress(res.locals.user.id,lesson.id);
    if(!lesson||!progress){res.status(404).json({error:"Начните урок"});return;}
    if(progress.completed||progress.answers.length===lesson.practice.length){res.status(409).json({error:"Практика уже завершена"});return;}
    const input=theoryAnswerSchema.safeParse(req.body),index=progress.answers.length,exercise=lesson.practice[index];
    if(!input.success||input.data.exerciseId!==exercise.id){res.status(400).json({error:"Ответьте на текущее упражнение"});return;}
    const entry=progress.optionOrder[index].find(item=>item.id===input.data.optionId),option=exercise.options.find(item=>item.id===entry?.sourceId);
    if(!option){res.status(400).json({error:"Выберите ответ из списка"});return;}
    const result={exerciseId:exercise.id,quality:option.quality,feedback:option.feedback,explanation:option.explanation};
    progress.answers.push(result);
    db.prepare("UPDATE theory_progress SET data=? WHERE user_id=? AND lesson_id=?").run(JSON.stringify(progress),progress.userId,progress.lessonId);
    res.json({result,lesson:view(lesson,progress)});
  });
  app.post("/api/theory/:id/complete",auth,csrf,(req,res)=>{
    const lesson=content.lessons[String(req.params.id)],progress=lesson&&getProgress(res.locals.user.id,lesson.id);
    if(!lesson||!progress){res.status(404).json({error:"Урок не найден"});return;}
    if(progress.answers.length!==lesson.practice.length){res.status(409).json({error:"Сначала завершите все упражнения"});return;}
    db.exec("BEGIN IMMEDIATE");
    try{progress.completed=true;db.prepare("UPDATE theory_progress SET data=? WHERE user_id=? AND lesson_id=?").run(JSON.stringify(progress),progress.userId,progress.lessonId);db.prepare("INSERT OR IGNORE INTO theory_rewards VALUES (?,?,15)").run(progress.userId,progress.lessonId);db.exec("COMMIT");}
    catch(error){db.exec("ROLLBACK");throw error;}
    res.json(view(lesson,progress));
  });
}
