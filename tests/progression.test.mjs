import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

test("rank, milestone stars, purchases and equipment are server owned",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-shop-")),dbPath=join(dir,"test.db");
  const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:dbPath},stdio:"pipe"});
  const base=`http://127.0.0.1:${port}/api`;let cookie="",csrf="",userId="";
  async function request(path,method="GET",body){const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{}),...(csrf&&method!=="GET"?{"x-csrf-token":csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),response};}
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await request("/health")).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const login=await request("/auth/login","POST",{login:"pinggos",password:"4321"});assert.equal(login.status,200);cookie=login.response.headers.get("set-cookie").split(";")[0];csrf=login.data.csrf;userId=login.data.user.id;
    assert.equal((await request("/progression")).data.stars,0);
    assert.equal((await request("/shop/purchase","POST",{itemCode:"frame_violet",stars:1000})).status,404);
    const db=new DatabaseSync(dbPath);for(let i=0;i<25;i++)db.prepare("INSERT INTO learning_rewards VALUES (?,?,10)").run(userId,`test-level-${i}`);db.close();
    const earned=await request("/progression");assert.equal(earned.data.xp,250);assert.equal(earned.data.stars,5);assert.equal(earned.data.rank,"Новичок");assert.ok(earned.data.nextRank.requirements.some(item=>item.label==="Завершённые переговоры"&&!item.done));
    assert.equal((await request("/progression")).data.stars,5);
    assert.equal((await request("/shop/equip","POST",{itemCode:"frame_violet"})).status,403);
    const bought=await request("/shop/purchase","POST",{itemCode:"frame_violet"});assert.equal(bought.status,200);assert.equal(bought.data.stars,0);
    assert.equal((await request("/shop/purchase","POST",{itemCode:"frame_violet"})).status,409);
    const equipped=await request("/shop/equip","POST",{itemCode:"frame_violet"});assert.equal(equipped.status,200);assert.equal(equipped.data.equipment.frame,"frame_violet");
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});
