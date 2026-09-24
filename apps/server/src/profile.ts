import type { Express, RequestHandler } from "express";
import type { Metrics } from "@arena/contracts";
import { db, xpFor } from "./store.js";
import { loadScenarios } from "./content.js";

const scenarios=new Map(loadScenarios().map(item=>[item.id,item]));
export function registerProfileRoutes(app:Express,auth:RequestHandler){
  app.get("/api/me/profile",auth,(_req,res)=>{
    const userId=res.locals.user.id;
    const user=db.prepare("SELECT email,created_at FROM users WHERE id=?").get(userId) as {email:string;created_at:string};
    const completedMissions=(db.prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE user_id=? AND status='finished'").get(userId) as {n:number}).n;
    const distinct=(db.prepare("SELECT DISTINCT scenario_id FROM training_sessions WHERE user_id=? AND status='finished'").all(userId) as {scenario_id:string}[]).map(row=>row.scenario_id);
    const roles=[...new Set(distinct.map(id=>scenarios.get(id)?.roles.player).filter((value):value is string=>Boolean(value)))];
    const latestRow=db.prepare("SELECT data FROM training_sessions WHERE user_id=? AND status='finished' ORDER BY created_at DESC LIMIT 1").get(userId) as {data:string}|undefined;
    const latest=latestRow?JSON.parse(latestRow.data) as {metrics:Metrics;createdAt:string}:undefined;
    const roomCount=(db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE (host_id=? OR guest_id=?) AND status='finished'").get(userId,userId) as {n:number}).n;
    const levels=(db.prepare("SELECT COUNT(*) AS n FROM learning_progress WHERE user_id=?").get(userId) as {n:number}).n;
    res.json({email:user.email,joinedAt:user.created_at,xp:xpFor(userId),completedMissions,distinctScenarios:distinct.length,roles,latestMetrics:latest?.metrics??null,latestAt:latest?.createdAt??null,completedRooms:roomCount,completedLevels:levels});
  });
}
