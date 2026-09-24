import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { shopItemSchema, type Metrics } from "@arena/contracts";
import type { Session } from "@arena/domain";
import { db, xpFor } from "./store.js";
import { loadScenarios } from "./content.js";

type Requirement={label:string;value:number;target:number;done:boolean};
type Item={code:string;name:string;category:"avatar"|"frame"|"theme";cost:number;minXp?:number;minRank?:number;achievement?:string;skill?:string;trust75?:number;trust85?:number;goal85?:boolean;salesWins?:number;hardEq90?:number};
const scenarioMap=new Map(loadScenarios().map(item=>[item.id,item]));
const catalog:Item[]=[
  {code:"avatar_beginner",name:"Стратег-новичок",category:"avatar",cost:0},
  {code:"avatar_analyst",name:"Аналитик",category:"avatar",cost:0},
  {code:"avatar_diplomat",name:"Дипломат",category:"avatar",cost:0},
  {code:"avatar_manager",name:"Менеджер",category:"avatar",cost:0},
  {code:"avatar_researcher",name:"Исследователь",category:"avatar",cost:0},
  {code:"avatar_mediator",name:"Медиатор",category:"avatar",cost:0},
  {code:"avatar_hr",name:"Эксперт по людям",category:"avatar",cost:8},
  {code:"avatar_sales",name:"Мастер продаж",category:"avatar",cost:8},
  {code:"avatar_negotiator",name:"Переговорщик",category:"avatar",cost:8},
  {code:"avatar_deal",name:"Создатель сделок",category:"avatar",cost:8},
  {code:"avatar_market",name:"Знаток рынка",category:"avatar",cost:15,minXp:500},
  {code:"avatar_alternative",name:"Архитектор альтернатив",category:"avatar",cost:15,skill:"batna"},
  {code:"avatar_trust",name:"Хранитель доверия",category:"avatar",cost:15,trust75:5},
  {code:"avatar_sales_leader",name:"Лидер продаж",category:"avatar",cost:15,salesWins:5},
  {code:"avatar_master",name:"Мастер переговоров",category:"avatar",cost:30,minXp:1500,minRank:5},
  {code:"avatar_calm",name:"Спокойная сила",category:"avatar",cost:20,hardEq90:3},
  {code:"avatar_trust_master",name:"Мастер доверия",category:"avatar",cost:20,trust85:5},
  {code:"avatar_goal_master",name:"Мастер целей",category:"avatar",cost:20,goal85:true,skill:"batna"},
  {code:"frame_classic",name:"Классика",category:"frame",cost:0},
  {code:"frame_minimal",name:"Минимализм",category:"frame",cost:0},
  {code:"frame_violet",name:"Фиолетовое стекло",category:"frame",cost:5,minXp:250},
  {code:"frame_cyber",name:"Кибер",category:"frame",cost:7},
  {code:"frame_emerald",name:"Изумруд",category:"frame",cost:7,minXp:500},
  {code:"frame_electric",name:"Электричество",category:"frame",cost:8},
  {code:"frame_executive",name:"Руководитель",category:"frame",cost:10},
  {code:"frame_neon",name:"Неон",category:"frame",cost:12},
  {code:"frame_ice",name:"Ледяное спокойствие",category:"frame",cost:0,achievement:"cool_head"},
  {code:"frame_gold",name:"Золотая сделка",category:"frame",cost:0,achievement:"goal_achieved_90"},
  {code:"frame_diplomat",name:"Дипломат",category:"frame",cost:0,achievement:"trust_guard"},
  {code:"frame_grandmaster",name:"Грандмастер",category:"frame",cost:0,minRank:6},
  {code:"theme_arena",name:"Арена",category:"theme",cost:0},
  {code:"theme_slate",name:"Графит",category:"theme",cost:8},
  {code:"theme_midnight",name:"Полночь",category:"theme",cost:10},
  {code:"theme_aurora",name:"Аврора",category:"theme",cost:10},
  {code:"theme_emerald",name:"Изумруд",category:"theme",cost:12},
  {code:"theme_sunrise",name:"Рассвет",category:"theme",cost:15},
  {code:"theme_mastery",name:"Мастерство",category:"theme",cost:20,minRank:5},
  {code:"theme_research",name:"Исследователь переговоров",category:"theme",cost:0,minXp:3000},
];
const milestones=[{xp:100,stars:2},{xp:250,stars:3},{xp:500,stars:5},{xp:750,stars:5},{xp:1000,stars:5}];
const ranks=["Новичок","Практик","Переговорщик","Стратег","Мастер переговоров","Эксперт переговоров"];
const achievementDefs=[
  {code:"first_step",name:"Первый шаг",stars:1}, {code:"trust_guard",name:"Без потери доверия",stars:3},
  {code:"cool_head",name:"Холодная голова",stars:3}, {code:"conversation_owner",name:"Держу разговор",stars:3},
  {code:"goal_achieved_90",name:"Цель достигнута",stars:3}, {code:"role_switch",name:"Смена ролей",stars:3},
  {code:"chameleon",name:"Хамелеон",stars:5}, {code:"seen_it_all",name:"Видел всякое",stars:5},
  {code:"under_pressure",name:"Под давлением",stars:3}, {code:"steel_composure",name:"Стальная выдержка",stars:5},
  {code:"chaos_control",name:"Контроль хаоса",stars:4}, {code:"active_listener",name:"Активный слушатель",stars:3},
  {code:"batna_master",name:"Мастер BATNA",stars:5}, {code:"interest_explorer",name:"Исследователь интересов",stars:3},
  {code:"objective_case",name:"Аргумент по критериям",stars:3}, {code:"learning_start",name:"Учусь договариваться",stars:3},
];
const successful=new Set(["excellent","good","win_win","win","process_ok","goal_achieved","partial_success","exit"]);
const balance=(userId:string)=>(db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM star_ledger WHERE user_id=?").get(userId) as {n:number}).n;
const record=(userId:string,source:string,code:string,amount:number)=>db.prepare("INSERT OR IGNORE INTO star_ledger VALUES (?,?,?,?,?,?)").run(randomUUID(),userId,source,code,amount,new Date().toISOString());
const isSuccess=(session:Session)=>successful.has(session.outcome?.id??"");

export function awardScenarioProgress(session:Session){
  if(session.status!=="finished")return;
  const scenario=scenarioMap.get(session.scenarioId);
  const previous=(db.prepare("SELECT data FROM training_sessions WHERE user_id=? AND status='finished' AND id<>?").all(session.userId,session.id) as {data:string}[]).map(row=>JSON.parse(row.data) as Session);
  const same=previous.filter(item=>item.scenarioId===session.scenarioId).length;
  const cap=same===0?4:same===1?1:0;
  const critical=session.events.some(event=>Object.values(event.effects).some(value=>(value??0)<=-4));
  const useful=session.events.some(event=>(event.techniques??[]).some(value=>["активное слушание","эмпатия","объективные критерии","batna","вопросы","структура","spin"].includes(value.toLowerCase())));
  let quality=1;
  if(isSuccess(session)){
    quality=2;
    if(Object.values(session.metrics).every(value=>value>=75)&&!critical)quality=3;
    if(Object.values(session.metrics).every(value=>value>=80)&&!critical&&useful&&session.events.every(event=>event.metrics.trust>=45))quality=4;
  }
  record(session.userId,"session",session.id,Math.min(quality,cap));
  if(!isSuccess(session))return;
  const difficulty=scenario?.difficulty;
  const bonus=difficulty==="expert"?2:difficulty==="hard"?1:0;
  if(bonus)record(session.userId,"difficulty",session.id,bonus);
  if(!previous.some(item=>item.scenarioId===session.scenarioId))record(session.userId,"scenario",session.scenarioId,1);
  const role=scenario?.roles.player;
  if(role&&!previous.some(item=>scenarioMap.get(item.scenarioId)?.roles.player===role))record(session.userId,"role",role,2);
}

function completed(userId:string){return (db.prepare("SELECT data FROM training_sessions WHERE user_id=? AND status='finished'").all(userId) as {data:string}[]).map(row=>JSON.parse(row.data) as Session);}
function summary(sessions:Session[],xp:number,userId:string){
  const roles=new Set(sessions.map(item=>scenarioMap.get(item.scenarioId)?.roles.player).filter(Boolean));
  const scenarios=new Set(sessions.map(item=>item.scenarioId));
  const techniques=sessions.map(item=>new Set(item.events.flatMap(event=>(event.techniques??[]).map(value=>value.toLowerCase()))));
  const counted=(test:(session:Session)=>boolean)=>sessions.filter(test).length;
  const all=(minimum:number)=>counted(item=>Object.values(item.metrics).every(value=>value>=minimum));
  const skills=(name:string)=>techniques.filter(items=>items.has(name)).length;
  const learning=(db.prepare("SELECT COUNT(*) AS n FROM skill_rewards WHERE user_id=?").get(userId) as {n:number}).n;
  return {sessions:sessions.length,xp,wins:counted(isSuccess),trust50:counted(item=>item.metrics.trust>=50),trust75:counted(item=>item.metrics.trust>=75),trust85:counted(item=>item.metrics.trust>=85),goal85:counted(item=>item.metrics.goal>=85)>0,hardEq90:counted(item=>item.metrics.eq>=90&&["hard","expert"].includes(scenarioMap.get(item.scenarioId)?.difficulty??"")),salesWins:counted(item=>item.scenarioId==="sales_discount_01"&&isSuccess(item)),all60:all(60),all70:all(70),all80:all(80),roles:roles.size,scenarios:scenarios.size,conflicts:scenarios.size,harvard:techniques.some(items=>["batna","объективные критерии","эмпатия","сотрудничество"].some(value=>items.has(value))),highDifficulty:sessions.some(item=>["hard","expert"].includes(scenarioMap.get(item.scenarioId)?.difficulty??"")),learning,activeListening:skills("активное слушание"),batna:skills("batna"),interests:techniques.filter(items=>["вопросы","сотрудничество","эмпатия"].some(value=>items.has(value))).length,criteria:skills("объективные критерии"),chaosWins:counted(item=>isSuccess(item)&&Boolean(item.settings?.chaos)),pressureWins:counted(item=>isSuccess(item)&&Boolean(item.settings?.pressureSeconds))};
}
type Summary=ReturnType<typeof summary>;
const req=(label:string,value:number,target:number):Requirement=>({label,value,target,done:value>=target});
function requirements(rank:number,s:Summary):Requirement[]{
  if(rank===2)return [req("Завершённые переговоры",s.sessions,5),req("XP",s.xp,150),req("Сессии с доверием ≥ 50",s.trust50,3),req("Узлы дерева навыков",s.learning,1)];
  if(rank===3)return [req("Завершённые переговоры",s.sessions,15),req("XP",s.xp,350),req("Успешные исходы",s.wins,3),req("Роли",s.roles,2),req("Все метрики ≥ 60",s.all60,1)];
  if(rank===4)return [req("Завершённые переговоры",s.sessions,25),req("XP",s.xp,600),req("Успешные исходы",s.wins,7),req("Сценарии",s.scenarios,5),req("Роли",s.roles,3),req("Гарвардский метод",Number(s.harvard),1),req("Все метрики ≥ 70",s.all70,1)];
  if(rank===5)return [req("Завершённые переговоры",s.sessions,40),req("XP",s.xp,900),req("Успешные исходы",s.wins,12),req("Роли",s.roles,5),req("Сценарии",s.scenarios,8),req("Сессии со всеми метриками ≥ 70",s.all70,3),req("Высокая сложность",Number(s.highDifficulty),1),req("Узлы дерева навыков",s.learning,15)];
  if(rank===6)return [req("Завершённые переговоры",s.sessions,60),req("XP",s.xp,1400),req("Успешные исходы",s.wins,20),req("Роли",s.roles,6),req("Сценарии",s.scenarios,10),req("Типы ситуаций",s.conflicts,3),req("Все метрики ≥ 80",s.all80,1),req("Узлы дерева навыков",s.learning,27)];
  return [];
}
function rankFor(s:Summary){let rank=1;for(let candidate=2;candidate<=6;candidate++){if(requirements(candidate,s).every(item=>item.done))rank=candidate;else break;}return rank;}
function unlockedAchievements(s:Summary,sessions:Session[]){
  const checks:Record<string,boolean>={first_step:s.sessions>=1,trust_guard:sessions.some(item=>isSuccess(item)&&item.metrics.trust>=80),cool_head:sessions.some(item=>item.metrics.eq>=90),conversation_owner:sessions.some(item=>item.metrics.control>=90),goal_achieved_90:s.goal85,role_switch:s.roles>=3,chameleon:s.roles>=5,seen_it_all:s.conflicts>=5,under_pressure:s.pressureWins>0,steel_composure:sessions.some(item=>isSuccess(item)&&scenarioMap.get(item.scenarioId)?.difficulty==="expert"&&item.metrics.eq>=70),chaos_control:s.chaosWins>0,active_listener:s.activeListening>=5,batna_master:s.batna>=3,interest_explorer:s.interests>=5,objective_case:s.criteria>=5,learning_start:s.learning>=1};
  return achievementDefs.filter(item=>checks[item.code]);
}
function eligibility(item:Item,s:Summary,rank:number,achievements:Set<string>){
  const missing:string[]=[];
  if(item.minXp&&s.xp<item.minXp)missing.push(`${item.minXp} XP`);
  if(item.minRank&&rank<item.minRank)missing.push(`ранг ${ranks[item.minRank-1]}`);
  if(item.achievement&&!achievements.has(item.achievement))missing.push(`достижение «${achievementDefs.find(value=>value.code===item.achievement)?.name??item.achievement}»`);
  if(item.skill&&![...completedSkillNames(s)].includes(item.skill.toLowerCase()))missing.push(`приём ${item.skill}`);
  if(item.trust75&&s.trust75<item.trust75)missing.push(`доверие ≥ 75 в ${item.trust75} миссиях`);
  if(item.trust85&&s.trust85<item.trust85)missing.push(`доверие ≥ 85 в ${item.trust85} миссиях`);
  if(item.goal85&&!s.goal85)missing.push("цель ≥ 85");
  if(item.salesWins&&s.salesWins<item.salesWins)missing.push(`${item.salesWins} побед в продажах`);
  if(item.hardEq90&&s.hardEq90<item.hardEq90)missing.push(`EQ ≥ 90 в ${item.hardEq90} сложных миссиях`);
  return missing;
}
// Skill flags needed by catalog are derived from authored turns, never supplied by a client.
function completedSkillNames(s:Summary){return new Set([...(s.batna>0?["batna"]:[]),...(s.criteria>0?["объективные критерии"]:[])]);}
function sync(userId:string){
  const xp=xpFor(userId);
  for(const milestone of milestones)if(xp>=milestone.xp)record(userId,"milestone",String(milestone.xp),milestone.stars);
  for(const code of ["avatar_beginner","frame_classic","theme_arena"])db.prepare("INSERT OR IGNORE INTO inventory VALUES (?,?,?)").run(userId,code,new Date().toISOString());
  const sessions=completed(userId),s=summary(sessions,xp,userId);
  for(const item of unlockedAchievements(s,sessions))record(userId,"achievement",item.code,item.stars);
  return {s,sessions};
}
function stats(userId:string){
  const {s}=sync(userId),rank=rankFor(s);
  const achievementRows=db.prepare("SELECT code,amount,created_at FROM star_ledger WHERE user_id=? AND source='achievement' ORDER BY created_at").all(userId) as {code:string;amount:number;created_at:string}[];
  const achievementDetails=achievementRows.map(row=>({code:row.code,name:achievementDefs.find(item=>item.code===row.code)?.name??row.code,stars:row.amount,earnedAt:row.created_at}));
  const achievements=achievementDetails.map(item=>item.name);
  const owned=(db.prepare("SELECT item_code FROM inventory WHERE user_id=?").all(userId) as {item_code:string}[]).map(row=>row.item_code);
  const equipment=Object.fromEntries((db.prepare("SELECT category,item_code FROM equipment WHERE user_id=?").all(userId) as {category:string;item_code:string}[]).map(row=>[row.category,row.item_code]));
  const ledger=db.prepare("SELECT source,code,amount,created_at FROM star_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(userId);
  return {xp:s.xp,rank:ranks[rank-1],rankLevel:rank,nextRank:rank<6?{name:ranks[rank],xp:requirements(rank+1,s).find(item=>item.label==="XP")?.target??0,requirements:requirements(rank+1,s)}:null,stars:balance(userId),achievements,achievementDetails,completed:s.sessions,levels:(db.prepare("SELECT COUNT(*) AS n FROM learning_progress WHERE user_id=?").get(userId) as {n:number}).n,lessons:(db.prepare("SELECT COUNT(*) AS n FROM theory_progress WHERE user_id=? AND json_extract(data,'$.completed')=1").get(userId) as {n:number}).n,owned,equipment:{avatar:equipment.avatar??"avatar_beginner",frame:equipment.frame??"frame_classic",theme:equipment.theme??"theme_arena"},catalog:catalog.map(item=>({...item,minXp:item.minXp??0,requirements:eligibility(item,s,rank,new Set(achievementDetails.map(value=>value.code))),unlocked:eligibility(item,s,rank,new Set(achievementDetails.map(value=>value.code))).length===0})),ledger};
}
export function registerProgressionRoutes(app:Express,auth:RequestHandler,csrf:RequestHandler){
  app.get("/api/progression",auth,(_req,res)=>res.json(stats(res.locals.user.id)));
  app.post("/api/shop/purchase",auth,csrf,(req,res)=>{
    const parsed=shopItemSchema.safeParse(req.body),item=parsed.success?catalog.find(value=>value.code===parsed.data.itemCode):undefined;
    if(!item){res.status(404).json({error:"Предмет не найден"});return;}
    const userId=res.locals.user.id,current=stats(userId),view=current.catalog.find(value=>value.code===item.code)!;
    if(!view.unlocked){res.status(403).json({error:`Не выполнены условия: ${view.requirements.join(", ")}`});return;}
    if(current.owned.includes(item.code)){res.status(409).json({error:"Предмет уже получен"});return;}
    db.exec("BEGIN IMMEDIATE");
    try{
      if(balance(userId)<item.cost){db.exec("ROLLBACK");res.status(409).json({error:"Недостаточно звёзд"});return;}
      db.prepare("INSERT INTO inventory VALUES (?,?,?)").run(userId,item.code,new Date().toISOString());
      if(item.cost)record(userId,"purchase",item.code,-item.cost);
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
