import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./registration-options.css";

function safeReturnPath(value, fallback) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const target = new URL(value, window.location.origin);
    const authPaths = ["/", "/login", "/register", "/business/login", "/business/register"];
    if (target.origin !== window.location.origin || authPaths.includes(target.pathname)) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

function validateFields(mode, { fullName, nickname, loginIdentifier, password }) {
  const issues = {};

  if (mode === "register") {
    const cleanName = fullName.trim();
    const cleanNickname = nickname.trim();
    if (cleanName.length < 2) issues.fullName = "Укажите ФИО, минимум 2 символа.";
    else if (cleanName.length > 120) issues.fullName = "ФИО должно содержать не больше 120 символов.";
    if (cleanNickname.length < 2) issues.nickname = "Никнейм должен содержать минимум 2 символа.";
    else if (cleanNickname.length > 40) issues.nickname = "Никнейм должен содержать не больше 40 символов.";
  }

  const cleanLogin = loginIdentifier.trim();
  if (!cleanLogin) issues.login = "Введите логин.";
  else if (mode === "register" && cleanLogin.length < 2) issues.login = "Логин должен содержать минимум 2 символа.";
  else if (mode === "register" && cleanLogin.length > 80) issues.login = "Логин должен содержать не больше 80 символов.";

  if (!password) issues.password = "Введите пароль.";
  else if (mode === "register" && password.length < 4) issues.password = "Пароль должен содержать минимум 4 символа.";
  else if (mode === "register" && password.length > 100) issues.password = "Пароль должен содержать не больше 100 символов.";
  return issues;
}

function readableAuthError(message, mode) {
  try {
    const details = JSON.parse(message);
    if (Array.isArray(details)) {
      const issue = details[0];
      const field = issue?.loc?.at(-1);
      const labels = { full_name: "ФИО", username: mode === "register" ? "Никнейм" : "Логин", login: "Логин", password: "Пароль" };
      const label = labels[field];
      if (label && issue?.type === "string_too_short" && Number.isInteger(issue.ctx?.min_length)) return `${label}: минимум ${issue.ctx.min_length} символа.`;
      if (label && issue?.type === "string_too_long" && Number.isInteger(issue.ctx?.max_length)) return `${label}: не больше ${issue.ctx.max_length} символов.`;
    }
    if (details && typeof details === "object") return "Проверьте введённые данные и попробуйте ещё раз.";
  } catch {
    // The API also returns plain, already readable messages.
  }
  return message;
}

export default function Login({
  initialMode = "login",
  redirectTo,
  onClose,
  onModeChange,
  onAuthenticated,
  returnFocusRef,
  description,
  standalone = false,
  loginTitle,
  registerTitle,
  portal = "personal",
  onPortalChange,
  onBack,
}) {
  const { login: authenticate } = useAuth();
  const navigate = useNavigate();
  const isBusiness = portal === "company";
  const fallbackPath = isBusiness ? "/business/continue" : "/app";
  const nextPath = safeReturnPath(redirectTo || fallbackPath, fallbackPath);
  const mode = initialMode;
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mailEnabled, setMailEnabled] = useState(false);
  const dialogRef = useRef(null);
  const layoutRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const values = { fullName, nickname, loginIdentifier, password };
  const fieldIssues = validateFields(mode, values);
  const visibleIssue = (field, value) => (showValidation || (mode === "register" && value.length > 0) ? fieldIssues[field] : "");
  const fullNameError = visibleIssue("fullName", fullName);
  const nicknameError = visibleIssue("nickname", nickname);
  const loginError = visibleIssue("login", loginIdentifier);
  const passwordError = visibleIssue("password", password);

  useEffect(() => {
    setError("");
    setShowValidation(false);
  }, [portal]);

  useEffect(() => {
    api("/api/mail/status", { auth: false })
      .then((value) => setMailEnabled(Boolean(value.enabled)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    layoutRef.current?.scrollTo({ top: 0 });
  }, [mode]);

  function changeMode(nextMode) {
    setError("");
    setShowValidation(false);
    onModeChange?.(nextMode);
  }

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!standalone) document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    requestAnimationFrame(() => dialog?.querySelector("input")?.focus());

    function handleKeyDown(event) {
      if (!standalone && event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length && !element.closest("[inert]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (!standalone) {
        document.body.style.overflow = previousOverflow;
        const returnFocus = returnFocusRef?.current || previousFocus;
        if (returnFocus?.isConnected) returnFocus.focus();
      }
    };
  }, [returnFocusRef, standalone]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setShowValidation(true);
    setError("");
    const issues = validateFields(mode, values);
    const firstInvalidField = ["fullName", "nickname", "login", "password"].find((field) => issues[field]);
    if (firstInvalidField) {
      event.currentTarget.elements.namedItem(firstInvalidField)?.focus();
      return;
    }

    setBusy(true);
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "register"
          ? {
              username: nickname.trim(),
              login: loginIdentifier.trim(),
              full_name: fullName.trim(),
              password,
            }
          : { username: loginIdentifier.trim(), password },
        auth: false,
      });
      const target = data.is_admin ? "/admin" : nextPath;
      onAuthenticated?.(target);
      authenticate(data);
      navigate(target, { replace: true });
    } catch (err) {
      setError(readableAuthError(err.message, mode));
    } finally {
      setBusy(false);
    }
  }

  const formDescription = description || (mode === "login"
    ? isBusiness
      ? "Сотрудники и руководители входят одинаково. Роль и доступ определит компания."
      : "Продолжите личную практику переговоров."
    : isBusiness
      ? "Создайте личный аккаунт, затем найдите свою компанию или зарегистрируйте новую."
      : "Создайте личный аккаунт для тренировок и отчётов.");

  const form = (
    <form className="arena-auth-card registration-form" onSubmit={submit} noValidate>
      {onBack && !standalone && (
        <button type="button" className="registration-back" disabled={busy} onClick={onBack}>
          <span aria-hidden="true">←</span> Выбрать другую Арену
        </button>
      )}
      <div className="registration-layout" ref={layoutRef}>
        <div className="registration-personal">
          <h1 id="landing-auth-title">
            {mode === "login"
              ? loginTitle || (isBusiness ? "Вход в Арену для бизнеса" : "Вход в Арену переговоров")
              : registerTitle || "Создайте аккаунт"}
          </h1>
          <p id="landing-auth-description">{formDescription}</p>

          <div className="arena-auth-tabs" role="tablist" aria-label="Вход или регистрация">
            <button type="button" role="tab" disabled={busy} aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Вход</button>
            <button type="button" role="tab" disabled={busy} aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Регистрация</button>
          </div>

          {mode === "register" && (
            <>
              <label htmlFor="arena-full-name">ФИО</label>
              <input id="arena-full-name" name="fullName" required minLength={2} maxLength={120} value={fullName} onChange={(event) => { setFullName(event.target.value); setError(""); }} autoComplete="name" aria-invalid={Boolean(fullNameError)} aria-describedby={fullNameError ? "arena-full-name-hint" : undefined} placeholder="Иванов Иван Иванович" />
              {fullNameError && <p id="arena-full-name-hint" className="arena-auth-field-hint is-invalid" role="alert">{fullNameError}</p>}

              <label htmlFor="arena-nickname">Никнейм</label>
              <input id="arena-nickname" name="nickname" required minLength={2} maxLength={40} value={nickname} onChange={(event) => { setNickname(event.target.value); setError(""); }} autoComplete="nickname" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(nicknameError)} aria-describedby="arena-nickname-hint" placeholder="ivan_pro" />
              <p id="arena-nickname-hint" className={`arena-auth-field-hint${nicknameError ? " is-invalid" : ""}`} role={nicknameError ? "alert" : undefined}>{nicknameError || "Его увидят другие участники."}</p>
            </>
          )}

          <label htmlFor="arena-login">Логин</label>
          <input id="arena-login" name="login" required minLength={mode === "register" ? 2 : undefined} maxLength={80} value={loginIdentifier} onChange={(event) => { setLoginIdentifier(event.target.value); setError(""); }} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(loginError)} aria-describedby={mode === "register" || loginError ? "arena-login-hint" : undefined} />
          {(mode === "register" || loginError) && <p id="arena-login-hint" className={`arena-auth-field-hint${loginError ? " is-invalid" : ""}`} role={loginError ? "alert" : undefined}>{loginError || "Нужен только для входа и не показывается другим."}</p>}
          {mode === "login" && mailEnabled && <p className="arena-auth-field-hint">Можно использовать подтверждённую почту.</p>}

          <div className="arena-auth-password-row">
            <label htmlFor="arena-password">Пароль</label>
            <span className="arena-auth-password">
              <input id="arena-password" name="password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(passwordError)} aria-describedby={mode === "register" || passwordError ? "arena-password-hint" : undefined} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button>
            </span>
          </div>
          {(mode === "register" || passwordError) && <p id="arena-password-hint" className={`arena-auth-field-hint${passwordError ? " is-invalid" : ""}`} role={passwordError ? "alert" : undefined}>{passwordError || "Минимум 4 символа."}</p>}
          {mode === "login" && mailEnabled && <Link className="registration-recovery-link" to="/forgot-password">Забыли пароль?</Link>}
        </div>
      </div>

      {error && <div className="arena-auth-error" role="alert">{error}</div>}
      {!onBack && onPortalChange && (
        <button type="button" className="registration-portal-switch" disabled={busy} onClick={() => onPortalChange(isBusiness ? "personal" : "company")}>
          {isBusiness ? "Перейти в Арену переговоров" : "Перейти в Арену для бизнеса"}
        </button>
      )}
      <button className="arena-auth-submit" disabled={busy} aria-busy={busy}>
        {busy ? (mode === "register" ? "Создаём аккаунт…" : "Входим…") : (mode === "register" ? "Создать аккаунт" : "Войти")}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );

  if (standalone) {
    return <section ref={dialogRef} className="business-auth-card-shell" aria-labelledby="landing-auth-title" aria-describedby="landing-auth-description">{form}</section>;
  }

  return (
    <div className="landing-auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section ref={dialogRef} className="landing-auth-dialog registration-dialog" role="dialog" aria-modal="true" aria-labelledby="landing-auth-title" aria-describedby="landing-auth-description" tabIndex={-1}>
        <button className="landing-auth-close" type="button" aria-label="Закрыть окно" onClick={onClose}><XIcon size={21} aria-hidden="true" /></button>
        {form}
      </section>
    </div>
  );
}
