import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { applyAction, assessment, chaosView, createSession, prepare, recommend, resolveChaos, validateScenario } from "../packages/domain/dist/index.js";

const scenarios = readdirSync("packages/content/scenarios").filter(x=>x.endsWith(".json")).map(name=>({...JSON.parse(readFileSync(`packages/content/scenarios/${name}`,"utf8")),version:1}));
test("all 15 authored scenarios have valid reachable transitions",()=>{
  assert.equal(scenarios.length,15);
  for(const scenario of scenarios) validateScenario(scenario);
});
test("every authored choice path finishes with bounded metrics",()=>{
  for(const scenario of scenarios){
    function walk(session,depth=0){
      assert.ok(depth<20,`Loop in ${scenario.id}`);
      if(session.status==="finished"){
        assert.ok(session.outcome?.verdict);
        assert.ok(Object.values(session.metrics).every(v=>v>=0&&v<=100));
        return;
      }
      const step=scenario.steps.find(s=>s.id===session.stepId);
      for(const option of step.options)walk(applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:option.id}),depth+1);
    }
    walk(prepare(createSession("tester",scenario),scenario,undefined,[]));
  }
});
test("actions score once, clamp metrics and produce an offline assessment",()=>{
  const scenario=scenarios.find(s=>s.id==="team_conflict_01");
  let session=prepare(createSession("user",scenario),scenario,undefined,[]);
  const first=scenario.steps[0].options[0];
  const action={requestId:crypto.randomUUID(),type:"say",optionId:first.id};
  session=applyAction(session,scenario,action);
  const score=session.metrics.trust;
  session=applyAction(session,scenario,action);
  assert.equal(session.metrics.trust,score);
  const second=scenario.steps.find(s=>s.id===session.stepId).options[0];
  session=applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:second.id});
  assert.equal(session.status,"finished");
  assert.equal(session.events.length,2);
  assert.equal(assessment(session,scenario).evidence.length,2);
  assert.equal(assessment(session,scenario).metricHistory.length,3);
  assert.deepEqual(assessment(session,scenario).metricHistory.at(-1),session.metrics);
  assert.equal(assessment(session,scenario).tki.reduce((sum,item)=>sum+item.count,0),assessment(session,scenario).tkiTagged);
  assert.equal(recommend([session],scenarios).basedOnSessionId,session.id);
});
test("unprepared material and client supplied metric effects are rejected",()=>{
  const scenario=scenarios[0];
  const session=prepare(createSession("user",scenario),scenario,undefined,[]);
  const option=scenario.steps[0].options[0];
  assert.throws(()=>applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"provide",optionId:option.id,itemId:"certificate"}),/не подготовлен/);
  assert.throws(()=>applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:"made-up",effects:{goal:100}}),/недоступен/);
});
test("a valid ending hint wins over the generic ending",()=>{
  const scenario={id:"hint",version:1,title:"Hint",context:"",roles:{player:"p",opponent:"o"},steps:[{id:"start",opponent_line:"",options:[{id:"a",text:"A",next:"end:special",effects:{goal:2}}]}],endings:[{id:"generic",condition:"true",verdict:"Generic",outcome:"good"},{id:"special",condition:"goal >= 42",verdict:"Special",outcome:"excellent"}]};
  validateScenario(scenario);
  const session=prepare(createSession("u",scenario),scenario,undefined,[]);
  assert.equal(applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:"a"}).outcome.id,"special");
});
test("local modifiers keep chaos, pressure and hidden goal server owned",()=>{
  const scenario=scenarios.find(item=>item.id==="hr_firing_01");
  let session=prepare(createSession("user",scenario,undefined,{hiddenGoal:true,chaos:true,pressureSeconds:30}),scenario,undefined,[]);
  session.stepStartedAt=new Date(Date.now()-31000).toISOString();
  const first=scenario.steps[0].options[0];
  session=applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:first.id});
  assert.equal(session.events[0].pressureExpired,true);
  assert.ok(session.pendingChaos);
  const publicChaos=chaosView(session);assert.equal(publicChaos.options.length,3);assert.equal("effects" in publicChaos.options[0],false);
  assert.throws(()=>applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:first.id}),/неожиданное/);
  const requestId=crypto.randomUUID();session=resolveChaos(session,requestId,0);assert.equal(session.chaosHistory.length,1);
  assert.equal(resolveChaos(session,requestId,0).chaosHistory.length,1);
  session.hiddenGuess=1;
  for(let i=0;i<12&&session.status!=="finished";i++){
    const option=scenario.steps.find(step=>step.id===session.stepId).options[0];
    session=applyAction(session,scenario,{requestId:crypto.randomUUID(),type:"say",optionId:option.id});
  }
  assert.equal(session.status,"finished");
  const result=assessment(session,scenario);assert.equal(result.hiddenGoal.ok,true);
  assert.equal(result.chaosHistory.length,1);assert.equal(result.pressureMisses,1);
  assert.equal(result.metricHistory.length,session.events.length+session.chaosHistory.length+1);
});
