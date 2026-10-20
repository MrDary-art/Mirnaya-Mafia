import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
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

function validateFields(mode, { nickname, loginIdentifier, password, confirmPassword, email, isBusiness, fullName }) {
  const issues = {};
  if (mode === "register") {
    if (isBusiness && fullName.trim().split(/\s+/).length < 2) issues.fullName = "Укажите фамилию и имя; отчество — если есть.";
    if (isBusiness && !email.trim()) issues.email = "Укажите почту для бизнес-аккаунта.";
    else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) issues.email = "Введите корректный адрес почты.";
  }

  if (mode === "register") {
    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 2) issues.nickname = "Логин должен содержать минимум 2 символа.";
    else if (cleanNickname.length > 40) issues.nickname = "Логин должен содержать не больше 40 символов.";
  }

  if (mode === "login" && !loginIdentifier.trim()) issues.login = "Введите логин.";

  if (!password) issues.password = "Введите пароль.";
  else if (mode === "register" && password.length < 4) issues.password = "Пароль должен содержать минимум 4 символа.";
  else if (mode === "register" && password.length > 100) issues.password = "Пароль должен содержать не больше 100 символов.";
  if (mode === "register" && !confirmPassword) issues.confirmPassword = "Подтвердите пароль.";
  else if (mode === "register" && password !== confirmPassword) issues.confirmPassword = "Пароли не совпадают.";
  return issues;
}

function readableAuthError(message, mode) {
  try {
    const details = JSON.parse(message);
    if (Array.isArray(details)) {
      const issue = details[0];
      const field = issue?.loc?.at(-1);
      const labels = { username: "Логин", login: "Логин", password: "Пароль" };
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
  standalone = false,
  loginTitle,
  registerTitle,
  portal = "personal",
  onPortalChange,
}) {
  const { login: authenticate } = useAuth();
  const navigate = useNavigate();
  const isBusiness = portal === "company";
  const fallbackPath = isBusiness ? "/business/continue" : "/app";
  const nextPath = safeReturnPath(redirectTo || fallbackPath, fallbackPath);
  const mode = initialMode;
  const [nickname, setNickname] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const dialogRef = useRef(null);
  const layoutRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const values = { nickname, loginIdentifier, password, confirmPassword, email, isBusiness, fullName };
  const fieldIssues = validateFields(mode, values);
  const visibleIssue = (field, value) => (showValidation || (mode === "register" && value.length > 0) ? fieldIssues[field] : "");
  const nicknameError = visibleIssue("nickname", nickname);
  const loginError = visibleIssue("login", loginIdentifier);
  const passwordError = visibleIssue("password", password);
  const confirmPasswordError = visibleIssue("confirmPassword", confirmPassword);
  const fullNameError = visibleIssue("fullName", fullName);
  const emailError = visibleIssue("email", email);
  const firstVisibleIssue = [
    ["nickname", nicknameError],
    ["login", loginError],
    ["password", passwordError],
    ["confirmPassword", confirmPasswordError],
    ["email", emailError],
    ["fullName", fullNameError],
  ].find(([, issue]) => issue)?.[0];

  useEffect(() => {
    setError("");
    setShowValidation(false);
  }, [portal]);

  useEffect(() => {
    layoutRef.current?.scrollTo({ top: 0 });
    if (!standalone) dialogRef.current?.scrollTo({ top: 0 });
  }, [mode, standalone]);

  function changeMode(nextMode) {
    setError("");
    setShowValidation(false);
    onModeChange?.(nextMode);
  }

  function handleTabKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextMode = nextIndex === 0 ? "login" : "register";
    changeMode(nextMode);
    tabs[nextIndex]?.focus();
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
    const firstInvalidField = ["nickname", "login", "fullName", "email", "password", "confirmPassword"].find((field) => issues[field]);
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
              password,
              email: email.trim() || null,
              registration_kind: isBusiness ? "company" : "personal",
              full_name: isBusiness ? fullName.trim() : undefined,
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

  const form = (
    <form className={`arena-auth-card registration-form registration-form--${mode}`} onSubmit={submit} noValidate>
      <div className="registration-layout" ref={layoutRef}>
        <div className="registration-personal">
          <h1 id="landing-auth-title">
            {mode === "login"
              ? loginTitle || "С возвращением!"
              : registerTitle || "Создайте аккаунт"}
          </h1>

          <div className="arena-auth-tabs" role="tablist" aria-label="Вход или регистрация" onKeyDown={handleTabKeyDown}>
            <button id="arena-login-tab" type="button" role="tab" disabled={busy} aria-selected={mode === "login"} aria-controls="arena-auth-panel" tabIndex={mode === "login" ? 0 : -1} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Вход</button>
            <button id="arena-register-tab" type="button" role="tab" disabled={busy} aria-selected={mode === "register"} aria-controls="arena-auth-panel" tabIndex={mode === "register" ? 0 : -1} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Регистрация</button>
          </div>

          <div id="arena-auth-panel" className="registration-fields" role="tabpanel" aria-labelledby={mode === "login" ? "arena-login-tab" : "arena-register-tab"}>
            {mode === "register" && (
                <div className="registration-field">
                  <label htmlFor="arena-nickname">Логин <span className="registration-required" aria-hidden="true">*</span></label>
                  <input id="arena-nickname" name="nickname" required minLength={2} maxLength={40} value={nickname} onChange={(event) => { setNickname(event.target.value); setError(""); }} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(nicknameError)} aria-describedby={nicknameError ? "arena-nickname-hint" : undefined} placeholder="alex_ivanov" />
                  {nicknameError && <p id="arena-nickname-hint" className="arena-auth-field-hint is-invalid" role="alert">{nicknameError}</p>}
                </div>
            )}

            {mode === "login" && (
              <div className="registration-field">
                <label htmlFor="arena-login">Логин или почта</label>
                <input id="arena-login" name="login" required maxLength={80} value={loginIdentifier} onChange={(event) => { setLoginIdentifier(event.target.value); setError(""); }} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(loginError)} aria-describedby={loginError ? "arena-login-hint" : undefined} placeholder="Ваш логин" />
                {loginError && <p id="arena-login-hint" className="arena-auth-field-hint is-invalid" role={firstVisibleIssue === "login" ? "alert" : undefined}>{loginError}</p>}
              </div>
            )}

            {mode === "register" && isBusiness && <div className="registration-field">
              <label htmlFor="arena-full-name">ФИО <span className="registration-required" aria-hidden="true">*</span></label>
              <input id="arena-full-name" name="fullName" required maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" placeholder="Иванов Иван Иванович" aria-invalid={Boolean(fullNameError)} aria-describedby={fullNameError ? "arena-full-name-hint" : undefined} />
              {fullNameError && <p id="arena-full-name-hint" className="arena-auth-field-hint is-invalid" role="alert">{fullNameError}</p>}
            </div>}
            {mode === "register" && <div className="registration-field">
              <label htmlFor="arena-email">Почта{isBusiness && <> <span className="registration-required" aria-hidden="true">*</span></>}</label>
              <input id="arena-email" name="email" type="email" required={isBusiness} maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="email" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(emailError)} aria-describedby="arena-email-hint" placeholder="name@example.com" />
              <p id="arena-email-hint" className={`arena-auth-field-hint${emailError ? " is-invalid" : ""}`} role={firstVisibleIssue === "email" ? "alert" : undefined}>{emailError || "Для восстановления аккаунта и получения важных уведомлений."}</p>
            </div>}
            <div className="arena-auth-password-row registration-field">
              <label htmlFor="arena-password">Пароль {mode === "register" && <span className="registration-required" aria-hidden="true">*</span>}</label>
              <span className="arena-auth-password">
                <input id="arena-password" name="password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "arena-password-hint" : undefined} placeholder={mode === "register" ? "Придумайте пароль" : "Введите пароль"} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword}>
                  {showPassword ? <EyeSlashIcon size={17} aria-hidden="true" /> : <EyeIcon size={17} aria-hidden="true" />}
                </button>
              </span>
              {passwordError && <p id="arena-password-hint" className="arena-auth-field-hint is-invalid" role={firstVisibleIssue === "password" ? "alert" : undefined}>{passwordError}</p>}
            </div>
            {mode === "register" && <div className="arena-auth-password-row registration-field">
              <label htmlFor="arena-confirm-password">Подтвердите пароль <span className="registration-required" aria-hidden="true">*</span></label>
              <span className="arena-auth-password">
                <input id="arena-confirm-password" name="confirmPassword" required type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} autoComplete="new-password" aria-invalid={Boolean(confirmPasswordError)} aria-describedby={confirmPasswordError ? "arena-confirm-password-hint" : undefined} placeholder="Повторите пароль" />
                <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Скрыть подтверждение пароля" : "Показать подтверждение пароля"} aria-pressed={showConfirmPassword}>
                  {showConfirmPassword ? <EyeSlashIcon size={17} aria-hidden="true" /> : <EyeIcon size={17} aria-hidden="true" />}
                </button>
              </span>
              {confirmPasswordError && <p id="arena-confirm-password-hint" className="arena-auth-field-hint arena-auth-confirm-hint is-invalid" role={firstVisibleIssue === "confirmPassword" ? "alert" : undefined}>{confirmPasswordError}</p>}
            </div>}
            {mode === "login" && <Link className="registration-recovery-link" to="/forgot-password">Забыли пароль?</Link>}
          </div>
        </div>
      </div>

      {error && <div className="arena-auth-error" role="alert">{error}</div>}
      {onPortalChange && (
        <button type="button" className="registration-portal-switch" disabled={busy} onClick={() => onPortalChange(isBusiness ? "personal" : "company")}>
          {isBusiness ? "Перейти в Арену переговоров" : "Перейти в Арену бизнеса"}
        </button>
      )}
      {mode === "register" && <p className="registration-required-note"><span className="registration-required">*</span> — обязательные поля для заполнения.</p>}
      <button type="submit" className="arena-auth-submit" disabled={busy} aria-busy={busy}>
        {busy ? (mode === "register" ? "Создаём аккаунт…" : "Входим…") : (mode === "register" ? "Создать аккаунт" : "Войти")}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );

  if (standalone) {
    return <section ref={dialogRef} className="business-auth-card-shell" aria-labelledby="landing-auth-title">{form}</section>;
  }

  return (
    <div className="landing-auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section ref={dialogRef} className={`landing-auth-dialog registration-dialog registration-dialog--${mode}${isBusiness ? " registration-dialog--company" : ""}`} role="dialog" aria-modal="true" aria-labelledby="landing-auth-title" tabIndex={-1}>
        <button className="landing-auth-close" type="button" aria-label="Закрыть окно" onClick={onClose}><XIcon size={21} aria-hidden="true" /></button>
        {form}
      </section>
    </div>
  );
}
