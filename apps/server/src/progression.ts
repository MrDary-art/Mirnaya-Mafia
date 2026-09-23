import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { shopItemSchema } from "@arena/contracts";
import { db, xpFor } from "./store.js";

type Item={code:string;name:string;category:"avatar"|"frame";cost:number;minXp:number};
const catalog:Item[]=[
  {code:"avatar_beginner",name:"Стратег-новичок",category:"avatar",cost:0,minXp:0},
  {code:"avatar_analyst",name:"Аналитик",category:"avatar",cost:8,minXp:100},
  {code:"avatar_diplomat",name:"Дипломат",category:"avatar",cost:8,minXp:100},
  {code:"avatar_hr",name:"Эксперт по людям",category:"avatar",cost:8,minXp:250},
  {code:"avatar_sales",name:"Мастер продаж",category:"avatar",cost:8,minXp:250},
  {code:"frame_classic",name:"Классика",category:"frame",cost:0,minXp:0},
  {code:"frame_violet",name:"Фиолетовое стекло",category:"frame",cost:5,minXp:250},
  {code:"frame_emerald",name:"Изумруд",category:"frame",cost:7,minXp:500},
  {code:"frame_gold",name:"Золотая сделка",category:"frame",cost:10,minXp:750},
];
const milestones=[{xp:100,stars:2},{xp:250,stars:3},{xp:500,stars:5},{xp:750,stars:5},{xp:1000,stars:5}];
const ranks=[{xp:0,name:"Новичок"},{xp:100,name:"Практик"},{xp:250,name:"Переговорщик"},{xp:450,name:"Стратег"},{xp:700,name:"Мастер переговоров"},{xp:1000,name:"Эксперт переговоров"}];
function balance(userId:string){return (db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM star_ledger WHERE user_id=?").get(userId) as {n:number}).n;}
function sync(userId:string){
  const xp=xpFor(userId);
  for(const milestone of milestones)if(xp>=milestone.xp)db.prepare("INSERT OR IGNORE INTO star_ledger VALUES (?,?,?,?,?,?)").run(randomUUID(),userId,"milestone",String(milestone.xp),milestone.stars,new Date().toISOString());
  for(const code of ["avatar_beginner","frame_classic"])db.prepare("INSERT OR IGNORE INTO inventory VALUES (?,?,?)").run(userId,code,new Date().toISOString());
  return xp;
}
function stats(userId:string){
  const xp=sync(userId),rank=[...ranks].reverse().find(item=>xp>=item.xp)!;
  const completed=(db.prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE user_id=? AND status='finished'").get(userId) as {n:number}).n;
  const levels=(db.prepare("SELECT COUNT(*) AS n FROM learning_progress WHERE user_id=?").get(userId) as {n:number}).n;
  const lessons=(db.prepare("SELECT COUNT(*) AS n FROM theory_progress WHERE user_id=? AND json_extract(data,'$.completed')=1").get(userId) as {n:number}).n;
  const owned=(db.prepare("SELECT item_code FROM inventory WHERE user_id=?").all(userId) as {item_code:string}[]).map(row=>row.item_code);
  const equipment=Object.fromEntries((db.prepare("SELECT category,item_code FROM equipment WHERE user_id=?").all(userId) as {category:string;item_code:string}[]).map(row=>[row.category,row.item_code]));
  return {xp,rank:rank.name,nextRank:ranks.find(item=>item.xp>xp)??null,stars:balance(userId),achievements:[...(completed?["Первая миссия"]:[]),...(levels?["Первый уровень"]:[]),...(levels>=6?["Первая глава"]:[]),...(lessons?["Первая теория"]:[]),...milestones.filter(item=>xp>=item.xp).map(item=>`Опыт ${item.xp}`)],completed,levels,lessons,owned,equipment:{avatar:equipment.avatar??"avatar_beginner",frame:equipment.frame??"frame_classic"},catalog};
}
export function registerProgressionRoutes(app:Express,auth:RequestHandler,csrf:RequestHandler){
  app.get("/api/progression",auth,(_req,res)=>res.json(stats(res.locals.user.id)));
  app.post("/api/shop/purchase",auth,csrf,(req,res)=>{
    const parsed=shopItemSchema.safeParse(req.body),item=parsed.success?catalog.find(value=>value.code===parsed.data.itemCode):undefined;
    if(!item){res.status(404).json({error:"Предмет не найден"});return;}
    const userId=res.locals.user.id;sync(userId);
    if(xpFor(userId)<item.minXp){res.status(403).json({error:"Пока недостаточно опыта для этого предмета"});return;}
    if(db.prepare("SELECT 1 FROM inventory WHERE user_id=? AND item_code=?").get(userId,item.code)){res.status(409).json({error:"Предмет уже получен"});return;}
    db.exec("BEGIN IMMEDIATE");
    try{
      if(balance(userId)<item.cost){db.exec("ROLLBACK");res.status(409).json({error:"Недостаточно звёзд"});return;}
      db.prepare("INSERT INTO inventory VALUES (?,?,?)").run(userId,item.code,new Date().toISOString());
      if(item.cost)db.prepare("INSERT INTO star_ledger VALUES (?,?,?,?,?,?)").run(randomUUID(),userId,"purchase",item.code,-item.cost,new Date().toISOString());
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
    res.json(stats(userId));
  });
  app.post("/api/shop/equip",auth,csrf,(req,res)=>{
    const parsed=shopItemSchema.safeParse(req.body),item=parsed.success?catalog.find(value=>value.code===parsed.data.itemCode):undefined;
    if(!item){res.status(404).json({error:"Предмет не найден"});return;}
    const userId=res.locals.user.id;
    if(!db.prepare("SELECT 1 FROM inventory WHERE user_id=? AND item_code=?").get(userId,item.code)){res.status(403).json({error:"Сначала получите предмет"});return;}
    db.prepare("INSERT INTO equipment VALUES (?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET item_code=excluded.item_code").run(userId,item.category,item.code);
    res.json(stats(userId));
  });
}
