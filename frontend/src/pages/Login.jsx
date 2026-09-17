import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: { username, password },
        auth: false,
      });
      login(data);
      nav("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">TKI · Гарвард · формальные метрики</div>
        <h1 className="mt-2 text-4xl font-extrabold neon">Арена Переговоров</h1>
        <p className="mt-3 text-slate-400">Безопасная практика сложных разговоров. Оценка — по формулам, не по «чёрному ящику».</p>
      </div>
      <form className="glass rounded-3xl p-6" onSubmit={submit}>
        <div className="mb-4 flex gap-2">
          {["login", "register"].map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-xl py-2 ${mode === m ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400"}`}
            >
              {m === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>
        <label className="block text-sm text-slate-400">Логин</label>
        <input className="mb-3 w-full rounded-xl bg-black/30 p-3 outline-none ring-1 ring-white/10" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="block text-sm text-slate-400">Пароль</label>
        <input type="password" className="mb-4 w-full rounded-xl bg-black/30 p-3 outline-none ring-1 ring-white/10" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="mb-3 text-sm text-rose-300">{error}</div>}
        <button className="w-full rounded-xl bg-cyan-400 py-3 font-semibold text-slate-950">Продолжить</button>
        <p className="mt-3 text-center text-xs text-slate-500">Демо: demo / demo · Админ: admin / admin. Офлайн-сценарий работает без API-ключей.</p>
      </form>
    </div>
  );
}
