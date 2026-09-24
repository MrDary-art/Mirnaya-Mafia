import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

test("new schema migrations preserve an existing pre-migration database",{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),"arena-migration-")),dbPath=join(dir,"existing.db");
  const db=new DatabaseSync(dbPath);
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE training_sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),scenario_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL)");
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run("existing-user","existing@example.test","stored-hash","owner","2025-01-01T00:00:00.000Z");
  db.prepare("INSERT INTO training_sessions VALUES (?,?,?,?,?,?)").run("existing-session","existing-user","salary_talk_01","finished","2025-01-01T00:00:00.000Z","{\"kept\":true}");db.close();
  const port=await new Promise(resolve=>{const socket=createServer();socket.listen(0,"127.0.0.1",()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});
  const server=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ARENA_DB_PATH:dbPath},stdio:"pipe"});
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error("Server exited");try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,70));}
    const upgraded=new DatabaseSync(dbPath);try{assert.deepEqual(upgraded.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map(row=>row.version),[1,2,3,4,5,6,7,8]);assert.equal(upgraded.prepare("SELECT data FROM training_sessions WHERE id='existing-session'").get().data,'{"kept":true}');assert.equal(upgraded.prepare("SELECT password_hash FROM users WHERE id='existing-user'").get().password_hash,"stored-hash");assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE name='ai_presets'").get());}finally{upgraded.close();}
  }finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));rmSync(dir,{recursive:true,force:true});}
});
