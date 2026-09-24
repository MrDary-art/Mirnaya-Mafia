import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { directMessageSchema } from "@arena/contracts";
import { db, userById } from "./store.js";

type FriendRow={requester_id:string;receiver_id:string;status:string};
function relation(a:string,b:string):FriendRow|undefined {
  return db.prepare("SELECT requester_id,receiver_id,status FROM friendships WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)").get(a,b,b,a) as FriendRow|undefined;
}
function friend(a:string,b:string){return relation(a,b)?.status==="friends";}
export function registerSocialRoutes(app:Express,auth:RequestHandler,csrf:RequestHandler) {
  app.get("/api/notifications",auth,(_req,res)=>{
    const me=res.locals.user.id;
    const requests=db.prepare("SELECT requester_id,created_at FROM friendships WHERE receiver_id=? AND status='pending' ORDER BY created_at DESC LIMIT 30").all(me) as {requester_id:string;created_at:string}[];
    const invitations=db.prepare("SELECT id,host_id,data,created_at FROM rooms WHERE status='waiting' AND json_extract(data,'$.inviteeId')=? ORDER BY created_at DESC LIMIT 30").all(me) as {id:string;host_id:string;data:string;created_at:string}[];
    res.json([...requests.map(row=>({id:`friend:${row.requester_id}`,type:"friend",title:`Заявка в друзья от ${userById(row.requester_id)?.email??"пользователя"}`,href:"/people",createdAt:row.created_at})),...invitations.filter(row=>{const data=JSON.parse(row.data) as {scheduledAt?:string};return Date.now()<Date.parse(data.scheduledAt??row.created_at)+24*3600000}).map(row=>({id:`room:${row.id}`,type:"room",title:`Приглашение на переговоры от ${userById(row.host_id)?.email??"пользователя"}`,href:"/rooms",createdAt:row.created_at}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  });
  app.get("/api/people",auth,(req,res)=>{
    const query=String(req.query.q??"").trim().toLowerCase().slice(0,80);
    const rows=db.prepare("SELECT id,email FROM users WHERE id<>? AND lower(email) LIKE ? ORDER BY email LIMIT 30").all(res.locals.user.id,`%${query}%`) as {id:string;email:string}[];
    res.json(rows.map(person=>{const row=relation(res.locals.user.id,person.id);return {...person,relationship:!row?"none":row.status==="friends"?"friends":row.requester_id===res.locals.user.id?"sent":"received"};}));
  });
  app.get("/api/people/:id/profile",auth,(req,res)=>{
    const me=res.locals.user.id,id=String(req.params.id);
    if(!friend(me,id)){res.status(403).json({error:"Профиль доступен только друзьям"});return;}
    const person=db.prepare("SELECT email,created_at FROM users WHERE id=?").get(id) as {email:string;created_at:string}|undefined;
    if(!person){res.status(404).json({error:"Пользователь не найден"});return;}
    const missions=(db.prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE user_id=? AND status='finished'").get(id) as {n:number}).n;
    const scenarios=(db.prepare("SELECT COUNT(DISTINCT scenario_id) AS n FROM training_sessions WHERE user_id=? AND status='finished'").get(id) as {n:number}).n;
    const rooms=(db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE (host_id=? OR guest_id=?) AND status='finished'").get(id,id) as {n:number}).n;
    res.json({id,email:person.email,joinedAt:person.created_at,missions,scenarios,rooms});
  });
  app.get("/api/friends",auth,(_req,res)=>{
    const rows=db.prepare("SELECT * FROM friendships WHERE requester_id=? OR receiver_id=?").all(res.locals.user.id,res.locals.user.id) as FriendRow[];
    res.json(rows.map(row=>{const id=row.requester_id===res.locals.user.id?row.receiver_id:row.requester_id;const person=userById(id)!;return {id,email:person.email,relationship:row.status==="friends"?"friends":row.requester_id===res.locals.user.id?"sent":"received"};}));
  });
  app.post("/api/friends/:id/request",auth,csrf,(req,res)=>{
    const me=res.locals.user.id,other=String(req.params.id);
    if(me===other||!userById(other)){res.status(404).json({error:"Пользователь не найден"});return;}
    const current=relation(me,other);
    if(current?.status==="friends"){res.status(409).json({error:"Вы уже друзья"});return;}
    if(current?.requester_id===me){res.status(409).json({error:"Заявка уже отправлена"});return;}
    if(current){db.prepare("UPDATE friendships SET status='friends' WHERE requester_id=? AND receiver_id=?").run(other,me);res.json({relationship:"friends"});return;}
    db.prepare("INSERT INTO friendships VALUES (?,?,?,?)").run(me,other,"pending",new Date().toISOString());res.status(201).json({relationship:"sent"});
  });
  app.post("/api/friends/:id/accept",auth,csrf,(req,res)=>{
    const me=res.locals.user.id,other=String(req.params.id),row=relation(me,other);
    if(!row||row.receiver_id!==me||row.status!=="pending"){res.status(404).json({error:"Входящая заявка не найдена"});return;}
    db.prepare("UPDATE friendships SET status='friends' WHERE requester_id=? AND receiver_id=?").run(other,me);res.json({relationship:"friends"});
  });
  app.delete("/api/friends/:id",auth,csrf,(req,res)=>{
    db.prepare("DELETE FROM friendships WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)").run(res.locals.user.id,String(req.params.id),String(req.params.id),res.locals.user.id);
    res.json({ok:true});
  });
  app.get("/api/messages/:id",auth,(req,res)=>{
    const me=res.locals.user.id,other=String(req.params.id);
    if(!friend(me,other)){res.status(403).json({error:"Сообщения доступны друзьям"});return;}
    res.json(db.prepare("SELECT * FROM direct_messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created_at DESC LIMIT 100").all(me,other,other,me).reverse());
  });
  app.post("/api/messages/:id",auth,csrf,(req,res)=>{
    const me=res.locals.user.id,other=String(req.params.id),parsed=directMessageSchema.safeParse(req.body);
    if(!friend(me,other)){res.status(403).json({error:"Сообщения доступны друзьям"});return;}
    if(!parsed.success){res.status(400).json({error:"Введите сообщение до 2000 символов"});return;}
    const message={id:randomUUID(),sender_id:me,receiver_id:other,text:parsed.data.text,created_at:new Date().toISOString()};
    db.prepare("INSERT INTO direct_messages VALUES (?,?,?,?,?)").run(message.id,message.sender_id,message.receiver_id,message.text,message.created_at);
    res.status(201).json(message);
  });
}
