import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Session } from "@arena/domain";

const dbPath = resolve(process.env.ARENA_DB_PATH ?? "data/arena-v2.db");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'participant', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS training_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), scenario_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS training_by_user ON training_sessions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reward_ledger (session_id TEXT PRIMARY KEY REFERENCES training_sessions(id), user_id TEXT NOT NULL REFERENCES users(id), xp INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exercise_progress (user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES training_sessions(id), answer TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,session_id));`);
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
export function saveAction(session: Session) {
  db.exec("BEGIN IMMEDIATE");
  try {
    saveSession(session);
    if (session.status === "finished") {
      const previous = (db.prepare("SELECT COUNT(*) AS n FROM reward_ledger r JOIN training_sessions s ON s.id=r.session_id WHERE r.user_id=? AND s.scenario_id=? AND s.id<>?").get(session.userId, session.scenarioId, session.id) as {n:number}).n;
      const xp = previous === 0 ? 25 : previous === 1 ? 10 : 0;
      db.prepare("INSERT OR IGNORE INTO reward_ledger VALUES (?, ?, ?, ?)").run(session.id, session.userId, xp, new Date().toISOString());
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function xpFor(userId: string): number {
  return (db.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM reward_ledger WHERE user_id=?").get(userId) as {xp:number}).xp;
}
export function earnedXp(sessionId: string): number {
  return (db.prepare("SELECT xp FROM reward_ledger WHERE session_id=?").get(sessionId) as {xp:number}|undefined)?.xp ?? 0;
}
export function saveExercise(userId:string, sessionId:string, answer:string) {
  db.prepare("INSERT INTO exercise_progress VALUES (?,?,?,?) ON CONFLICT(user_id,session_id) DO UPDATE SET answer=excluded.answer,created_at=excluded.created_at")
    .run(userId,sessionId,answer,new Date().toISOString());
}
