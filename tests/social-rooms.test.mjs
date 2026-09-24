import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

test("friends, messages, rooms and signals enforce participant access",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-social-"));
  const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:join(dir,"test.db")},stdio:"pipe"});
  const base=`http://127.0.0.1:${port}/api`;
  async function login(name,password){const response=await fetch(base+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:name,password})});assert.equal(response.status,200);const data=await response.json();return {id:data.user.id,cookie:response.headers.get("set-cookie").split(";")[0],csrf:data.csrf};}
  async function request(path,auth,method="GET",body){const response=await fetch(base+path,{method,headers:{cookie:auth.cookie,...(body?{"content-type":"application/json"}:{}),...(method!=="GET"?{"x-csrf-token":auth.csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await fetch(base+"/health")).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const a=await login("pinggos","4321"),b=await login("demo@example.com","1234");
    assert.equal((await request("/admin/overview",a)).status,200);
    assert.equal((await request("/admin/overview",b)).status,403);
    assert.equal((await request(`/messages/${b.id}`,a)).status,403);
    assert.equal((await request(`/people/${b.id}/profile`,a)).status,403);
    assert.equal((await request(`/friends/${b.id}/request`,a,"POST")).status,201);
    assert.equal((await request("/notifications",b)).data[0].type,"friend");
    assert.equal((await request(`/friends/${a.id}/accept`,a,"POST")).status,404);
    assert.equal((await request(`/friends/${a.id}/accept`,b,"POST")).status,200);
    assert.equal((await request(`/people/${b.id}/profile`,a)).data.email,"demo@example.com");
    assert.equal((await request(`/messages/${b.id}`,a,"POST",{text:"Договоримся о тренировке"})).status,201);
    assert.equal((await request(`/messages/${a.id}`,b)).data.length,1);
    const room=await request("/rooms",a,"POST",{mode:"human",problem:"Обсудить сроки проекта",goal:"Согласовать новый график"});assert.equal(room.status,201);
    assert.equal((await request(`/rooms/${room.data.id}`,b)).status,404);
    assert.equal((await request(`/rooms/${room.data.id}/messages`,a,"POST",{text:"Рано"})).status,409);
    const joined=await request("/rooms/join",b,"POST",{code:room.data.code});assert.equal(joined.status,200);assert.equal(joined.data.goal,undefined);
    assert.equal((await request("/rooms/join",b,"POST",{code:room.data.code})).status,404);
    assert.equal((await request(`/rooms/${room.data.id}/messages`,a,"POST",{text:"Предлагаю перенести срок"})).status,201);
    assert.equal((await request(`/rooms/${room.data.id}`,b)).data.messages.length,1);
    assert.equal((await request(`/rooms/${room.data.id}/signals`,a,"POST",{kind:"offer",data:{type:"offer",sdp:"test"}})).status,201);
    const signals=await request(`/rooms/${room.data.id}/signals`,b);assert.equal(signals.data.length,1);assert.equal(signals.data[0].kind,"offer");
    assert.equal((await request(`/rooms/${room.data.id}/finish`,a,"POST")).data.done,true);
    assert.equal((await request(`/rooms/${room.data.id}/finish`,b,"POST")).data.status,"finished");
    assert.equal((await request(`/rooms/${room.data.id}/messages`,a,"POST",{text:"Поздно"})).status,409);
    const waiting=await request("/rooms",a,"POST",{mode:"human",problem:"Новая встреча",goal:"Согласовать условия"});
    assert.equal((await request(`/rooms/${waiting.data.id}/cancel`,b,"POST")).status,404);
    assert.equal((await request(`/rooms/${waiting.data.id}/cancel`,a,"POST")).data.status,"cancelled");
    assert.equal((await request("/rooms/join",b,"POST",{code:waiting.data.code})).status,404);
    const when=new Date(Date.now()+2*3600000);when.setUTCMinutes(0,0,0);
    const plan={mode:"human",problem:"Планирование встречи",goal:"Согласовать бюджет",inviteeId:b.id,scheduledAt:when.toISOString(),durationMinutes:30};
    const planned=await request("/rooms",a,"POST",plan);assert.equal(planned.status,201);
    assert.equal((await request("/notifications",b)).data[0].type,"room");
    assert.equal((await request("/rooms",a,"POST",plan)).status,409);
    assert.equal((await request("/rooms/invitations",b)).data[0].id,planned.data.id);
    assert.equal((await request(`/rooms/${planned.data.id}/accept`,a,"POST")).status,404);
    assert.equal((await request("/rooms/join",b,"POST",{code:planned.data.code})).data.status,"scheduled");
    assert.equal((await request(`/rooms/${planned.data.id}/messages`,a,"POST",{text:"Рано"})).status,409);
    assert.equal((await request(`/rooms/${planned.data.id}/ready`,a,"POST")).data.ready,true);
    assert.equal((await request(`/rooms/${planned.data.id}/ready`,b,"POST")).data.peerReady,true);
    assert.equal((await request(`/rooms/${planned.data.id}/cancel`,a,"POST")).data.status,"cancelled");
    const immediate=await request("/rooms",a,"POST",{mode:"human",problem:"Итоговый разговор",goal:"Договориться",inviteeId:b.id});
    assert.equal((await request(`/rooms/${immediate.data.id}/accept`,b,"POST")).data.status,"active");
    assert.equal((await request(`/rooms/${immediate.data.id}/finish`,a,"POST",{outcome:"agreement"})).status,200);
    assert.equal((await request(`/rooms/${immediate.data.id}/finish`,a,"POST",{outcome:"no_agreement"})).data.done,true);
    const report=await request(`/rooms/${immediate.data.id}/finish`,b,"POST",{outcome:"no_agreement"});
    assert.equal(report.data.report.verdict,"disputed");
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});
