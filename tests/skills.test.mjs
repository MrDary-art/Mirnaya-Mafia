import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

test("skill tree follows authored rounds and links final scene to a real mission",{timeout:30000},async()=>{
  const content=JSON.parse(readFileSync("packages/content/skill-tree.json","utf8"));
  const dir=mkdtempSync(join(tmpdir(),"arena-skills-"));
  const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:join(dir,"test.db")},stdio:"pipe"});
  const base=`http://127.0.0.1:${port}/api`;let cookie="",csrf="";
  async function request(path,method="GET",body){const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{}),...(csrf&&method!=="GET"?{"x-csrf-token":csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),response};}
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await request("/health")).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const login=await request("/auth/login","POST",{login:"pinggos",password:"4321"});cookie=login.response.headers.get("set-cookie").split(";")[0];csrf=login.data.csrf;
    const tree=await request("/skills/tree");assert.equal(tree.data.nodes.length,27);
    assert.equal((await request("/skills/nodes/hr_empathy_2/start","POST")).status,403);
    assert.equal((await request("/skills/finals/hr_empathy_final/start","POST")).status,403);
    for(const nodeId of ["hr_empathy_1","hr_empathy_2"]){
      const started=await request(`/skills/nodes/${nodeId}/start`,"POST");assert.equal(started.status,200);
      const source=content.nodes.find(node=>node.id===nodeId);
      for(let i=0;i<source.exercise.rounds.length;i++){
        const current=await request(`/skills/nodes/${nodeId}`),round=source.exercise.rounds[i];assert.equal(current.data.current,i);
        if(round.options){const correct=round.options.find(option=>option.correct);const publicOption=current.data.round.options.find(option=>option.text===correct.text);const answer=await request(`/skills/nodes/${nodeId}/answers`,"POST",{optionId:publicOption.id});assert.equal(answer.status,200);assert.equal(answer.data.ok,true);}
        else{const answer=await request(`/skills/nodes/${nodeId}/answers`,"POST",{answer:"Понимаю, что это непросто. Что для вас важно сейчас?"});assert.equal(answer.status,200);assert.equal(answer.data.ok,true);}
      }
      assert.equal((await request(`/skills/nodes/${nodeId}`)).data.stars,3);
    }
    assert.equal((await request("/me/progress")).data.xp,100);
    const final=await request("/skills/finals/hr_empathy_final/start","POST");assert.equal(final.status,201);
    const id=final.data.sessionId;await request(`/sessions/${id}/prepare`,"POST",{itemIds:[]});
    for(let i=0;i<15;i++){const current=await request(`/sessions/${id}`);if(current.data.session.status==="finished")break;await request(`/sessions/${id}/actions`,"POST",{requestId:crypto.randomUUID(),type:"say",optionId:current.data.step.options[0].id});}
    assert.equal((await request(`/sessions/${id}`)).data.session.status,"finished");
    assert.ok((await request("/skills/nodes/hr_empathy_final")).data.stars>=1);
    assert.ok((await request("/me/progress")).data.xp>=200);
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});
