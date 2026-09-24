import type { Metrics, TrainingAction } from "@arena/contracts";
import { chaosEvents } from "./chaos.js";

export type Option = { id: string; text: string; next: string; effects: Partial<Metrics>; comment?: string; alternative?: string; techniques?: string[]; tki?: string };
export type Step = { id: string; opponent_line: string; hint?: string; options: Option[] };
export type Scenario = { id: string; version: number; title: string; context: string; roles: {player: string; opponent: string}; player_goal?: string; goal?: string; opponent_goal?:string; hidden_goal?:{text:string;options:string[];correct:number}; category?: string; difficulty?: string; minutes?: number; skills?: string[]; initial_metrics?: Metrics; steps: Step[]; endings?: {id: string; condition: string; verdict: string; outcome: string}[] };
export type Event = { requestId: string; type: TrainingAction["type"]; optionId: string; text: string; stepId: string; effects: Partial<Metrics>; metrics: Metrics; comment: string; alternative?: string; techniques?: string[]; tki?: string; pressureExpired?:boolean; at: string };
export type SessionSettings={hiddenGoal:boolean;chaos:boolean;pressureSeconds?:30|60};
export type ChaosResult={requestId:string;eventId:string;optionIndex:number;text:string;effects:Partial<Metrics>;metrics:Metrics;at:string};
export type Session = { id: string; userId: string; scenarioId: string; scenarioVersion: number; rubricVersion: number; status: "preparing" | "active" | "finished"; stepId: string; metrics: Metrics; prepared: { goal: string; itemIds: string[] }; events: Event[]; outcome?: { id: string; verdict: string }; retryOf?: string; createdAt: string;settings?:SessionSettings;stepStartedAt?:string;pendingChaos?:string;chaosHistory?:ChaosResult[];hiddenGuess?:number };

export const METRIC_LABELS: Record<keyof Metrics, string> = {trust: "Доверие", goal: "Достижение цели", control: "Управление разговором", eq: "EQ"};
export const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
export function validateScenario(s: Scenario): void {
  if (!s.id || !Number.isInteger(s.version) || s.version<1 || !s.steps.length) throw Error("Сценарий без версии или шагов");
  const ids = new Set(s.steps.map(step => step.id));
  if (ids.size !== s.steps.length) throw Error(`Повтор шага в ${s.id}`);
  for (const step of s.steps) {
    if (!step.options.length) throw Error(`Пустой шаг ${step.id}`);
    const options = new Set<string>();
    for (const option of step.options) {
      if (options.has(option.id)) throw Error(`Повтор варианта ${option.id}`);
      options.add(option.id);
      if (!option.next.startsWith("end:") && !ids.has(option.next)) throw Error(`Сломанный переход ${option.next}`);
    }
  }
  const seen = new Set<string>();
  const visit = (id: string) => { if (seen.has(id)) return; seen.add(id); for (const o of s.steps.find(step => step.id === id)!.options) if (!o.next.startsWith("end:")) visit(o.next); };
  visit(s.steps[0].id);
  if (seen.size !== ids.size) throw Error(`Недостижимый шаг в ${s.id}`);
  const reachesEnd = (id:string, visiting = new Set<string>()):boolean => {
    if (visiting.has(id)) return false;
    const path = new Set(visiting); path.add(id);
    return s.steps.find(step=>step.id===id)!.options.some(o=>o.next.startsWith("end:") || reachesEnd(o.next,path));
  };
  for (const id of ids) if (!reachesEnd(id)) throw Error(`Из шага ${id} нет концовки`);
}
export function createSession(userId: string, scenario: Scenario, retryOf?: string, settings?:SessionSettings): Session {
  return { id: crypto.randomUUID(), userId, scenarioId: scenario.id, scenarioVersion: scenario.version, rubricVersion: settings?2:1,
    status: "preparing", stepId: scenario.steps[0].id, metrics: structuredClone(scenario.initial_metrics ?? {trust:50,goal:40,control:50,eq:50}),
    prepared: { goal: scenario.player_goal ?? scenario.goal ?? "", itemIds: [] }, events: [], retryOf, createdAt: new Date().toISOString(),settings };
}
export function availableItems(s: Scenario) {
  if (s.id.includes("salary")) return [{ id: "results", title: "Результаты и цифры", description: "Подготовить вклад и рыночные ориентиры" }];
  if (s.id.includes("interview")) return [{ id: "certificate", title: "Условная карточка обучения", description: "Учебный реквизит, не подтверждение квалификации" }];
  return [{ id: "notes", title: "Краткие заметки", description: "Записать интересы и вопросы" }];
}
export function prepare(session: Session, scenario: Scenario, goal: string | undefined, items: string[]): Session {
  if (session.status !== "preparing") throw Error("Подготовка уже завершена");
  const allowed = new Set(availableItems(scenario).map(i => i.id));
  if (items.some(i => !allowed.has(i))) throw Error("Неизвестный материал");
  return { ...session, status: "active", stepStartedAt:new Date().toISOString(),prepared: { goal: goal?.trim() || session.prepared.goal, itemIds: [...new Set(items)] } };
}
function ending(scenario: Scenario, metrics: Metrics, hint?:string) {
  const matches = (condition: string) => {
    if (condition === "true") return true;
    return condition.split("&&").every(part => {
      const m = part.trim().match(/^(trust|goal|control|eq)\s*(>=|<=|>|<|==)\s*(\d+)$/);
      if (!m) return false;
      const left = metrics[m[1] as keyof Metrics], right = Number(m[3]);
      return {">=":left>=right,"<=":left<=right,">":left>right,"<":left<right,"==":left===right}[m[2]];
    });
  };
  const hinted = scenario.endings?.find(e=>e.id===hint && matches(e.condition));
  return hinted ?? scenario.endings?.find(e => matches(e.condition)) ?? {id:"finished",verdict:"Разговор завершён. Разберите решения и попробуйте снова.",outcome:"partial"};
}
export function applyAction(session: Session, scenario: Scenario, action: TrainingAction): Session {
  if (session.status !== "active") throw Error("Сессия не активна");
  if (session.events.some(event => event.requestId === action.requestId)) return session;
  if(session.pendingChaos)throw Error("Сначала выберите реакцию на неожиданное событие");
  const step = scenario.steps.find(s => s.id === session.stepId);
  const option = step?.options.find(o => o.id === action.optionId);
  if (!step || !option) throw Error("Вариант недоступен на этом шаге");
  if (action.type === "provide" && (!action.itemId || !session.prepared.itemIds.includes(action.itemId))) throw Error("Материал не подготовлен");
  const pressureExpired=Boolean(session.settings?.pressureSeconds&&session.stepStartedAt&&Date.now()-Date.parse(session.stepStartedAt)>session.settings.pressureSeconds*1000);
  const effects={...option.effects};if(pressureExpired){effects.control=(effects.control??0)-2;effects.eq=(effects.eq??0)-1;}
  const metrics = { ...session.metrics };
  for (const key of Object.keys(metrics) as (keyof Metrics)[]) metrics[key] = clamp(metrics[key] + (effects[key] ?? 0));
  const event: Event = { requestId: action.requestId, type: action.type, optionId: option.id, text: option.text,
    stepId: step.id, effects, metrics, comment: (option.comment ?? "Решение повлияло на ход разговора.")+(pressureExpired?" Время на ответ истекло: контроль и EQ снижены.":""), alternative: option.alternative, techniques:option.techniques, tki:option.tki, pressureExpired, at: new Date().toISOString() };
  const finished = option.next.startsWith("end:");
  const result = finished ? ending(scenario, metrics, option.next.split(":",2)[1]) : undefined;
  const eventIndex=session.events.length;
  const pendingChaos=!finished&&session.settings?.chaos&&eventIndex===0?chaosEvents[Array.from(session.id).reduce((sum,char)=>sum+char.charCodeAt(0),0)%chaosEvents.length].id:undefined;
  return { ...session, metrics, stepId: finished ? session.stepId : option.next,stepStartedAt:new Date().toISOString(),pendingChaos,
    events: [...session.events, event], status: finished ? "finished" : "active", outcome: result ? { id: result.id, verdict: result.verdict } : undefined };
}
export function chaosView(session:Session){
  const event=chaosEvents.find(item=>item.id===session.pendingChaos);
  return event?{id:event.id,text:event.text,options:event.options.map((option,index)=>({index,text:option.text}))}:null;
}
export function resolveChaos(session:Session,requestId:string,optionIndex:number):Session{
  if(session.chaosHistory?.some(item=>item.requestId===requestId))return session;
  if(session.status!=="active"||!session.pendingChaos)throw Error("Неожиданного события сейчас нет");
  const event=chaosEvents.find(item=>item.id===session.pendingChaos)!;
  const option=event.options[optionIndex];if(!option)throw Error("Неизвестная реакция");
  const effects={...event.effects};for(const key of Object.keys(option.effects) as (keyof Metrics)[])effects[key]=(effects[key]??0)+(option.effects[key]??0);
  const metrics={...session.metrics};for(const key of Object.keys(metrics) as (keyof Metrics)[])metrics[key]=clamp(metrics[key]+(effects[key]??0));
  const result:ChaosResult={requestId,eventId:event.id,optionIndex,text:option.text,effects,metrics,at:new Date().toISOString()};
  return {...session,metrics,pendingChaos:undefined,stepStartedAt:new Date().toISOString(),chaosHistory:[...(session.chaosHistory??[]),result]};
}
export function assessment(session: Session, scenario: Scenario) {
  if (session.status !== "finished") throw Error("Отчёт пока недоступен");
  const weak = session.events.find(e => Object.values(e.effects).some(v => (v ?? 0) < 0));
  const focus = weak ? "Уточнение интересов" : (scenario.skills?.[0] ?? "Подготовка");
  const styles=["сотрудничество","конкуренция","компромисс","избегание","приспособление"];
  const tagged=session.events.filter(event=>event.tki);
  const tki=styles.map(style=>({style,count:tagged.filter(event=>event.tki===style).length,percent:tagged.length?Math.round(100*tagged.filter(event=>event.tki===style).length/tagged.length):0}));
  const mistakes=session.events.filter(event=>Object.values(event.effects).some(value=>(value??0)<0)).map(event=>({stepId:event.stepId,text:event.text,comment:event.comment,alternative:event.alternative??null}));
  const techniques=[...new Set(session.events.flatMap(event=>event.techniques??[]))];
  const timeline=[...session.events.map(event=>({at:event.at,metrics:event.metrics})),...(session.chaosHistory??[]).map(event=>({at:event.at,metrics:event.metrics}))].sort((a,b)=>a.at.localeCompare(b.at));
  const hiddenGoal=session.settings?.hiddenGoal&&scenario.hidden_goal?{guessed:session.hiddenGuess??null,correctText:scenario.hidden_goal.options[scenario.hidden_goal.correct],ok:session.hiddenGuess===scenario.hidden_goal.correct}:null;
  const harvard={batna:techniques.some(value=>value.toLowerCase()==="batna"),objectiveCriteria:techniques.includes("объективные критерии"),interests:techniques.some(value=>["эмпатия","сотрудничество","вопросы"].includes(value))};
  const recommendations=[...(session.metrics.trust<60?["Вернитесь к эмпатии и отделению человека от проблемы."]:[]),...(session.metrics.goal<60?["Назовите запасной вариант и объективные критерии договорённости."]:[]),...(session.metrics.control<50?["Задавайте открытые вопросы и удерживайте структуру встречи."]:[]),...(session.metrics.eq<55?["Отразите эмоцию собеседника до обсуждения условий."]:[])].slice(0,3);
  return { mode: "scenario", rubricVersion: session.rubricVersion, scenarioVersion: session.scenarioVersion,
    outcome: session.outcome, metrics: session.metrics, evidence: session.events,
    metricHistory:[scenario.initial_metrics??{trust:50,goal:40,control:50,eq:50},...timeline.map(event=>event.metrics)],tki,tkiTagged:tagged.length,
    techniques,mistakes,preparedGoal:session.prepared.goal,hiddenGoal,harvard,recommendations,chaosHistory:session.chaosHistory??[],pressureMisses:session.events.filter(event=>event.pressureExpired).length,
    mainFinding: weak ? weak.comment : "Вы удержали разговор в конструктивном русле.",
    confidence: "rule_based", next: { skill: focus, exercise: weak ? "Переформулируйте сложную реплику как вопрос об интересах другой стороны." : "Назовите один критерий успешной договорённости.", retryScenarioId: scenario.id } };
}
export function recommend(sessions: Session[], scenarios: Scenario[]) {
  const active = sessions.find(s => s.status !== "finished");
  const latest = sessions.find(s => s.status === "finished");
  const scenario = scenarios.find(s => s.id === latest?.scenarioId) ?? scenarios.find(s => s.id === "team_conflict_01") ?? scenarios[0];
  const previous = latest ? assessment(latest, scenario) : null;
  return { mission: { id: scenario.id, title: scenario.title, minutes: scenario.minutes ?? 7, skill: previous?.next.skill ?? scenario.skills?.[0] ?? "Уточнение интересов" },
    reason: previous ? `Прошлый вывод: ${previous.mainFinding} Попробуйте другой подход.` : "Начните с короткой сценарной диагностики без ИИ.",
    continueSessionId: active?.id ?? null, basedOnSessionId: latest?.id ?? null };
}
