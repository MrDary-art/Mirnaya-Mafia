import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

function safeReturnPath(value) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin || ["/", "/login", "/register"].includes(target.pathname)) return "/app";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return "/app"; }
}

export default function Login({ initialMode = "login", redirectTo, onClose, onModeChange, returnFocusRef }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const nextPath = safeReturnPath(redirectTo || "/app");
  const mode = initialMode;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    requestAnimationFrame(() => dialog?.querySelector("input")?.focus());
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const returnFocus = returnFocusRef?.current || previousFocus;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocusRef]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: { username, password },
        auth: false,
      });
      login(data);
      navigate(data.is_admin ? "/admin" : nextPath, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form className="arena-auth-card" onSubmit={submit}>
      <span className="arena-kicker">АРЕНА ПЕРЕГОВОРОВ</span>
      <h1 id="landing-auth-title">{mode === "login" ? "С возвращением" : "Создайте профиль"}</h1>
      <p id="landing-auth-description">{nextPath !== "/app" ? mode === "register" ? "Создайте профиль — затем откроется выбранный раздел." : "Войдите — затем откроется выбранный раздел." : mode === "login" ? "Войдите, чтобы продолжить тренировку." : "Достаточно имени и пароля — остальное настроите позже."}</p>
      <div className="arena-auth-tabs" role="tablist" aria-label="Способ входа">
        <button type="button" role="tab" disabled={busy} aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => onModeChange?.("login")}>Вход</button>
        <button type="button" role="tab" disabled={busy} aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => onModeChange?.("register")}>Регистрация</button>
      </div>
      <label>Логин<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
      <div className="arena-auth-password-row"><label htmlFor="arena-password">Пароль</label><span className="arena-auth-password"><input id="arena-password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button></span></div>
      {error && <div className="arena-auth-error" role="alert">{error}</div>}
      <button className="arena-auth-submit" disabled={busy} aria-busy={busy}>{busy ? mode === "register" ? "Создаём профиль…" : "Входим…" : mode === "register" ? "Создать профиль" : "Войти"} <span aria-hidden="true">→</span></button>
    </form>
  );

  return (
    <div className="landing-auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section ref={dialogRef} className="landing-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="landing-auth-title" aria-describedby="landing-auth-description" tabIndex={-1}>
        <button className="landing-auth-close" type="button" aria-label="Закрыть окно" onClick={onClose}><XIcon size={21} aria-hidden="true" /></button>
        {form}
      </section>
    </div>
  );
}
