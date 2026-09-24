import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

test("learning path keeps answers private, unlocks sequentially and rewards once",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-learning-"));
  const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  const base=`http://127.0.0.1:${port}/api`;
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:join(dir,"test.db")},stdio:"pipe"});
  let cookie="",csrf="";
  async function request(path,method="GET",body,headers={}){const response=await fetch(base+path,{method,headers:{...(body?{"content-type":"application/json"}:{}),...(cookie?{cookie}:{}),...(csrf&&method!=="GET"?{"x-csrf-token":csrf}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),response};}
  try {
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await request("/health")).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const login=await request("/auth/login","POST",{login:"pinggos",password:"4321"});assert.equal(login.status,200);cookie=login.response.headers.get("set-cookie").split(";")[0];csrf=login.data.csrf;
    const path=await request("/path");assert.equal(path.data.chapters.length,10);assert.equal(path.data.chapters.flatMap(ch=>ch.levels).length,60);
    assert.equal(path.data.chapters[0].levels[0].unlocked,true);assert.equal(path.data.chapters[0].levels[1].unlocked,false);
    assert.equal((await request("/path/attempts","POST",{levelId:"chapter-1-l2"})).status,403);
    const started=await request("/path/attempts","POST",{levelId:"chapter-1-l1"});assert.equal(started.status,201);
    const id=started.data.id;
    assert.equal(JSON.stringify(started.data).includes('"quality"'),false);
    assert.equal((await request(`/path/attempts/${id}/answers`,"POST",{optionId:"wrong",quality:"strong"})).status,400);
    for(let step=0;step<4;step++){
      const current=await request(`/path/attempts/${id}`);assert.equal(current.data.step,step);
      const chosen=current.data.exercise.options[0];
      const answered=await request(`/path/attempts/${id}/answers`,"POST",{optionId:chosen.id});assert.equal(answered.status,200);assert.ok(answered.data.feedback.feedback);
    }
    const finished=await request(`/path/attempts/${id}`);assert.equal(finished.data.status,"finished");assert.ok(finished.data.stars>=1);
    assert.equal(finished.data.answers.length,4);
    assert.equal((await request(`/path/attempts/${id}/answers`,"POST",{optionId:"strong-0"})).status,409);
    assert.equal((await request("/me/progress")).data.xp,10);
    const after=await request("/path");assert.equal(after.data.chapters[0].levels[1].unlocked,true);
    assert.equal(after.data.chapters[0].completed,1);assert.equal(after.data.chapters[0].bestStars,finished.data.stars);
    assert.equal((await request("/path/chapters/chapter-1/report")).status,409);
    assert.equal((await request("/path/chapters/unknown/report")).status,404);
    const replay=await request("/path/attempts","POST",{levelId:"chapter-1-l1"});assert.equal(replay.status,201);
    for(let step=0;step<4;step++){const current=await request(`/path/attempts/${replay.data.id}`);await request(`/path/attempts/${replay.data.id}/answers`,"POST",{optionId:current.data.exercise.options[0].id});}
    assert.equal((await request("/me/progress")).data.xp,10);
    for(const levelId of path.data.chapters[0].levels.slice(1).map(level=>level.id)){
      const next=await request("/path/attempts","POST",{levelId});assert.equal(next.status,201);
      for(let step=0;step<4;step++){const current=await request(`/path/attempts/${next.data.id}`);assert.equal((await request(`/path/attempts/${next.data.id}/answers`,"POST",{optionId:current.data.exercise.options[0].id})).status,200);}
    }
    const chapterReport=await request("/path/chapters/chapter-1/report");assert.equal(chapterReport.status,200);assert.equal(chapterReport.data.completed,6);assert.equal(chapterReport.data.maxStars,18);assert.ok(Array.isArray(chapterReport.data.errors));
    const other=await request("/auth/login","POST",{login:"demo@example.com",password:"1234"});assert.equal(other.status,200);
    const otherCookie=other.response.headers.get("set-cookie").split(";")[0];
    assert.equal((await request(`/path/attempts/${id}`,"GET",undefined,{cookie:otherCookie})).status,404);
  } finally {server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});
