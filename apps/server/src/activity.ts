import type { Express, RequestHandler } from "express";
import { activityQuerySchema } from "@arena/contracts";
import { db } from "./store.js";
import { loadScenarios } from "./content.js";

type Activity={id:string;type:"scenario"|"learning"|"ai"|"room";title:string;state:"active"|"finished";createdAt:string;href:string};
const scenarioTitles=new Map(loadScenarios().map(item=>[item.id,item.title]));
const typeOfRoom=(mode:string)=>mode==="duel"?"Командное собеседование":"Переговоры 1×1";
export function registerActivityRoutes(app:Express,auth:RequestHandler){
  app.get("/api/me/activity",auth,(req,res)=>{
    const parsed=activityQuerySchema.safeParse(req.query);
    if(!parsed.success){res.status(400).json({error:"Некорректный фильтр истории"});return;}
    const userId=res.locals.user.id;
    const items:Activity[]=[];
    if(parsed.data.type==="all"||parsed.data.type==="scenario"){
      const rows=db.prepare("SELECT id,scenario_id,status,created_at FROM training_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(userId) as {id:string;scenario_id:string;status:string;created_at:string}[];
      items.push(...rows.map(row=>({id:row.id,type:"scenario" as const,title:scenarioTitles.get(row.scenario_id)??row.scenario_id,state:row.status==="finished"?"finished" as const:"active" as const,createdAt:row.created_at,href:row.status==="finished"?`/sessions/${row.id}/report`:`/sessions/${row.id}`})));
    }
    if(parsed.data.type==="all"||parsed.data.type==="learning"){
      const rows=db.prepare("SELECT id,level_id,status,created_at FROM learning_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(userId) as {id:string;level_id:string;status:string;created_at:string}[];
      items.push(...rows.map(row=>({id:row.id,type:"learning" as const,title:`Уровень ${row.level_id}`,state:row.status==="finished"?"finished" as const:"active" as const,createdAt:row.created_at,href:`/path/attempts/${row.id}`})));
    }
    if(parsed.data.type==="all"||parsed.data.type==="ai"){
      const rows=db.prepare("SELECT id,mode,data,created_at FROM ai_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(userId) as {id:string;mode:string;data:string;created_at:string}[];
      items.push(...rows.map(row=>{const data=JSON.parse(row.data) as {status?:string;roomId?:string};const room=data.roomId?db.prepare("SELECT status FROM rooms WHERE id=?").get(data.roomId) as {status:string}|undefined:undefined;return {id:row.id,type:"ai" as const,title:row.mode==="interview"?"Собеседование с ИИ":"Переговоры с ИИ",state:data.status==="finished"||room?.status==="finished"?"finished" as const:"active" as const,createdAt:row.created_at,href:`/ai/${row.id}`};}));
    }
    if(parsed.data.type==="all"||parsed.data.type==="room"){
      const rows=db.prepare("SELECT id,mode,status,created_at FROM rooms WHERE host_id=? OR guest_id=? ORDER BY created_at DESC LIMIT 100").all(userId,userId) as {id:string;mode:string;status:string;created_at:string}[];
      items.push(...rows.map(row=>({id:row.id,type:"room" as const,title:typeOfRoom(row.mode),state:row.status==="finished"?"finished" as const:"active" as const,createdAt:row.created_at,href:`/rooms/${row.id}`})));
    }
    res.json(items.filter(item=>parsed.data.state==="all"||item.state===parsed.data.state).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100));
  });
}
