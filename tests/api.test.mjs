import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

function freePort(){return new Promise(resolve=>{const s=createServer();s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
test("register, protect resources, finish mission, exercise, and reward exactly once",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-test-")),port=await freePort(),base=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:join(dir,"test.db")},stdio:"pipe"});
  let cookie="",csrf="";
  async function request(path,method="GET",body,asUser=true){const res=await fetch(base+"/api"+path,{method,headers:{...(body?{"content-type":"application/json"}:{}),...(asUser&&cookie?{cookie}:{}),...(asUser&&csrf&&method!=="GET"?{"x-csrf-token":csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),res};}
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{const r=await request("/health");if(r.status===200)break;}catch{}await new Promise(r=>setTimeout(r,70));}
    const page=await fetch(base);assert.equal(page.status,200);assert.ok(page.headers.get("content-security-policy"));
    assert.equal((await request("/me/today")).status,401);
    const registered=await request("/auth/register","POST",{email:"test@example.test",password:"a-long-test-password"},false);
    assert.equal(registered.status,201);assert.equal(registered.data.user.role,"participant");cookie=registered.res.headers.get("set-cookie").split(";")[0];csrf=registered.data.csrf;
    const scenarios=await request("/scenarios");assert.equal(scenarios.data.length,15);
    const today=await request("/me/today");assert.equal(today.status,200);
    const created=await request("/sessions","POST",{scenarioId:today.data.mission.id});assert.equal(created.status,201);
    const id=created.data.session.id;
    assert.equal((await request(`/sessions/${id}/report`)).status,409);
    assert.equal((await request(`/sessions/${id}`,"GET",undefined,false)).status,401);
    assert.equal((await request(`/sessions/${id}/prepare`,"POST",{itemIds:[]},false)).status,401);
    const prepared=await request(`/sessions/${id}/prepare`,"POST",{itemIds:[]});assert.equal(prepared.data.session.status,"active");
    for(let i=0;i<12;i++){
      const current=await request(`/sessions/${id}`);if(current.data.session.status==="finished")break;
      const option=current.data.step.options[0],requestId=crypto.randomUUID();
      const action=await request(`/sessions/${id}/actions`,"POST",{requestId,type:"say",optionId:option.id,effects:{goal:100}});assert.equal(action.status,200);
      const replay=await request(`/sessions/${id}/actions`,"POST",{requestId,type:"say",optionId:option.id});assert.equal(replay.data.replayed,true);
    }
    const report=await request(`/sessions/${id}/report`);assert.equal(report.status,200);assert.equal(report.data.earnedXp,25);
    assert.ok(report.data.assessment.evidence.length>0);
    assert.equal(report.data.assessment.metricHistory.length,report.data.assessment.evidence.length+1);
    assert.equal(report.data.assessment.tki.reduce((sum,item)=>sum+item.count,0),report.data.assessment.tkiTagged);
    assert.equal((await request(`/sessions/${id}/exercise`,"POST",{answer:"Я уточню интересы другой стороны."})).status,200);
    assert.equal((await request("/me/progress")).data.xp,25);
    assert.equal((await request("/me/today")).data.basedOnSessionId,id);
    const activity=await request("/me/activity?type=scenario&state=finished");assert.equal(activity.status,200);
    assert.ok(activity.data.some(item=>item.id===id&&item.href===`/sessions/${id}/report`));
    const profile=await request("/me/profile");assert.equal(profile.status,200);assert.equal(profile.data.email,"test@example.test");assert.ok(profile.data.completedMissions>=1);
    assert.equal((await request("/me/profile","GET",undefined,false)).status,401);
    assert.equal((await request("/me/activity?type=invalid")).status,400);
    assert.equal((await request("/me/activity","GET",undefined,false)).status,401);
    const personal=await request("/sessions","POST",{scenarioId:"agency_brief_01"});
    const personalId=personal.data.session.id;
    await request(`/sessions/${personalId}/prepare`,"POST",{itemIds:[]});
    await request(`/sessions/${personalId}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:"push"});
    for(let i=0;i<12;i++){const current=await request(`/sessions/${personalId}`);if(current.data.session.status==="finished")break;await request(`/sessions/${personalId}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:current.data.step.options[0].id});}
    const errors=await request("/me/errors");assert.equal(errors.status,200);assert.ok(errors.data.some(item=>item.sessionId===personalId));
    assert.equal((await request("/me/errors","GET",undefined,false)).status,401);
    const daily=await request("/me/daily");assert.equal(daily.status,200);assert.equal(daily.data.rewardStars,2);
    if(!daily.data.completed){
      const challenge=await request("/sessions","POST",{scenarioId:daily.data.scenario.id});
      await request(`/sessions/${challenge.data.session.id}/prepare`,"POST",{itemIds:[]});
      for(let i=0;i<12;i++){const current=await request(`/sessions/${challenge.data.session.id}`);if(current.data.session.status==="finished")break;await request(`/sessions/${challenge.data.session.id}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:current.data.step.options[0].id});}
      assert.equal((await request("/me/daily")).data.completed,true);
    }
    const firstDailyLedger=(await request("/progression")).data.ledger.filter(item=>item.source==="daily"&&item.code===daily.data.date);
    assert.equal(firstDailyLedger.length,1);
    const repeat=await request("/sessions","POST",{scenarioId:daily.data.scenario.id});
    await request(`/sessions/${repeat.data.session.id}/prepare`,"POST",{itemIds:[]});
    for(let i=0;i<12;i++){const current=await request(`/sessions/${repeat.data.session.id}`);if(current.data.session.status==="finished")break;await request(`/sessions/${repeat.data.session.id}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:current.data.step.options[0].id});}
    assert.equal((await request("/progression")).data.ledger.filter(item=>item.source==="daily"&&item.code===daily.data.date).length,1);
    const challengeSession=await request("/sessions","POST",{scenarioId:"hr_firing_01",hiddenGoal:true,chaos:true,pressureSeconds:30});
    assert.equal(challengeSession.status,201);
    const challengeId=challengeSession.data.session.id;
    await request(`/sessions/${challengeId}/prepare`,"POST",{itemIds:[]});
    let challengeView=await request(`/sessions/${challengeId}`);
    assert.equal(challengeView.data.hiddenOptions.length,4);
    assert.equal(JSON.stringify(challengeView.data).includes('"correct"'),false);
    assert.equal((await request(`/sessions/${challengeId}/hidden-guess`,"POST",{optionIndex:1})).status,200);
    await request(`/sessions/${challengeId}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:challengeView.data.step.options[0].id});
    challengeView=await request(`/sessions/${challengeId}`);assert.ok(challengeView.data.chaos);
    assert.equal((await request(`/sessions/${challengeId}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:challengeView.data.step.options[0].id})).status,409);
    assert.equal((await request(`/sessions/${challengeId}/chaos`,"POST",{requestId:crypto.randomUUID(),optionIndex:0})).status,200);
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});

test("demo email can sign in and resets on restart while pinggos remains",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-accounts-")),dbPath=join(dir,"accounts.db"),port=await freePort(),base=`http://127.0.0.1:${port}`;
  let server;
  async function start(){
    server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:dbPath,ARENA_MODE:"local"},stdio:"pipe"});
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await fetch(base+"/api/health")).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    throw Error("Server did not start");
  }
  async function stop(){if(server && server.exitCode===null && server.signalCode===null){server.kill();await new Promise(resolve=>server.once("exit",resolve));}}
  function accountRows(){const db=new DatabaseSync(dbPath);try{return {demo:db.prepare("SELECT id FROM users WHERE email='demo@example.com'").get(),legacy:db.prepare("SELECT id FROM users WHERE email='demo'").get(),pinggos:db.prepare("SELECT id FROM users WHERE email='pinggos'").get(),demoSessions:db.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE user_id=(SELECT id FROM users WHERE email='demo@example.com')").get().count,pinggosSessions:db.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE user_id=(SELECT id FROM users WHERE email='pinggos')").get().count,rooms:db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count};}finally{db.close();}}
  try{
    await start();
    let response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:"demo@example.com",password:"1234"})});
    assert.equal(response.status,200);
    const auth=await response.json(),cookie=response.headers.get("set-cookie").split(";")[0];
    response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:"demo",password:"1234"})});
    assert.equal(response.status,401);
    const today=await (await fetch(base+"/api/me/today",{headers:{cookie}})).json();
    response=await fetch(base+"/api/sessions",{method:"POST",headers:{cookie,"content-type":"application/json","x-csrf-token":auth.csrf},body:JSON.stringify({scenarioId:today.mission.id})});
    assert.equal(response.status,201);
    response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:"pinggos",password:"4321"})});
    assert.equal(response.status,200);
    const pinggosAuth=await response.json(),pinggosCookie=response.headers.get("set-cookie").split(";")[0];
    response=await fetch(base+"/api/sessions",{method:"POST",headers:{cookie:pinggosCookie,"content-type":"application/json","x-csrf-token":pinggosAuth.csrf},body:JSON.stringify({scenarioId:today.mission.id})});
    assert.equal(response.status,201);
    response=await fetch(base+"/api/rooms",{method:"POST",headers:{cookie,"content-type":"application/json","x-csrf-token":auth.csrf},body:JSON.stringify({mode:"human",problem:"Test room",goal:"Test goal"})});
    assert.equal(response.status,201);const room=await response.json();
    response=await fetch(base+"/api/rooms/join",{method:"POST",headers:{cookie:pinggosCookie,"content-type":"application/json","x-csrf-token":pinggosAuth.csrf},body:JSON.stringify({code:room.code})});
    assert.equal(response.status,200);
    response=await fetch(base+`/api/rooms/${room.id}/messages`,{method:"POST",headers:{cookie:pinggosCookie,"content-type":"application/json","x-csrf-token":pinggosAuth.csrf},body:JSON.stringify({text:"A message"})});
    assert.equal(response.status,201);
    await stop();
    const before=accountRows();assert.ok(before.demo?.id);assert.equal(before.demoSessions,1);assert.equal(before.legacy,undefined);assert.ok(before.pinggos?.id);assert.equal(before.pinggosSessions,1);assert.equal(before.rooms,1);
    const db=new DatabaseSync(dbPath);
    db.prepare("UPDATE users SET password_hash=? WHERE email='pinggos'").run("$argon2id$v=19$m=19456,t=2,p=1$Exb947kToXuHt2SNlMotYQ$BemfskQLmwzxs1JofaVRvvlfmP+b6r6+NSxuN6ZwRok");
    db.close();
    await start();
    response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:"pinggos",password:"4321"})});
    assert.equal(response.status,200);
    await stop();
    const after=accountRows();assert.notEqual(after.demo.id,before.demo.id);assert.equal(after.demoSessions,0);assert.equal(after.pinggos.id,before.pinggos.id);assert.equal(after.pinggosSessions,1);assert.equal(after.rooms,0);
  }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
