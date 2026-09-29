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

function validateFields(mode, username, password) {
  const issues = {};
  if (!username.trim()) issues.username = mode === "register" ? "Логин должен содержать минимум 2 символа." : "Введите логин.";
  else if (mode === "register" && username.length < 2) issues.username = "Логин должен содержать минимум 2 символа.";
  else if (mode === "register" && username.length > 40) issues.username = "Логин должен содержать не больше 40 символов.";
  if (!password) issues.password = mode === "register" ? "Пароль должен содержать минимум 4 символа." : "Введите пароль.";
  else if (mode === "register" && password.length < 4) issues.password = "Пароль должен содержать минимум 4 символа.";
  else if (mode === "register" && password.length > 100) issues.password = "Пароль должен содержать не больше 100 символов.";
  return issues;
}

function readableAuthError(message) {
  try {
    const details = JSON.parse(message);
    if (Array.isArray(details)) {
      const issue = details[0];
      const field = issue?.loc?.at(-1);
      const label = field === "username" ? "Логин" : field === "password" ? "Пароль" : null;
      if (label && issue?.type === "string_too_short" && Number.isInteger(issue.ctx?.min_length)) return `${label} должен содержать минимум ${issue.ctx.min_length} символа.`;
      if (label && issue?.type === "string_too_long" && Number.isInteger(issue.ctx?.max_length)) return `${label} должен содержать не больше ${issue.ctx.max_length} символов.`;
    }
    if (details && typeof details === "object") return "Проверьте введённые данные и попробуйте ещё раз.";
  } catch { /* The API also returns plain, already readable messages. */ }
  return message;
}

export default function Login({ initialMode = "login", redirectTo, onClose, onModeChange, returnFocusRef }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const nextPath = safeReturnPath(redirectTo || "/app");
  const mode = initialMode;
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [mailEnabled, setMailEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const fieldIssues = validateFields(mode, username, password);
  const usernameError = showValidation || (mode === "register" && username.length > 0) ? fieldIssues.username : "";
  const passwordError = showValidation || (mode === "register" && password.length > 0) ? fieldIssues.password : "";
  useEffect(() => { api("/api/mail/status", { auth: false }).then(value => setMailEnabled(Boolean(value.enabled))).catch(() => {}); }, []);

  function changeMode(nextMode) {
    setError("");
    setShowValidation(false);
    onModeChange?.(nextMode);
  }

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
    setShowValidation(true);
    setError("");
    const issues = validateFields(mode, username, password);
    if (issues.username || issues.password) {
      event.currentTarget.elements.namedItem(issues.username ? "username" : "password")?.focus();
      return;
    }
    setBusy(true);
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "register" ? { username, password, ...(mailEnabled && email.trim() ? { email: email.trim() } : {}) } : { username, password },
        auth: false,
      });
      login(data);
      navigate(data.is_admin ? "/admin" : nextPath, { replace: true });
    } catch (err) {
      setError(readableAuthError(err.message));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form className="arena-auth-card" onSubmit={submit} noValidate>
      <span className="arena-kicker">АРЕНА ПЕРЕГОВОРОВ</span>
      <h1 id="landing-auth-title">{mode === "login" ? "С возвращением" : "Создайте профиль"}</h1>
      <p id="landing-auth-description">{nextPath !== "/app" ? mode === "register" ? "Создайте профиль — затем откроется выбранный раздел." : "Войдите — затем откроется выбранный раздел." : mode === "login" ? "Войдите, чтобы продолжить тренировку." : "Достаточно имени и пароля — остальное настроите позже."}</p>
      <div className="arena-auth-tabs" role="tablist" aria-label="Способ входа">
        <button type="button" role="tab" disabled={busy} aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Вход</button>
        <button type="button" role="tab" disabled={busy} aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Регистрация</button>
      </div>
      <label>{mode === "login" && mailEnabled ? "Логин или подтверждённая почта" : "Логин"}<input name="username" required value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} autoComplete="username" aria-invalid={Boolean(usernameError)} aria-describedby={usernameError ? "arena-username-hint" : undefined} /></label>
      {usernameError && <p id="arena-username-hint" className="arena-auth-field-hint is-invalid" role="alert">{usernameError}</p>}
      {mode === "register" && mailEnabled && <label>Электронная почта · необязательно<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /><small>Отправим ссылку для подтверждения. После этого можно войти по почте и восстановить пароль.</small></label>}
      <div className="arena-auth-password-row"><label htmlFor="arena-password">Пароль</label><span className="arena-auth-password"><input id="arena-password" name="password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(passwordError)} aria-describedby={mode === "register" || passwordError ? "arena-password-hint" : undefined} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button></span></div>
      {(mode === "register" || passwordError) && <p id="arena-password-hint" className={`arena-auth-field-hint${passwordError ? " is-invalid" : ""}`} role={passwordError ? "alert" : undefined}>{passwordError || "Пароль — от 4 символов."}</p>}
      {mode === "login" && mailEnabled && <a href="/forgot-password">Забыли пароль?</a>}
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
