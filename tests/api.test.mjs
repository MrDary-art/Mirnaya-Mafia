import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

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
    assert.equal(registered.status,201);assert.equal(registered.data.user.role,"owner");cookie=registered.res.headers.get("set-cookie").split(";")[0];csrf=registered.data.csrf;
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
