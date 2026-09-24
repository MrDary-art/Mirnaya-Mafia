import { mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Session } from "@arena/domain";

const workspaceRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const configuredPath=process.env.ARENA_DB_PATH;
const dbPath=configuredPath?resolve(workspaceRoot,configuredPath):join(workspaceRoot,"data","arena-v2.db");
export const databasePath=dbPath;
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'participant', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS training_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), scenario_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS training_by_user ON training_sessions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reward_ledger (session_id TEXT PRIMARY KEY REFERENCES training_sessions(id), user_id TEXT NOT NULL REFERENCES users(id), xp INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exercise_progress (user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES training_sessions(id), answer TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,session_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`);
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=1").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS learning_attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), level_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS learning_attempts_user ON learning_attempts(user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS learning_progress (user_id TEXT NOT NULL REFERENCES users(id), level_id TEXT NOT NULL, stars INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, level_id));
      CREATE TABLE IF NOT EXISTS learning_rewards (user_id TEXT NOT NULL REFERENCES users(id), level_id TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY(user_id, level_id));`);
    db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=2").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ai_sessions_user ON ai_sessions(user_id, created_at DESC);`);
    db.prepare("INSERT INTO schema_migrations VALUES (2, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=3").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS friendships (requester_id TEXT NOT NULL REFERENCES users(id), receiver_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(requester_id,receiver_id));
      CREATE TABLE IF NOT EXISTS direct_messages (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id), receiver_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_pair ON direct_messages(sender_id,receiver_id,created_at);
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, host_id TEXT NOT NULL REFERENCES users(id), guest_id TEXT REFERENCES users(id), status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS room_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS room_messages_order ON room_messages(room_id,created_at);
      CREATE TABLE IF NOT EXISTS room_signals (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), from_user TEXT NOT NULL REFERENCES users(id), to_user TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);`);
    db.prepare("INSERT INTO schema_migrations VALUES (3, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=4").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS theory_progress (user_id TEXT NOT NULL REFERENCES users(id), lesson_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id));
      CREATE TABLE IF NOT EXISTS theory_rewards (user_id TEXT NOT NULL REFERENCES users(id), lesson_id TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY(user_id,lesson_id));`);
    db.prepare("INSERT INTO schema_migrations VALUES (4, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=5").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS star_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL, code TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,source,code));
      CREATE TABLE IF NOT EXISTS inventory (user_id TEXT NOT NULL REFERENCES users(id), item_code TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,item_code));
      CREATE TABLE IF NOT EXISTS equipment (user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, item_code TEXT NOT NULL, PRIMARY KEY(user_id,category));`);
    db.prepare("INSERT INTO schema_migrations VALUES (5, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=6").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!(db.prepare("PRAGMA table_info(rooms)").all() as {name:string}[]).some(column=>column.name==="mode"))db.exec("ALTER TABLE rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'human'");
    db.prepare("INSERT INTO schema_migrations VALUES (6, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=7").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS skill_progress (user_id TEXT NOT NULL REFERENCES users(id), node_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,node_id));
      CREATE TABLE IF NOT EXISTS skill_rewards (user_id TEXT NOT NULL REFERENCES users(id), node_id TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY(user_id,node_id));
      CREATE TABLE IF NOT EXISTS skill_final_sessions (user_id TEXT NOT NULL REFERENCES users(id), node_id TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES training_sessions(id), PRIMARY KEY(user_id,node_id,session_id));`);
    db.prepare("INSERT INTO schema_migrations VALUES (7, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
if (!(db.prepare("SELECT version FROM schema_migrations WHERE version=8").get())) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_presets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ai_presets_user ON ai_presets(user_id,created_at DESC);`);
    db.prepare("INSERT INTO schema_migrations VALUES (8, ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch(error) {db.exec("ROLLBACK");throw error;}
}
if (!(db.prepare("PRAGMA table_info(users)").all() as {name:string}[]).some(column=>column.name==="role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'participant'");
}

export type UserRow = { id: string; email: string; password_hash: string; role: string };
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function addUser(email: string, passwordHash: string) {
  const user = { id: randomUUID(), email: email.toLowerCase(), password_hash: passwordHash, role: process.env.ARENA_MODE!=="site" && userCount()===0 ? "owner" : "participant" };
  db.prepare("INSERT INTO users (id,email,password_hash,role,created_at) VALUES (?, ?, ?, ?, ?)").run(user.id, user.email, user.password_hash, user.role, new Date().toISOString());
  return user;
}
export function userByEmail(email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase()) as UserRow | undefined;
}
export function userById(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id=?").get(id) as UserRow | undefined;
}
export function userCount(): number { return (db.prepare("SELECT count(*) AS n FROM users").get() as {n:number}).n; }
export function createAuthSession(userId: string) {
  const token = randomBytes(32).toString("base64url"), csrf = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO auth_sessions VALUES (?, ?, ?, ?)").run(hashToken(token), userId, csrf, Date.now() + 7 * 86400000);
  return { token, csrf };
}
export function authByToken(token: string): {user_id:string;csrf:string}|undefined {
  return db.prepare("SELECT user_id,csrf FROM auth_sessions WHERE token_hash=? AND expires_at>?").get(hashToken(token), Date.now()) as {user_id:string;csrf:string}|undefined;
}
export function revokeToken(token: string) { db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hashToken(token)); }
export function saveSession(session: Session) {
  db.prepare("INSERT INTO training_sessions VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data")
    .run(session.id, session.userId, session.scenarioId, session.status, session.createdAt, JSON.stringify(session));
}
export function getSession(id: string, userId: string): Session | undefined {
  const row = db.prepare("SELECT data FROM training_sessions WHERE id=? AND user_id=?").get(id, userId) as {data:string}|undefined;
  return row ? JSON.parse(row.data) as Session : undefined;
}
export function listSessions(userId: string): Session[] {
  return (db.prepare("SELECT data FROM training_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(userId) as {data:string}[]).map(row => JSON.parse(row.data) as Session);
}
export function saveAction(session: Session, afterReward?: () => void) {
  db.exec("BEGIN IMMEDIATE");
  try {
    saveSession(session);
    if (session.status === "finished") {
      const previous = (db.prepare("SELECT COUNT(*) AS n FROM reward_ledger r JOIN training_sessions s ON s.id=r.session_id WHERE r.user_id=? AND s.scenario_id=? AND s.id<>?").get(session.userId, session.scenarioId, session.id) as {n:number}).n;
      const xp = previous === 0 ? 25 : previous === 1 ? 10 : 0;
      db.prepare("INSERT OR IGNORE INTO reward_ledger VALUES (?, ?, ?, ?)").run(session.id, session.userId, xp, new Date().toISOString());
      afterReward?.();
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function xpFor(userId: string): number {
  const scenario=(db.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM reward_ledger WHERE user_id=?").get(userId) as {xp:number}).xp;
  const learning=(db.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM learning_rewards WHERE user_id=?").get(userId) as {xp:number}).xp;
  const theory=(db.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM theory_rewards WHERE user_id=?").get(userId) as {xp:number}).xp;
  const skills=(db.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM skill_rewards WHERE user_id=?").get(userId) as {xp:number}).xp;
  return scenario+learning+theory+skills;
}
export function earnedXp(sessionId: string): number {
  return (db.prepare("SELECT xp FROM reward_ledger WHERE session_id=?").get(sessionId) as {xp:number}|undefined)?.xp ?? 0;
}
export function saveExercise(userId:string, sessionId:string, answer:string) {
  db.prepare("INSERT INTO exercise_progress VALUES (?,?,?,?) ON CONFLICT(user_id,session_id) DO UPDATE SET answer=excluded.answer,created_at=excluded.created_at")
    .run(userId,sessionId,answer,new Date().toISOString());
}
export function exerciseAnswer(userId:string,sessionId:string):string|undefined {
  return (db.prepare("SELECT answer FROM exercise_progress WHERE user_id=? AND session_id=?").get(userId,sessionId) as {answer:string}|undefined)?.answer;
}

const DEMO_PASSWORD_HASH="$argon2id$v=19$m=19456,t=2,p=1$5Pn+bZ8T0fUquUhnaSazJg$6kyEpxNfPLC9svDsdKMzqYy/2Sj0V3a7Iq/U/tzzncg";
const PINGGOS_PASSWORD_HASH="$argon2id$v=19$m=65536,t=3,p=4$IOhXiDfU9QXbapDHuwZHow$KW7yuGPOVGZ58NQirP86TVQXWuIkJalb4PcbI88ZFWA";
function addBuiltin(login:string,passwordHash:string,role:string) {
  const user={id:randomUUID(),email:login,password_hash:passwordHash,role};
  db.prepare("INSERT INTO users (id,email,password_hash,role,created_at) VALUES (?,?,?,?,?)").run(user.id,user.email,user.password_hash,user.role,new Date().toISOString());
}
export function seedBuiltinAccounts() {
  if(process.env.ARENA_MODE==="site") return;
  db.exec("BEGIN IMMEDIATE");
  try {
    for(const login of ["demo","demo@example.com"]){
      const demo=userByEmail(login);
      if(!demo) continue;
      db.prepare("DELETE FROM exercise_progress WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM learning_rewards WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM theory_rewards WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM theory_progress WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM star_ledger WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM inventory WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM equipment WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM skill_rewards WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM skill_progress WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM skill_final_sessions WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM learning_progress WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM learning_attempts WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM ai_sessions WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM ai_presets WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM room_signals WHERE room_id IN (SELECT id FROM rooms WHERE host_id=? OR guest_id=?)").run(demo.id,demo.id);
      db.prepare("DELETE FROM room_messages WHERE user_id=? OR room_id IN (SELECT id FROM rooms WHERE host_id=? OR guest_id=?)").run(demo.id,demo.id,demo.id);
      db.prepare("DELETE FROM rooms WHERE host_id=? OR guest_id=?").run(demo.id,demo.id);
      db.prepare("DELETE FROM direct_messages WHERE sender_id=? OR receiver_id=?").run(demo.id,demo.id);
      db.prepare("DELETE FROM friendships WHERE requester_id=? OR receiver_id=?").run(demo.id,demo.id);
      db.prepare("DELETE FROM reward_ledger WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM training_sessions WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(demo.id);
      db.prepare("DELETE FROM users WHERE id=?").run(demo.id);
    }
    addBuiltin("demo@example.com",DEMO_PASSWORD_HASH,"participant");
    const pinggos=userByEmail("pinggos");
    if(!pinggos) addBuiltin("pinggos",PINGGOS_PASSWORD_HASH,"owner");
    else if(pinggos.password_hash!==PINGGOS_PASSWORD_HASH) {
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(PINGGOS_PASSWORD_HASH,pinggos.id);
      db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(pinggos.id);
    }
    db.exec("COMMIT");
  } catch(error){db.exec("ROLLBACK");throw error;}
}
seedBuiltinAccounts();
