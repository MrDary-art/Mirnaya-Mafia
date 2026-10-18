import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { api, setToken } from "../api.js";
import { companyLoginDestination } from "../business/navigation.js";
import { useAuth } from "../auth.jsx";
import "./registration-options.css";

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

export default function Login({ initialMode = "login", redirectTo, onClose, onModeChange, onAuthenticated, returnFocusRef, brandLabel = "АРЕНА ПЕРЕГОВОРОВ", description, standalone = false, loginTitle, registerTitle, portal = "personal", onPortalChange }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const nextPath = safeReturnPath(redirectTo || "/app");
  const mode = initialMode;
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyDetails, setCompanyDetails] = useState({ name: "", industry: "" });
  const [email, setEmail] = useState("");
  const [registrationKind, setRegistrationKind] = useState(() => portal === "company" ? "company" : "personal");
  useEffect(() => { setRegistrationKind(portal === "company" ? "company" : "personal"); setError(""); }, [portal]);
  const [companyCode, setCompanyCode] = useState("");
  const [mailEnabled, setMailEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const companyExpanded = mode === "register" && registrationKind === "company";
  const dialogRef = useRef(null);
  const layoutRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const fieldIssues = validateFields(mode, username, password);
  const usernameError = showValidation || (mode === "register" && username.length > 0) ? fieldIssues.username : "";
  const passwordError = showValidation || (mode === "register" && password.length > 0) ? fieldIssues.password : "";
  useEffect(() => { api("/api/mail/status", { auth: false }).then(value => setMailEnabled(Boolean(value.enabled))).catch(() => {}); }, []);

  useEffect(() => {
    layoutRef.current?.scrollTo({ top: 0 });
  }, [mode, companyExpanded]);

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
      const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length && !element.closest("[inert]"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
    const issues = validateFields(mode, username, password);
    if (issues.username || issues.password) {
      event.currentTarget.elements.namedItem(issues.username ? "username" : "password")?.focus();
      return;
    }
    if (mode === "register") {
      if (fullName.trim().length < 2) {
        setError("Укажите имя или ФИО — как к вам обращаться.");
        event.currentTarget.elements.namedItem("fullName")?.focus();
        return;
      }
      if ((registrationKind === "company" || email.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Укажите корректный адрес электронной почты.");
        event.currentTarget.elements.namedItem("email")?.focus();
        return;
      }
      if (registrationKind === "participant" && !/^[A-Za-z0-9-]{10}$/.test(companyCode.trim())) {
        setError("Введите код компании: ровно 10 символов — латиница, цифры и тире.");
        event.currentTarget.elements.namedItem("companyCode")?.focus();
        return;
      }
      if (companyExpanded && companyDetails.name.trim().length < 2) {
        setError("Введите название компании — минимум 2 символа.");
        event.currentTarget.elements.namedItem("companyName")?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "register" ? { username, password, full_name: fullName.trim(), registration_kind: registrationKind,
          ...(companyExpanded ? { company_details: { name: companyDetails.name.trim(), industry: companyDetails.industry.trim() } } : {}),
          ...((mailEnabled || registrationKind === "company") && email.trim() ? { email: email.trim() } : {}),
          ...(registrationKind === "participant" ? { company_code: companyCode.trim().toUpperCase() } : {}) } : { username, password, portal },
        auth: false,
      });
      let destination = nextPath;
      if (mode === "register") destination = registrationKind === "company" ? `/business/${data.company_id}/overview` : registrationKind === "participant" ? "/registration/company-request" : "/app";
      else if (data.company_id && ["/app", "/business/continue", "/business/create", "/business/workspaces"].includes(nextPath)) destination = `/business/${data.company_id}/overview`;
      if (mode === "login" && !data.is_admin && /^\/business\/\d+(?:\/|$)/.test(nextPath)) {
        // Validate a stale return URL against the newly authenticated account.
        setToken(data.access_token);
        let memberships = [];
        try { memberships = (await api("/api/company/context")).companies || []; }
        catch { memberships = data.company_id ? [{ company_id: data.company_id, status: "ACTIVE" }] : []; }
        destination = companyLoginDestination(nextPath, data.company_id, memberships);
      }
      const target = data.is_admin ? "/admin" : destination;
      onAuthenticated?.(target);
      login(data);
      navigate(target, { replace: true });
    } catch (err) {
      setError(readableAuthError(err.message));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form className={`arena-auth-card registration-form${companyExpanded ? " is-company" : ""}`} onSubmit={submit} noValidate>
      <div className="registration-layout" ref={layoutRef}><div className="registration-personal">
      <span className="arena-kicker">{portal === "company" ? "АРЕНА ДЛЯ РУКОВОДИТЕЛЕЙ" : brandLabel}</span>
      <h1 id="landing-auth-title">{mode === "login" ? (loginTitle || (portal === "company" ? "Вход руководителя" : "С возвращением")) : (registerTitle || (portal === "company" ? "Создайте компанию" : "Создайте профиль"))}</h1>
      {mode === "login" && <p id="landing-auth-description">{description || (portal === "company" ? "Управляйте командой, обучением и результатами компании." : "Личная Арена и рабочее пространство сотрудников.")}</p>}
      <div className="arena-auth-tabs" role="tablist" aria-label="Способ входа">
        <button type="button" role="tab" disabled={busy} aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Вход</button>
        <button type="button" role="tab" disabled={busy} aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Регистрация</button>
      </div>
      {mode === "register" && portal !== "company" && <fieldset className="registration-options" aria-label="Тип профиля" disabled={busy}>
        <div className="registration-choices is-participant">{[["personal", "Для себя"], ["participant", "Участник компании"]].map(([value, label]) => <label key={value} className={registrationKind === value ? "is-selected" : ""}><input type="radio" name="registrationKind" value={value} checked={registrationKind === value} onChange={() => { setRegistrationKind(value); setError(""); }} /><span>{label}</span></label>)}</div>
        {registrationKind === "participant" && <label>Код компании<input name="companyCode" value={companyCode} onChange={event => { setCompanyCode(event.target.value.toUpperCase()); setError(""); }} required minLength={10} maxLength={10} pattern="[A-Za-z0-9-]{10}" autoComplete="off" spellCheck={false} placeholder="ABCD-E2345" /><small>10 символов. Попросите код у администратора вашей компании. Доступ появится после одобрения заявки.</small></label>}
      </fieldset>}
      {mode === "register" && <label>Как к вам обращаться *<input name="fullName" required minLength={2} maxLength={120} value={fullName} onChange={event => { setFullName(event.target.value); setError(""); }} autoComplete="name" placeholder="Иванов Иван Иванович" /></label>}
      <label>{mode === "login" && mailEnabled ? "Логин или подтверждённая почта" : "Логин"}<input name="username" required value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} autoComplete="username" aria-invalid={Boolean(usernameError)} aria-describedby={usernameError ? "arena-username-hint" : undefined} /></label>
      {usernameError && <p id="arena-username-hint" className="arena-auth-field-hint is-invalid" role="alert">{usernameError}</p>}
      {mode === "register" && (mailEnabled || registrationKind === "company") && <label>Электронная почта{registrationKind === "company" ? " *" : " · необязательно"}<input name="email" type="email" required={registrationKind === "company"} value={email} onChange={event => { setEmail(event.target.value); setError(""); }} autoComplete="email" /></label>}
      <div className="arena-auth-password-row"><label htmlFor="arena-password">Пароль</label><span className="arena-auth-password"><input id="arena-password" name="password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(passwordError)} aria-describedby={mode === "register" || passwordError ? "arena-password-hint" : undefined} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button></span></div>
      {(mode === "register" || passwordError) && <p id="arena-password-hint" className={`arena-auth-field-hint${passwordError ? " is-invalid" : ""}`} role={passwordError ? "alert" : undefined}>{passwordError || "Пароль — от 4 символов."}</p>}
      {mode === "login" && mailEnabled && <a href="/forgot-password">Забыли пароль?</a>}

      </div>{companyExpanded && <div className="registration-company-panel">
        <section aria-labelledby="registration-company-title">
          <h2 id="registration-company-title">Данные компании</h2>
          <label>Название компании *<input name="companyName" disabled={!companyExpanded || busy} required={companyExpanded} minLength={2} maxLength={180} value={companyDetails.name} onChange={event => { setCompanyDetails(current => ({ ...current, name: event.target.value })); setError(""); }} placeholder="Например, Северная студия" autoComplete="organization" /></label>
          <label>Отрасль · необязательно<input disabled={!companyExpanded || busy} maxLength={120} value={companyDetails.industry} onChange={event => setCompanyDetails(current => ({ ...current, industry: event.target.value }))} placeholder="Например, образование или финансы" /></label>
          <div className="registration-team-note"><p>Изначально размер команды установлен на 25 человек. Изменить его можно в настройках после регистрации.</p></div>
          <p className="registration-company-privacy">В кабинете компании вы будете видеть все достижения и отчёты сотрудников по корпоративному обучению.</p>
        </section>
      </div>}</div>
      {error && <div className="arena-auth-error" role="alert">{error}</div>}
      {onPortalChange && <button type="button" className="registration-portal-switch" disabled={busy} onClick={() => onPortalChange(portal === "company" ? "personal" : "company")}>{portal === "company" ? "Для себя или сотрудника →" : "Создатель компании? Вход для руководителей →"}</button>}
      <button className="arena-auth-submit" disabled={busy} aria-busy={busy}>{busy ? companyExpanded ? "Создаём профиль и компанию…" : mode === "register" ? "Создаём профиль…" : "Входим…" : mode === "register" ? registrationKind === "participant" ? "Создать профиль и отправить заявку" : registrationKind === "company" ? "Создать профиль и компанию" : "Создать профиль" : "Войти"} <span aria-hidden="true">→</span></button>
    </form>
  );

  if (standalone) {
    return <section ref={dialogRef} className="business-auth-card-shell" aria-labelledby="landing-auth-title" aria-describedby={mode === "login" ? "landing-auth-description" : undefined}>
      {form}
    </section>;
  }

  return (
    <div className="landing-auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section ref={dialogRef} className={`landing-auth-dialog registration-dialog${companyExpanded ? " is-company" : ""}`} role="dialog" aria-modal="true" aria-labelledby="landing-auth-title" aria-describedby={mode === "login" ? "landing-auth-description" : undefined} tabIndex={-1}>
        <button className="landing-auth-close" type="button" aria-label="Закрыть окно" onClick={onClose}><XIcon size={21} aria-hidden="true" /></button>
        {form}
      </section>
    </div>
  );
}
