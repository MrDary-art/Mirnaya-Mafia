import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, RequestHandler } from "express";
import { skillAnswerSchema } from "@arena/contracts";
import { createSession, type Scenario } from "@arena/domain";
import { loadScenarios } from "./content.js";
import { db, getSession, saveSession, xpFor } from "./store.js";

type Round={title:string;type:string;prompt:string;goal?:string;required_tags?:string[];options?:{id:string;text:string;correct:boolean;tags:string[]}[]};
type Node={id:string;type:"root"|"profession"|"skill"|"training"|"final";title:string;description?:string;parent_id:string|null;required_previous?:string[];min_xp?:number;xp_reward:number;scenario_id?:string;exercise?:Round&{rounds:Round[]}};
type Progress={userId:string;nodeId:string;current:number;mistakes:number;bestStars:number;order:{id:string;sourceId:string}[][];answers:{round:number;ok:boolean;feedback:string}[]};
const path=resolve(dirname(fileURLToPath(import.meta.url)),"../../../packages/content/skill-tree.json");
const content=JSON.parse(readFileSync(path,"utf8")) as {nodes:Node[]};
const nodes=new Map(content.nodes.map(node=>[node.id,node]));
const scenarios=new Map(loadScenarios().map(scenario=>[scenario.id,scenario]));
function getProgress(userId:string,nodeId:string):Progress|undefined{
  const row=db.prepare("SELECT data FROM skill_progress WHERE user_id=? AND node_id=?").get(userId,nodeId) as {data:string}|undefined;
  return row?JSON.parse(row.data) as Progress:undefined;
}
function save(progress:Progress){db.prepare("INSERT INTO skill_progress VALUES (?,?,?) ON CONFLICT(user_id,node_id) DO UPDATE SET data=excluded.data").run(progress.userId,progress.nodeId,JSON.stringify(progress));}
export function syncFinals(userId:string){
  const rows=db.prepare("SELECT node_id,session_id FROM skill_final_sessions WHERE user_id=?").all(userId) as {node_id:string;session_id:string}[];
  for(const row of rows){const session=getSession(row.session_id,userId);if(session?.status!=="finished")continue;
    const score=Math.round(Object.values(session.metrics).reduce((a,b)=>a+b,0)/4),stars=score>=75?3:score>=55?2:1;
    const old=getProgress(userId,row.node_id),progress:Progress=old??{userId,nodeId:row.node_id,current:0,mistakes:0,bestStars:0,order:[],answers:[]};
    if(stars>progress.bestStars){progress.bestStars=stars;save(progress);}
    db.prepare("INSERT OR IGNORE INTO skill_rewards VALUES (?,?,?)").run(userId,row.node_id,nodes.get(row.node_id)!.xp_reward);
  }
}
function status(node:Node,userId:string){
  const bestStars=getProgress(userId,node.id)?.bestStars??0,xp=xpFor(userId);
  if(node.type==="root"||node.type==="profession"||node.type==="skill")return {state:"available",stars:0,lockedReason:null};
  if(bestStars)return {state:"completed",stars:bestStars,lockedReason:null};
  const required=node.required_previous??[];
  if(required.some(id=>!(getProgress(userId,id)?.bestStars)))return {state:"locked",stars:0,lockedReason:"Сначала завершите предыдущий узел"};
  if(xp<(node.min_xp??0))return {state:"locked",stars:0,lockedReason:`Требуется ${node.min_xp} XP`};
  return {state:"available",stars:0,lockedReason:null};
}
function publicNode(node:Node,userId:string){
  const progress=getProgress(userId,node.id),round=node.exercise?.rounds[progress?.current??0];
  return {id:node.id,type:node.type,title:node.title,description:node.description,parentId:node.parent_id,requiredPrevious:node.required_previous??[],minXp:node.min_xp??0,scenarioId:node.scenario_id,...status(node,userId),current:progress?.current??0,total:node.exercise?.rounds.length??0,
    round:progress&&round?{title:round.title,prompt:round.prompt,goal:round.goal,type:round.type,options:progress.order[progress.current]?.map(entry=>({id:entry.id,text:round.options?.find(option=>option.id===entry.sourceId)?.text}))??[]}:null,
    answers:progress?.answers??[]};
}
function techniques(text:string){const lower=text.toLowerCase();return new Set(Object.entries({"эмпатия":/понимаю|слышу|непросто|чувств|разочар|злит/,"вопросы":/[?？]|почему|как|что/,"объективные критерии":/данн|критери|цифр|факт|рынок|срок/,"структура":/сначала|затем|далее|итог|по пунктам|предлагаю/}).filter(([,pattern])=>pattern.test(lower)).map(([tag])=>tag));}
export function registerSkillRoutes(app:Express,auth:RequestHandler,csrf:RequestHandler){
  app.get("/api/skills/tree",auth,(_req,res)=>{const userId=res.locals.user.id;syncFinals(userId);res.json({xp:xpFor(userId),nodes:content.nodes.map(node=>publicNode(node,userId))});});
  app.get("/api/skills/nodes/:id",auth,(req,res)=>{const node=nodes.get(String(req.params.id));if(!node){res.status(404).json({error:"Узел не найден"});return;}syncFinals(res.locals.user.id);res.json(publicNode(node,res.locals.user.id));});
  app.post("/api/skills/nodes/:id/start",auth,csrf,(req,res)=>{
    const node=nodes.get(String(req.params.id)),userId=res.locals.user.id;
    if(!node||node.type!=="training"){res.status(404).json({error:"Упражнение не найдено"});return;}
    if(status(node,userId).state==="locked"){res.status(403).json({error:"Узел пока закрыт"});return;}
    const bestStars=getProgress(userId,node.id)?.bestStars??0;
    const progress:Progress={userId,nodeId:node.id,current:0,mistakes:0,bestStars,order:node.exercise!.rounds.map(round=>round.options?.map(option=>({id:randomUUID(),sourceId:option.id}))??[]),answers:[]};
    save(progress);res.json(publicNode(node,userId));
  });
  app.post("/api/skills/nodes/:id/answers",auth,csrf,(req,res)=>{
    const node=nodes.get(String(req.params.id)),userId=res.locals.user.id,progress=node&&getProgress(userId,node.id),parsed=skillAnswerSchema.safeParse(req.body);
    if(!node||node.type!=="training"||!progress){res.status(404).json({error:"Начните упражнение"});return;}
    if(progress.current>=node.exercise!.rounds.length){res.status(409).json({error:"Упражнение завершено"});return;}
    if(!parsed.success){res.status(400).json({error:"Введите ответ"});return;}
    const round=node.exercise!.rounds[progress.current];let ok=false,feedback="";
    if(progress.answers.length>=60){res.status(429).json({error:"Лимит попыток исчерпан. Начните упражнение заново"});return;}
    if(round.options){
      const entry=progress.order[progress.current].find(item=>item.id===parsed.data.optionId),option=round.options.find(item=>item.id===entry?.sourceId);
      if(!option){res.status(400).json({error:"Выберите вариант ответа"});return;}
      ok=option.correct;feedback=ok?"Сильный ход: продолжайте.":"Здесь важнее заметить интерес или эмоцию и вернуть структуру.";
    }else{
      const answer=parsed.data.answer?.trim();if(!answer){res.status(400).json({error:"Введите ответ"});return;}
      const found=techniques(answer),missing=(round.required_tags??[]).filter(tag=>!found.has(tag));
      ok=missing.length===0;feedback=ok?"Нужные приёмы найдены по ключевым словам.":`По ключевым словам не обнаружены: ${missing.join(", ")}.`;
    }
    progress.answers.push({round:progress.current,ok,feedback});
    if(ok)progress.current++;else progress.mistakes++;
    const completed=progress.current===node.exercise!.rounds.length;
    db.exec("BEGIN IMMEDIATE");
    try{if(completed){progress.bestStars=Math.max(progress.bestStars,progress.mistakes?2:3);db.prepare("INSERT OR IGNORE INTO skill_rewards VALUES (?,?,?)").run(userId,node.id,node.xp_reward);}save(progress);db.exec("COMMIT");}
    catch(error){db.exec("ROLLBACK");throw error;}
    res.json({ok,feedback,completed,node:publicNode(node,userId)});
  });
  app.post("/api/skills/finals/:id/start",auth,csrf,(req,res)=>{
    const node=nodes.get(String(req.params.id)),userId=res.locals.user.id;
    if(!node||node.type!=="final"){res.status(404).json({error:"Финальная сцена не найдена"});return;}
    if(status(node,userId).state==="locked"){res.status(403).json({error:"Сначала завершите два упражнения и наберите нужный XP"});return;}
    const scenario=scenarios.get(node.scenario_id!) as Scenario;
    const session=createSession(userId,scenario);
    db.exec("BEGIN IMMEDIATE");
    try{saveSession(session);db.prepare("INSERT INTO skill_final_sessions VALUES (?,?,?)").run(userId,node.id,session.id);db.exec("COMMIT");}
    catch(error){db.exec("ROLLBACK");throw error;}
    res.status(201).json({sessionId:session.id});
  });
}
