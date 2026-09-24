import { randomBytes, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { directMessageSchema, roomCreateSchema, roomFinishSchema, roomJoinSchema, roomSignalSchema } from "@arena/contracts";
import { db, userById } from "./store.js";
import { aiConfigured } from "./ai.js";

type RoomData={problem:string;goal:string;done:string[];startedAt?:string;sessions?:Record<string,string>;inviteeId?:string;scheduledAt?:string;durationMinutes?:15|30|60;ready?:string[];feedback?:Record<string,"agreement"|"no_agreement">};
type RoomRow={id:string;code:string;host_id:string;guest_id:string|null;mode:string;status:string;data:string;created_at:string};
function byId(id:string):RoomRow|undefined{return db.prepare("SELECT * FROM rooms WHERE id=?").get(id) as RoomRow|undefined;}
function view(room:RoomRow,me:string){
  const data=JSON.parse(room.data) as RoomData;
  const peer=room.host_id===me?room.guest_id:room.host_id;
  const rows=db.prepare("SELECT id,user_id,text,created_at FROM room_messages WHERE room_id=? ORDER BY created_at LIMIT 300").all(room.id);
  const interviews=room.mode==="duel"&&room.status==="finished"?Object.entries(data.sessions??{}).map(([userId,id])=>{
    const row=db.prepare("SELECT data FROM ai_sessions WHERE id=?").get(id) as {data:string}|undefined;
    const session=row?JSON.parse(row.data) as {messages:{role:string;content:string}[]}:undefined;
    return {userId,name:userById(userId)?.email,messages:session?.messages??[]};
  }):undefined;
  return {id:room.id,code:room.code,status:room.status,mode:room.mode,isHost:room.host_id===me,problem:data.problem,goal:room.host_id===me?data.goal:undefined,
    yourRole:room.mode==="duel"?"Кандидат":room.host_id===me?"Инициатор переговоров":"Другая сторона",yourBrief:room.mode==="duel"?`Пройдите независимое собеседование по теме: ${data.problem}.`:room.host_id===me?`Ваша цель: ${data.goal}`:`Обсудите ситуацию: ${data.problem}. Отстаивайте свои интересы.`,
    yourId:me,peerId:peer,peerName:peer?userById(peer)?.email:null,done:data.done.includes(me),peerDone:peer?data.done.includes(peer):false,
    deadline:data.startedAt?new Date(new Date(data.startedAt).getTime()+(data.durationMinutes??15)*60000).toISOString():null,scheduledAt:data.scheduledAt??null,durationMinutes:data.durationMinutes??15,ready:(data.ready??[]).includes(me),peerReady:peer?(data.ready??[]).includes(peer):false,messages:rows,yourSessionId:data.sessions?.[me]??null,interviews,
    report:room.status==="finished"&&room.mode==="human"?{turns:rows.length,participantTurns:{[room.host_id]:rows.filter((r:any)=>r.user_id===room.host_id).length,...(room.guest_id?{[room.guest_id]:rows.filter((r:any)=>r.user_id===room.guest_id).length}:{})},feedback:data.feedback??{},verdict:!room.guest_id||!data.feedback?.[room.host_id]||!data.feedback?.[room.guest_id]?"not_assessed":data.feedback[room.host_id]==="agreement"&&data.feedback[room.guest_id]==="agreement"?"agreement":data.feedback[room.host_id]==="no_agreement"&&data.feedback[room.guest_id]==="no_agreement"?"no_agreement":"disputed"}:undefined};
}
function participant(id:string,me:string){const room=byId(id);return room&&(room.host_id===me||room.guest_id===me)?room:undefined;}
function settle(room:RoomRow){
  const data=JSON.parse(room.data) as RoomData;
  if(room.status==="waiting"&&Date.now()>=new Date(data.scheduledAt??room.created_at).getTime()+24*3600000){
    room.status="expired";db.prepare("UPDATE rooms SET status='expired' WHERE id=? AND status='waiting'").run(room.id);
  }
  if(room.status==="scheduled"&&data.scheduledAt){
    const start=Date.parse(data.scheduledAt);
    if(Date.now()>start+24*3600000){room.status="expired";db.prepare("UPDATE rooms SET status='expired' WHERE id=? AND status='scheduled'").run(room.id);}
    else if(room.guest_id&&(data.ready??[]).includes(room.host_id)&&(data.ready??[]).includes(room.guest_id)&&Date.now()>=start){
      data.startedAt=new Date().toISOString();room.data=JSON.stringify(data);room.status="active";
      db.prepare("UPDATE rooms SET status='active',data=? WHERE id=? AND status='scheduled'").run(room.data,room.id);
    }
  }
  if(room.status==="active"&&(data.done.length===2||data.startedAt&&Date.now()>=new Date(data.startedAt).getTime()+(data.durationMinutes??15)*60000)){
    room.status="finished";db.prepare("UPDATE rooms SET status='finished' WHERE id=?").run(room.id);
  }
  return room;
}
function activeBooking(userId:string,start:number,end:number){
  const rows=db.prepare("SELECT * FROM rooms WHERE status IN ('waiting','scheduled','active') AND (host_id=? OR guest_id=? OR json_extract(data,'$.inviteeId')=?)").all(userId,userId,userId) as RoomRow[];
  return rows.some(row=>{if(!["waiting","scheduled","active"].includes(settle(row).status))return false;const data=JSON.parse(row.data) as RoomData;if(!data.scheduledAt)return false;const other=Date.parse(data.scheduledAt);return start<other+(data.durationMinutes??15)*60000&&end>other;});
}
function joinRoom(room:RoomRow,userId:string){
  const data=JSON.parse(room.data) as RoomData;
  if(data.inviteeId&&data.inviteeId!==userId)return false;
  if(data.scheduledAt&&Date.now()>Date.parse(data.scheduledAt)+24*3600000)return false;
  if(!data.scheduledAt)data.startedAt=new Date().toISOString();
  else data.ready=[];
  if(room.mode==="duel"){
    data.sessions={};for(const id of [room.host_id,userId])data.sessions[id]=randomUUID();
  }
  db.exec("BEGIN IMMEDIATE");
  try{
    const status=data.scheduledAt?"scheduled":"active";
    const updated=db.prepare("UPDATE rooms SET guest_id=?,status=?,data=? WHERE id=? AND guest_id IS NULL AND status='waiting'").run(userId,status,JSON.stringify(data),room.id);
    if(!updated.changes){db.exec("ROLLBACK");return false;}
    if(data.sessions)for(const [id,sessionId] of Object.entries(data.sessions)){
      const questions=["Расскажите о релевантном опыте и своей роли в последнем проекте.",`Как бы вы разобрались с задачей: ${data.problem.slice(0,200)}?`,"Опишите случай разногласия с коллегой и как вы нашли решение.","Что вы сделаете в первые недели на этой позиции?"];
      const session={id:sessionId,userId:id,mode:"interview",roomId:room.id,context:data.problem,roomQuestions:questions,messages:[{role:"assistant",content:questions[0]}],createdAt:data.startedAt??new Date().toISOString()};
      db.prepare("INSERT INTO ai_sessions VALUES (?,?,?,?,?)").run(sessionId,id,"interview",JSON.stringify(session),session.createdAt);
    }
    db.exec("COMMIT");return true;
  }catch(error){db.exec("ROLLBACK");throw error;}
}
export function registerRoomRoutes(app:Express,auth:RequestHandler,csrf:RequestHandler){
  app.get("/api/rooms/rtc-config",auth,(_req,res)=>{
    try {const servers=JSON.parse(process.env.ARENA_ICE_SERVERS??"[]");res.json({iceServers:Array.isArray(servers)?servers:[]});}
    catch {res.json({iceServers:[]});}
  });
  app.get("/api/rooms",auth,(_req,res)=>{
    const rows=db.prepare("SELECT * FROM rooms WHERE host_id=? OR guest_id=? ORDER BY created_at DESC LIMIT 30").all(res.locals.user.id,res.locals.user.id) as RoomRow[];
    res.json(rows.map(room=>{settle(room);return view(room,res.locals.user.id);}));
  });
  app.get("/api/rooms/invitations",auth,(_req,res)=>{
    const rows=db.prepare("SELECT * FROM rooms WHERE status='waiting' AND json_extract(data,'$.inviteeId')=? ORDER BY created_at DESC LIMIT 30").all(res.locals.user.id) as RoomRow[];
    res.json(rows.filter(room=>settle(room).status==="waiting").map(room=>{const data=JSON.parse(room.data) as RoomData;return {id:room.id,hostName:userById(room.host_id)?.email,problem:data.problem,scheduledAt:data.scheduledAt??null,durationMinutes:data.durationMinutes??15,mode:room.mode};}));
  });
  app.post("/api/rooms",auth,csrf,(req,res)=>{
    const parsed=roomCreateSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:"Выберите формат парной практики"});return;}
    if(parsed.data.mode==="duel"&&!aiConfigured){res.status(503).json({error:"Для парного собеседования настройте ИИ-провайдер"});return;}
    const me=res.locals.user.id,invitee=parsed.data.inviteeId,scheduled=parsed.data.scheduledAt;
    if(scheduled&&parsed.data.mode!=="human"){res.status(400).json({error:"Запись по времени доступна для парных переговоров"});return;}
    if(scheduled&&!invitee){res.status(400).json({error:"Для записи на время выберите друга"});return;}
    if(invitee){
      const relation=db.prepare("SELECT status FROM friendships WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)").get(me,invitee,invitee,me) as {status:string}|undefined;
      if(invitee===me||!userById(invitee)||relation?.status!=="friends"){res.status(403).json({error:"Пригласить можно только друга"});return;}
    }
    if(scheduled){
      const start=Date.parse(scheduled),end=start+parsed.data.durationMinutes*60000;
      if(!Number.isFinite(start)||start<Date.now()+10*60000||start>Date.now()+7*86400000||new Date(start).getUTCMinutes()%30!==0||new Date(start).getUTCSeconds()!==0||activeBooking(me,start,end)||activeBooking(invitee!,start,end)){
        res.status(409).json({error:"Выберите свободный получасовой интервал в ближайшие 7 дней"});return;
      }
    }
    const id=randomUUID(),code=randomBytes(5).toString("hex").toUpperCase(),data:RoomData={problem:parsed.data.problem,goal:parsed.data.goal,done:[],inviteeId:invitee,scheduledAt:scheduled,durationMinutes:parsed.data.durationMinutes},created=new Date().toISOString();
    db.prepare("INSERT INTO rooms (id,code,host_id,guest_id,mode,status,data,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id,code,res.locals.user.id,null,parsed.data.mode,"waiting",JSON.stringify(data),created);
    res.status(201).json(view(byId(id)!,res.locals.user.id));
  });
  app.post("/api/rooms/join",auth,csrf,(req,res)=>{
    const parsed=roomJoinSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:"Введите код комнаты"});return;}
    const room=db.prepare("SELECT * FROM rooms WHERE code=?").get(parsed.data.code.toUpperCase()) as RoomRow|undefined;
    if(!room||room.host_id===res.locals.user.id||settle(room).status!=="waiting"){res.status(404).json({error:"Свободная комната не найдена"});return;}
    if(!joinRoom(room,res.locals.user.id)){res.status(404).json({error:"Приглашение недоступно"});return;}
    res.json(view(byId(room.id)!,res.locals.user.id));
  });
  app.post("/api/rooms/:id/accept",auth,csrf,(req,res)=>{
    const room=byId(String(req.params.id)),me=res.locals.user.id;
    if(!room||settle(room).status!=="waiting"||(JSON.parse(room.data) as RoomData).inviteeId!==me){res.status(404).json({error:"Приглашение не найдено"});return;}
    if(!joinRoom(room,me)){res.status(409).json({error:"Приглашение уже принято"});return;}
    res.json(view(byId(room.id)!,me));
  });
  app.post("/api/rooms/:id/ready",auth,csrf,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id);
    if(!room||settle(room).status!=="scheduled"){res.status(409).json({error:"Ожидание начала не найдено"});return;}
    const data=JSON.parse(room.data) as RoomData;data.ready??=[];
    if(!data.ready.includes(res.locals.user.id))data.ready.push(res.locals.user.id);
    db.prepare("UPDATE rooms SET data=? WHERE id=? AND status='scheduled'").run(JSON.stringify(data),room.id);room.data=JSON.stringify(data);
    res.json(view(settle(room),res.locals.user.id));
  });
  app.get("/api/rooms/:id",auth,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id);
    if(!room){res.status(404).json({error:"Комната не найдена"});return;}
    res.json(view(settle(room),res.locals.user.id));
  });
  app.post("/api/rooms/:id/messages",auth,csrf,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id),parsed=directMessageSchema.safeParse(req.body);
    if(!room){res.status(404).json({error:"Комната не найдена"});return;}
    if(settle(room).status!=="active"||room.mode!=="human"){res.status(409).json({error:"Текстовые реплики доступны только в парных переговорах"});return;}
    if(!parsed.success){res.status(400).json({error:"Введите реплику до 2000 символов"});return;}
    const count=(db.prepare("SELECT COUNT(*) AS n FROM room_messages WHERE room_id=?").get(room.id) as {n:number}).n;
    if(count>=300){res.status(409).json({error:"Лимит сообщений комнаты исчерпан"});return;}
    const message={id:randomUUID(),room_id:room.id,user_id:res.locals.user.id,text:parsed.data.text,created_at:new Date().toISOString()};
    db.prepare("INSERT INTO room_messages VALUES (?,?,?,?,?)").run(message.id,message.room_id,message.user_id,message.text,message.created_at);
    res.status(201).json(message);
  });
  app.post("/api/rooms/:id/finish",auth,csrf,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id);
    if(!room){res.status(404).json({error:"Комната не найдена"});return;}
    if(settle(room).status!=="active"){res.status(409).json({error:"Комната не активна"});return;}
    const parsed=roomFinishSchema.safeParse(req.body??{});
    if(!parsed.success){res.status(400).json({error:"Выберите корректный результат"});return;}
    const data=JSON.parse(room.data) as RoomData;
    if(data.done.includes(res.locals.user.id)){res.json(view(room,res.locals.user.id));return;}
    if(room.mode==="human"&&parsed.data.outcome){data.feedback??={};data.feedback[res.locals.user.id]=parsed.data.outcome;}
    data.done.push(res.locals.user.id);
    db.prepare("UPDATE rooms SET data=? WHERE id=?").run(JSON.stringify(data),room.id);room.data=JSON.stringify(data);
    res.json(view(settle(room),res.locals.user.id));
  });
  app.post("/api/rooms/:id/cancel",auth,csrf,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id);
    if(!room){res.status(404).json({error:"Комната не найдена"});return;}
    if(room.status!=="waiting"&&room.status!=="scheduled"&&room.status!=="active"){res.status(409).json({error:"Комната уже закрыта"});return;}
    if(room.status==="waiting"&&room.host_id!==res.locals.user.id){res.status(403).json({error:"Ожидающую комнату может отменить только создатель"});return;}
    db.prepare("UPDATE rooms SET status='cancelled' WHERE id=? AND status IN ('waiting','scheduled','active')").run(room.id);
    room.status="cancelled";res.json(view(room,res.locals.user.id));
  });
  app.post("/api/rooms/:id/signals",auth,csrf,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id),parsed=roomSignalSchema.safeParse(req.body);
    if(!room){res.status(404).json({error:"Комната не найдена"});return;}
    if(settle(room).status!=="active"||!room.guest_id||room.mode!=="human"){res.status(409).json({error:"Видеосвязь доступна только в парных переговорах"});return;}
    if(!parsed.success||JSON.stringify(parsed.data.data).length>20000){res.status(400).json({error:"Некорректный сигнал"});return;}
    const to=room.host_id===res.locals.user.id?room.guest_id:room.host_id;
    db.prepare("INSERT INTO room_signals VALUES (?,?,?,?,?,?,?)").run(randomUUID(),room.id,res.locals.user.id,to,parsed.data.kind,JSON.stringify(parsed.data.data),new Date().toISOString());
    res.status(201).json({ok:true});
  });
  app.get("/api/rooms/:id/signals",auth,(req,res)=>{
    const room=participant(String(req.params.id),res.locals.user.id);
    if(!room){res.status(404).json({error:"Комната не найдена"});return;}
    const after=Math.max(0,Number(req.query.after)||0);
    const rows=db.prepare("SELECT rowid AS cursor,kind,data FROM room_signals WHERE room_id=? AND to_user=? AND rowid>? ORDER BY rowid LIMIT 100").all(room.id,res.locals.user.id,after) as {cursor:number;kind:string;data:string}[];
    res.json(rows.map(row=>({cursor:row.cursor,kind:row.kind,data:JSON.parse(row.data)})));
  });
}
