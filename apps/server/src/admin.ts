import type { Express, RequestHandler } from "express";
import { db } from "./store.js";

export function registerAdminRoutes(app:Express,auth:RequestHandler){
  app.get("/api/admin/overview",auth,(_req,res)=>{
    if(res.locals.user.role!=="owner"){res.status(403).json({error:"Доступен только владельцу"});return;}
    const count=(table:string)=>(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
    const sessions=db.prepare("SELECT id,user_id,scenario_id,status,created_at FROM training_sessions ORDER BY created_at DESC LIMIT 20").all() as {id:string;user_id:string;scenario_id:string;status:string;created_at:string}[];
    const rooms=db.prepare("SELECT id,mode,status,created_at FROM rooms ORDER BY created_at DESC LIMIT 20").all() as {id:string;mode:string;status:string;created_at:string}[];
    res.json({counts:{users:count("users"),sessions:count("training_sessions"),rooms:count("rooms")},sessions:sessions.map(({id,scenario_id,status,created_at})=>({id,scenarioId:scenario_id,status,createdAt:created_at})),rooms:rooms.map(({id,mode,status,created_at})=>({id,mode,status,createdAt:created_at})),project:{name:"Арена переговоров",brief:"Локальная учебная платформа переговоров",defaultDifficulty:"По выбранному сценарию"}});
  });
}
