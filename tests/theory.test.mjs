import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

test("theory preserves authored lessons and grants XP after all exercises only",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-theory-"));
  const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:join(dir,"test.db")},stdio:"pipe"});
  const base=`http://127.0.0.1:${port}/api`;let cookie="",csrf="";
  async function request(path,method="GET",body){const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{}),...(csrf&&method!=="GET"?{"x-csrf-token":csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),response};}
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await request("/health")).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const login=await request("/auth/login","POST",{login:"pinggos",password:"4321"});assert.equal(login.status,200);cookie=login.response.headers.get("set-cookie").split(";")[0];csrf=login.data.csrf;
    const catalog=await request("/theory");assert.equal(catalog.data.length,2);
    const id=catalog.data[0].id;
    const preview=await request(`/theory/${id}`);assert.ok(preview.data.sections.length>0);assert.equal(preview.data.practice[0].options.length,0);
    assert.equal((await request(`/theory/${id}/complete`,"POST")).status,404);
    const started=await request(`/theory/${id}/start`,"POST");assert.equal(started.status,200);assert.equal(started.data.practice.length,6);
    assert.equal(JSON.stringify(started.data).includes('"quality"'),false);
    for(const exercise of started.data.practice){const result=await request(`/theory/${id}/answers`,"POST",{exerciseId:exercise.id,optionId:exercise.options[0].id});assert.equal(result.status,200);}
    const finished=await request(`/theory/${id}/complete`,"POST");assert.equal(finished.status,200);assert.equal(finished.data.completed,true);
    assert.equal((await request("/me/progress")).data.xp,15);
    assert.equal((await request(`/theory/${id}/complete`,"POST")).status,200);
    assert.equal((await request("/me/progress")).data.xp,15);
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});
