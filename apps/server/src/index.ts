import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import argon2 from "argon2";
import { actionSchema, prepareSchema, sessionSchema } from "@arena/contracts";
import { applyAction, assessment, availableItems, createSession, prepare, recommend } from "@arena/domain";
import { loadScenarios } from "./content.js";
import { addUser, authByToken, createAuthSession, earnedXp, getSession, listSessions, revokeToken, saveAction, saveExercise, saveSession, userByEmail, userById, userCount, xpFor } from "./store.js";

const scenarios = loadScenarios();
const byId = new Map(scenarios.map(s => [s.id, s]));
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
const online = process.env.ARENA_MODE === "site";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: online, maxAge: 7 * 86400000, path: "/" };
const failures = new Map<string, { count:number; until:number }>();
function limitLogin(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}:${String(req.body?.login ?? req.body?.email ?? "").toLowerCase()}`;
  const prior = failures.get(key);
  if (prior && prior.count >= 8 && prior.until > Date.now()) { res.status(429).json({error:"Слишком много попыток. Попробуйте позже."}); return; }
  res.locals.loginKey = key; next();
}
function failure(key:string) { const old=failures.get(key); failures.set(key,{count:(old?.count ?? 0)+1,until:Date.now()+15*60000}); }
function auth(req:Request,res:Response,next:NextFunction) {
  const token = req.cookies?.arena_session;
  const row = typeof token === "string" ? authByToken(token) : undefined;
  const user = row && userById(row.user_id);
  if (!row || !user) { res.status(401).json({error:"Требуется вход"}); return; }
  res.locals.user = user; res.locals.csrf = row.csrf; next();
}
function csrf(req:Request,res:Response,next:NextFunction) {
  if (req.get("x-csrf-token") !== res.locals.csrf) { res.status(403).json({error:"Обновите страницу и повторите действие"}); return; }
  const origin = req.get("origin");
  if (online && origin && origin !== process.env.ARENA_PUBLIC_ORIGIN) { res.status(403).json({error:"Недопустимый источник запроса"}); return; }
  next();
}
const route = (fn:(req:Request,res:Response)=>Promise<void>|void) => (req:Request,res:Response,next:NextFunction) => Promise.resolve(fn(req,res)).catch(next);
app.get("/api/health", (_req,res) => res.json({ok:true,mode:online?"site":"local",scenarioCount:scenarios.length}));
app.get("/api/auth/status", (_req,res) => res.json({needsOwner:!online && userCount()===0, mode:online?"site":"local"}));
app.post("/api/auth/register", limitLogin, route(async(req,res) => {
  const email=String(req.body?.email??"").trim().toLowerCase(), password=String(req.body?.password??"");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<12 || password.length>128) { res.status(400).json({error:"Введите email и пароль от 12 до 128 символов"}); return; }
  if (userByEmail(email)) { res.status(409).json({error:"Адрес уже используется"}); return; }
  const user=addUser(email,await argon2.hash(password,{type:argon2.argon2id}));
  const session=createAuthSession(user.id);
  res.cookie("arena_session",session.token,cookieOptions).status(201).json({user:{id:user.id,email:user.email,role:user.role},csrf:session.csrf});
}));
app.post("/api/auth/login",limitLogin,route(async(req,res) => {
  const user=userByEmail(String(req.body?.login??req.body?.email??""));
  const valid=user && await argon2.verify(user.password_hash,String(req.body?.password??""));
  if (!valid) { failure(res.locals.loginKey); res.status(401).json({error:"Неверный логин или пароль"}); return; }
  failures.delete(res.locals.loginKey);
  const session=createAuthSession(user.id);
  res.cookie("arena_session",session.token,cookieOptions).json({user:{id:user.id,email:user.email,role:user.role},csrf:session.csrf});
}));
app.get("/api/me",auth,(req,res)=>res.json({user:{id:res.locals.user.id,email:res.locals.user.email,role:res.locals.user.role},csrf:res.locals.csrf,xp:xpFor(res.locals.user.id)}));
app.post("/api/auth/logout",auth,csrf,(req,res)=>{revokeToken(req.cookies.arena_session);res.clearCookie("arena_session",{path:"/"}).json({ok:true});});
app.get("/api/scenarios",auth,(_req,res)=>res.json(scenarios.map(s=>({id:s.id,title:s.title,context:s.context,goal:s.player_goal??s.goal,category:s.category??"Практика",difficulty:s.difficulty,minutes:s.minutes??7,skills:s.skills??[],version:s.version}))));
app.get("/api/me/today",auth,(_req,res)=>res.json(recommend(listSessions(res.locals.user.id),scenarios)));
app.get("/api/me/progress",auth,(_req,res)=>{const sessions=listSessions(res.locals.user.id);res.json({xp:xpFor(res.locals.user.id),completed:sessions.filter(s=>s.status==="finished").length,sessions:sessions.map(s=>({id:s.id,title:byId.get(s.scenarioId)?.title,status:s.status,metrics:s.metrics,createdAt:s.createdAt}))});});
app.post("/api/sessions",auth,csrf,(req,res)=>{const input=sessionSchema.safeParse(req.body);const scenario=input.success&&byId.get(input.data.scenarioId);if(!input.success||!scenario){res.status(400).json({error:"Неизвестная миссия"});return;}
  const retry=input.data.retryOf?getSession(input.data.retryOf,res.locals.user.id):undefined;
  if(input.data.retryOf&&(!retry||retry.scenarioId!==scenario.id)){res.status(400).json({error:"Повтор недоступен"});return;}
  const session=createSession(res.locals.user.id,scenario,retry?.id);saveSession(session);res.status(201).json({session,scenario:{id:scenario.id,title:scenario.title,context:scenario.context,roles:scenario.roles},items:availableItems(scenario)});
});
app.get("/api/sessions/:id",auth,(req,res)=>{const session=getSession(String(req.params.id),res.locals.user.id);if(!session){res.status(404).json({error:"Сессия не найдена"});return;}
  const scenario=byId.get(session.scenarioId)!;const step=scenario.steps.find(s=>s.id===session.stepId);
  res.json({session,scenario:{id:scenario.id,title:scenario.title,context:scenario.context,roles:scenario.roles},step:session.status==="active"?step:null,items:availableItems(scenario)});
});
app.post("/api/sessions/:id/prepare",auth,csrf,(req,res)=>{const session=getSession(String(req.params.id),res.locals.user.id),input=prepareSchema.safeParse(req.body);if(!session){res.status(404).json({error:"Сессия не найдена"});return;}if(!input.success){res.status(400).json({error:"Проверьте подготовку"});return;}
  try{const updated=prepare(session,byId.get(session.scenarioId)!,input.data.goal,input.data.itemIds);saveSession(updated);res.json({session:updated});}catch(e){res.status(409).json({error:(e as Error).message});}
});
app.post("/api/sessions/:id/actions",auth,csrf,(req,res)=>{const session=getSession(String(req.params.id),res.locals.user.id),input=actionSchema.safeParse(req.body);if(!session){res.status(404).json({error:"Сессия не найдена"});return;}if(!input.success){res.status(400).json({error:"Некорректное действие"});return;}
  if(session.events.some(e=>e.requestId===input.data.requestId)){res.json({session,replayed:true});return;}
  try{const updated=applyAction(session,byId.get(session.scenarioId)!,input.data);saveAction(updated);const step=byId.get(session.scenarioId)!.steps.find(s=>s.id===updated.stepId);res.json({session:updated,step:updated.status==="active"?step:null,consequence:updated.events.at(-1)?.comment});}catch(e){res.status(409).json({error:(e as Error).message});}
});
app.get("/api/sessions/:id/report",auth,(req,res)=>{const session=getSession(String(req.params.id),res.locals.user.id);if(!session){res.status(404).json({error:"Отчёт не найден"});return;}try{res.json({assessment:assessment(session,byId.get(session.scenarioId)!),xp:xpFor(res.locals.user.id),earnedXp:earnedXp(session.id),retryOf:session.retryOf});}catch{res.status(409).json({error:"Завершите миссию для отчёта"});}});
app.post("/api/sessions/:id/exercise",auth,csrf,(req,res)=>{const session=getSession(String(req.params.id),res.locals.user.id),answer=String(req.body?.answer??"").trim();if(!session||session.status!=="finished"){res.status(404).json({error:"Упражнение не найдено"});return;}if(answer.length<10||answer.length>1000){res.status(400).json({error:"Напишите ответ от 10 до 1000 символов"});return;}saveExercise(res.locals.user.id,session.id,answer);res.json({ok:true,feedback:"Ответ сохранён. Сравните его со своим прошлым решением и попробуйте миссию снова."});});
app.use("/api",(_req,res)=>res.status(404).json({error:"API пока не реализован"}));
const web=resolve("apps/web/dist");
if(existsSync(web)){app.use(express.static(web));app.get(/.*/,(req,res)=>res.sendFile(resolve(web,"index.html")));}
app.use((err:Error,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);res.status(500).json({error:"Внутренняя ошибка сервера"});});
const port=Number(process.env.PORT??3000),host=process.env.HOST??"127.0.0.1";
app.listen(port,host,()=>console.log(`Arena: http://${host}:${port} (${scenarios.length} scenarios)`));
