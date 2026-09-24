import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { db } from "./store.js";
import { loadScenarios } from "./content.js";

const scenarios=loadScenarios().sort((a,b)=>a.id.localeCompare(b.id));
export function moscowDate(now=new Date()){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
export function dailyScenario(date:string){
  const day=Math.floor(Date.parse(`${date}T00:00:00Z`)/86400000);
  return scenarios[((day%scenarios.length)+scenarios.length)%scenarios.length];
}
export function awardDaily(userId:string,scenarioId:string){
  const date=moscowDate();
  if(dailyScenario(date).id!==scenarioId)return;
  db.prepare("INSERT OR IGNORE INTO star_ledger VALUES (?,?,?,?,?,?)").run(randomUUID(),userId,"daily",date,2,new Date().toISOString());
}
export function registerDailyRoutes(app:Express,auth:RequestHandler){
  app.get("/api/me/daily",auth,(_req,res)=>{
    const date=moscowDate(),scenario=dailyScenario(date);
    const reward=db.prepare("SELECT 1 FROM star_ledger WHERE user_id=? AND source='daily' AND code=?").get(res.locals.user.id,date);
    const completed=(db.prepare("SELECT code FROM star_ledger WHERE user_id=? AND source='daily' ORDER BY code DESC LIMIT 60").all(res.locals.user.id) as {code:string}[]).map(row=>row.code);
    const days=new Set(completed);let streak=0;
    const cursor=new Date(`${date}T00:00:00Z`);
    if(!days.has(date))cursor.setUTCDate(cursor.getUTCDate()-1);
    for(;days.has(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()-1))streak++;
    res.json({date,scenario:{id:scenario.id,title:scenario.title},completed:Boolean(reward),rewardStars:2,streak});
  });
}
