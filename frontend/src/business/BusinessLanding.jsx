import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Login from "../pages/Login.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import { safeBusinessNext } from "./navigation.js";
import "../pages/landing.css";
import "./business.css";

export default function BusinessLanding() {
  const {user,ready} = useAuth(), location = useLocation(), navigate = useNavigate();
  const [params] = useSearchParams();
  const isLogin = /\/(login|register)$/.test(location.pathname);
  const mode = location.pathname.endsWith("/register") ? "register" : "login";
  const invitation = params.get("invitation");
  const next = invitation ? `/business/workspaces?invitation=${encodeURIComponent(invitation)}` : safeBusinessNext(params.get("next"));
  const authQuery = new URLSearchParams({next}); if (invitation) authQuery.set("invitation",invitation);
  const [interest,setInterest] = useState("demo"), [busy,setBusy] = useState(false), [success,setSuccess] = useState(false), [error,setError] = useState("");
  const [form,setForm] = useState({name:"",company:"",email:"",message:"",consent:false,website:""});
  const formRef = useRef(null);
  const update = e => setForm(v=>({...v,[e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value}));
  useEffect(() => { document.title = "Арена для бизнеса — практика переговоров для команды"; }, []);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { await api("/api/business/leads",{method:"POST",body:{...form,interest},auth:false});setSuccess(true); }
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  function request(kind) { setInterest(kind);formRef.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",block:"start"}); }
  if (isLogin && ready && user) return <Navigate to={user.is_admin ? "/admin" : next} replace/>;
  return <div className="business-public">
    <a href="#business-public-main" className="business-skip">К содержимому</a>
    <header><BusinessBrand/><nav aria-label="Выбор продукта"><Link to="/">Для себя</Link><Link to="/business" aria-current="page">Для компаний</Link></nav><Link className="subtle-button" to={user ? "/business/workspaces" : `/business/login?${authQuery}`}>{user ? "Мои компании" : "Войти в компанию"}</Link></header>
    <main id="business-public-main">
      <section className="business-marketing-hero">
        <img className="business-marketing-forest" src="/assets/forest2d/hero.webp" alt="" aria-hidden="true" fetchPriority="high"/>
        <div className="business-brief">
          <div className="business-brief-title"><h1>Договариваться.<br/>Вместе.</h1><p>Практика переговоров для вашей команды — от рабочего кейса до разбора конкретных решений.</p></div>
          <div className="business-brief-content"><div className="business-brief-details"><p><b>Задача команды</b><span>Сложный клиент. Обратная связь. Согласование сроков.</span></p><p><b>Формат работы</b><span>Сценарии, диалог с ИИ и встречи 1×1.</span></p><p><b>Результат практики</b><span>Разбор решений, динамика навыков, следующий шаг.</span></p></div><div className="business-brief-actions"><Link className="primary-button" to={user ? "/business/onboarding" : "/business/register?next=%2Fbusiness%2Fonboarding"}>Создать компанию <span aria-hidden="true">↗</span></Link><button className="subtle-button" onClick={()=>request("demo")}>Запросить демонстрацию</button><Link className="business-text-link" to="/business/demo">Попробовать учебный кабинет →</Link></div></div>
          <p className="business-brief-footnote">Личный аккаунт остаётся вашим. Корпоративные задания и результаты живут в отдельном пространстве.</p>
        </div>
      </section>
      <section className="business-marketing-section business-workflow-section"><h2>Одна ситуация.<br/>Понятный путь.</h2><ol className="business-workflow"><li><span>Выберите рабочий кейс</span><p>Готовый сценарий или ситуация вашей компании.</p></li><li><span>Дайте команде практику</span><p>Назначения, сроки и программы в одном месте.</p></li><li><span>Обсудите результат</span><p>Конкретные решения и сопоставимый прогресс.</p></li></ol></section>
      <section className="business-marketing-section"><h2>Каждому — свой фокус.</h2><div className="business-role-list"><article><h3>Сотруднику</h3><p>Что пройти сегодня, к чему подготовиться и какой навык потренировать дальше.</p></article><article><h3>Руководителю</h3><p>Задания для своей команды, сроки и результаты в пределах выданных прав.</p></article><article><h3>HR и обучению</h3><p>Программы, библиотека кейсов и обзор подготовки сотрудников.</p></article></div></section>
      <section className="business-marketing-section business-plans"><h2>Пространство под вашу команду.</h2><p>Обсудим состав функций и условия. Оплата на сайте пока не подключена.</p><div className="business-plan-list">{[
        ["Команда","Совместный старт","Приглашения, кейсы, задания и результаты."],
        ["Бизнес","Несколько подразделений","Программы, структура, командная аналитика и сертификаты."],
        ["Корпорация","Индивидуальное подключение","Требования к доступу, размещению и интеграциям согласуются отдельно."]
      ].map(([name,subtitle,text])=><article key={name}><h3>{name}</h3><div><b>{subtitle}</b><p>{text}</p></div><button className="subtle-button" onClick={()=>request("proposal")}>Обсудить условия ↗</button></article>)}</div></section>
      <section ref={formRef} id="business-contact" className="business-marketing-section business-contact"><div><h2>Начнём с вашей задачи.</h2><p>Расскажите, кого и к каким разговорам вы готовите.</p><p className="business-muted">Оставьте рабочую почту для обратной связи.</p></div>{success ? <div className="business-contact-confirmation" role="status"><h3>Запрос сохранён</h3><p>Контакт и описание задачи сохранены.</p><Link className="primary-button" to={user ? "/business/onboarding" : "/business/register?next=%2Fbusiness%2Fonboarding"}>Создать компанию самостоятельно</Link></div> : <form onSubmit={submit}><label>Ваше имя<input name="name" required minLength="2" maxLength="120" value={form.name} onChange={update} autoComplete="name"/></label><label>Компания<input name="company" required minLength="2" maxLength="180" value={form.company} onChange={update} autoComplete="organization"/></label><label>Рабочая почта<input type="email" name="email" required value={form.email} onChange={update} autoComplete="email"/></label><label>Задача команды<textarea name="message" maxLength="3000" rows="3" value={form.message} onChange={update}/></label><label className="business-honeypot" aria-hidden="true">Сайт<input name="website" tabIndex="-1" autoComplete="off" value={form.website} onChange={update}/></label><label className="business-consent"><input type="checkbox" name="consent" required checked={form.consent} onChange={update}/><span>Согласен на обработку указанных контактов для ответа на этот запрос.</span></label>{error && <p className="business-alert" role="alert">{error}</p>}<button disabled={busy} className="primary-button">{busy ? "Сохраняем…" : interest === "proposal" ? "Получить предложение" : "Запросить демонстрацию"}</button></form>}</section>
    </main>
    <footer className="business-public-footer"><BusinessBrand/><p>Тренировки, задания и развитие команды.</p><Link to="/">Личная арена ↗</Link></footer>
    {isLogin && <div className="business-auth"><Login initialMode={mode} redirectTo={next} brandLabel="АРЕНА ДЛЯ БИЗНЕСА" description={invitation ? "Войдите или создайте личный аккаунт, чтобы подтвердить приглашение компании." : "Используйте свой аккаунт Арены. После входа выберите компанию."} onClose={()=>navigate("/business",{replace:true})} onModeChange={value=>navigate(`/business/${value === "login" ? "login" : "register"}?${authQuery}`,{replace:true})}/></div>}
  </div>;
}
