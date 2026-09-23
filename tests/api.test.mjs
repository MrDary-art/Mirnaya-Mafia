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
    assert.equal((await request(`/sessions/${id}/exercise`,"POST",{answer:"Я уточню интересы другой стороны."})).status,200);
    assert.equal((await request("/me/progress")).data.xp,25);
    assert.equal((await request("/me/today")).data.basedOnSessionId,id);
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
  function accountRows(){const db=new DatabaseSync(dbPath);try{return {demo:db.prepare("SELECT id FROM users WHERE email='demo@example.com'").get(),legacy:db.prepare("SELECT id FROM users WHERE email='demo'").get(),pinggos:db.prepare("SELECT id FROM users WHERE email='pinggos'").get(),demoSessions:db.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE user_id=(SELECT id FROM users WHERE email='demo@example.com')").get().count,pinggosSessions:db.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE user_id=(SELECT id FROM users WHERE email='pinggos')").get().count};}finally{db.close();}}
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
    await stop();
    const before=accountRows();assert.ok(before.demo?.id);assert.equal(before.demoSessions,1);assert.equal(before.legacy,undefined);assert.ok(before.pinggos?.id);assert.equal(before.pinggosSessions,1);
    const db=new DatabaseSync(dbPath);
    db.prepare("UPDATE users SET password_hash=? WHERE email='pinggos'").run("$argon2id$v=19$m=19456,t=2,p=1$Exb947kToXuHt2SNlMotYQ$BemfskQLmwzxs1JofaVRvvlfmP+b6r6+NSxuN6ZwRok");
    db.close();
    await start();
    response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:"pinggos",password:"4321"})});
    assert.equal(response.status,200);
    await stop();
    const after=accountRows();assert.notEqual(after.demo.id,before.demo.id);assert.equal(after.demoSessions,0);assert.equal(after.pinggos.id,before.pinggos.id);assert.equal(after.pinggosSessions,1);
  }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
