import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createHttp } from "node:http";
import { createServer as createNet } from "node:net";

test("AI dialogue uses server provider and enforces ownership; voice forwards WAV to Whisper",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-ai-"));
  const port=await new Promise(resolve=>{const socket=createNet();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  let providerCalls=0,voiceCalls=0;
  const provider=createHttp(async(req,res)=>{
    if(req.url==="/api/chat"){
      providerCalls++;let body="";for await(const chunk of req)body+=chunk;
      const data=JSON.parse(body);assert.equal(data.stream,false);assert.equal(data.messages[0].role,"system");
      res.setHeader("content-type","application/json");res.end(JSON.stringify({message:{content:"Давайте обсудим условия."}}));return;
    }
    if(req.url==="/inference"){
      voiceCalls++;for await(const _chunk of req){}
      res.setHeader("content-type","application/json");res.end(JSON.stringify({text:"Мой голосовой ответ"}));return;
    }
    res.statusCode=404;res.end();
  });
  await new Promise(resolve=>provider.listen(0,"127.0.0.1",resolve));
  const providerPort=provider.address().port;
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:join(dir,"test.db"),ARENA_AI_PROVIDER:"ollama",ARENA_OLLAMA_MODEL:"mock",ARENA_OLLAMA_URL:`http://127.0.0.1:${providerPort}`,ARENA_WHISPER_URL:`http://127.0.0.1:${providerPort}`},stdio:"pipe"});
  const base=`http://127.0.0.1:${port}/api`;
  async function login(name,password){const response=await fetch(base+"/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({login:name,password})});assert.equal(response.status,200);return {cookie:response.headers.get("set-cookie").split(";")[0],csrf:(await response.json()).csrf};}
  async function request(path,auth,method="GET",body){const response=await fetch(base+path,{method,headers:{cookie:auth.cookie,...(body?{"content-type":"application/json"}:{}),...(method!=="GET"?{"x-csrf-token":auth.csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await fetch(base+"/health")).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const owner=await login("pinggos","4321"),other=await login("demo@example.com","1234");
    assert.equal((await request("/ai/status",owner)).data.available,true);
    const created=await request("/ai/sessions",owner,"POST",{mode:"negotiation"});assert.equal(created.status,201);
    const id=created.data.id;
    assert.equal((await request(`/ai/sessions/${id}`,other)).status,404);
    assert.equal((await request(`/ai/sessions/${id}/turn`,other,"POST",{text:"test"})).status,404);
    assert.equal((await request(`/ai/sessions/${id}/turn`,owner,"POST",{text:"Привет",metrics:{goal:100}})).status,400);
    const turn=await request(`/ai/sessions/${id}/turn`,owner,"POST",{text:"Привет"});assert.equal(turn.status,200);assert.equal(turn.data.reply,"Давайте обсудим условия.");assert.equal(providerCalls,1);
    assert.equal((await request(`/ai/sessions/${id}`,owner)).data.messages.length,2);
    const wav=Buffer.alloc(1024);wav.write("RIFF",0);wav.write("WAVE",8);
    const voice=await fetch(base+"/ai/transcribe",{method:"POST",headers:{cookie:owner.cookie,"x-csrf-token":owner.csrf,"content-type":"audio/wav"},body:wav});assert.equal(voice.status,200);assert.equal((await voice.json()).text,"Мой голосовой ответ");assert.equal(voiceCalls,1);
    const duel=await request("/rooms",owner,"POST",{mode:"duel",problem:"Руководитель продуктовой команды",goal:"Сравнить двух кандидатов"});assert.equal(duel.status,201);
    const joined=await request("/rooms/join",other,"POST",{code:duel.data.code});assert.equal(joined.status,200);
    const hostRoom=await request(`/rooms/${duel.data.id}`,owner);
    assert.ok(hostRoom.data.yourSessionId);assert.ok(joined.data.yourSessionId);
    assert.notEqual(hostRoom.data.yourSessionId,joined.data.yourSessionId);
    assert.equal((await request(`/ai/sessions/${hostRoom.data.yourSessionId}`,other)).status,404);
    const hostInterview=await request(`/ai/sessions/${hostRoom.data.yourSessionId}`,owner),guestInterview=await request(`/ai/sessions/${joined.data.yourSessionId}`,other);
    assert.equal(hostInterview.data.messages[0].content,guestInterview.data.messages[0].content);
    for(const [auth,sessionId] of [[owner,hostRoom.data.yourSessionId],[other,joined.data.yourSessionId]])for(let i=0;i<4;i++){
      const result=await request(`/ai/sessions/${sessionId}/turn`,auth,"POST",{text:`Ответ на вопрос ${i+1}`});assert.equal(result.status,200);
    }
    assert.equal((await request(`/rooms/${duel.data.id}`,owner)).data.status,"finished");
    const comparison=await request(`/rooms/${duel.data.id}`,other);assert.equal(comparison.data.interviews.length,2);assert.equal(comparison.data.interviews[0].messages.length,9);
    assert.equal((await request(`/ai/sessions/${hostRoom.data.yourSessionId}/turn`,owner,"POST",{text:"Поздно"})).status,409);
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));await new Promise(resolve=>provider.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
