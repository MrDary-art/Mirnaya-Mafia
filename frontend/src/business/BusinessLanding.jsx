import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import "./business.css";

const forestScenes = [
  { id: "hero", src: "/assets/forest2d/hero.webp", mobile: "/assets/forest2d/hero-mobile.webp" },
  { id: "situation", src: "/assets/forest2d/scenarios.webp", mobile: "/assets/forest2d/scenarios-mobile.webp" },
  { id: "team", src: "/assets/forest2d/rooms.webp", mobile: "/assets/forest2d/rooms-mobile.webp" },
  { id: "result", src: "/assets/forest2d/learning.webp", mobile: "/assets/forest2d/learning-mobile.webp" },
];

const pathRows = [
  ["Рабочая ситуация", "Руководитель формулирует разговор, к которому нужно подготовиться."],
  ["Подготовка", "Каждый участник видит свою роль, материалы и ближайшее действие."],
  ["Встреча", "Команда фиксирует решение и договорённости там, где велась подготовка."],
  ["Следующий шаг", "Результат становится основой следующей практики, а не отчётом в стороне."],
];

const rolePreviews = {
  manager: {
    label: "Руководитель",
    title: "Собрать рабочую ситуацию",
    text: "Выбирает участников, сроки и ожидаемый результат. Видит ход работы команды без лишнего контроля.",
    rows: ["Согласовать срок поставки", "Команда приглашена", "Встреча назначена"],
  },
  employee: {
    label: "Сотрудник",
    title: "Понять свой следующий шаг",
    text: "Открывает назначенную практику, готовится к разговору и видит только свою часть рабочего процесса.",
    rows: ["Подготовить позицию", "Практика открыта", "Договорённости после встречи"],
  },
  learning: {
    label: "HR и обучение",
    title: "Связать навык с работой",
    text: "Собирает программы вокруг реальных ситуаций и видит, где команде нужна следующая практика.",
    rows: ["Навык: переговоры о сроках", "Практика для руководителей", "Обсуждение результата"],
  },
};

function WorkspaceFragment({ role }) {
  const preview = rolePreviews[role];
  return <aside className="business-stage-fragment" data-ui aria-label={`Пример рабочего пространства: ${preview.label}`}>
    <div className="business-stage-fragment-top"><span>Рабочее пространство</span><span>{preview.label}</span></div>
    <div className="business-stage-fragment-body">
      <p>{preview.label}</p>
      <h3>{preview.title}</h3>
      <span>{preview.text}</span>
      <ul>{preview.rows.map((row, index) => <li key={row}><i aria-hidden="true" className={index === 0 ? "is-current" : ""} />{row}</li>)}</ul>
    </div>
  </aside>;
}

export default function BusinessLanding() {
  const { user, ready } = useAuth();
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const [interest, setInterest] = useState("demo");
  const [role, setRole] = useState("manager");
  const [scene, setScene] = useState("hero");
  const [motionReady, setMotionReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", company: "", email: "", message: "", consent: false, website: "" });

  useEffect(() => {
    document.title = "Арена бизнеса — рабочие ситуации для команды";
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return undefined;
    const sceneObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setScene(entry.target.dataset.businessScene || "hero");
      });
    }, { threshold: 0.42 });
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    root.querySelectorAll("[data-business-scene]").forEach((element) => sceneObserver.observe(element));
    root.querySelectorAll("[data-stage-reveal]").forEach((element) => revealObserver.observe(element));
    const frame = window.requestAnimationFrame(() => setMotionReady(true));
    return () => {
      window.cancelAnimationFrame(frame);
      sceneObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/business/leads", { method: "POST", body: { ...form, interest }, auth: false });
      setSuccess(true);
    } catch (cause) {
      setError(cause.message || "Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  function request(kind) {
    setInterest(kind);
    setMobileMenuOpen(false);
    formRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  if (ready && user) return <Navigate to="/business/continue" replace />;

  const formAction = interest === "integration" ? "Обсудить интеграцию" : interest === "proposal" ? "Получить предложение" : "Запросить демонстрацию";

  return <div ref={rootRef} className={`business-public business-public--stage${motionReady ? " stage-motion-ready" : ""}`}>
    <a href="#business-stage-main" className="business-skip">К содержимому</a>
    <aside className="business-stage-visual" aria-hidden="true">
      {forestScenes.map((item) => <picture key={item.id} className={`business-stage-photo${scene === item.id ? " is-active" : ""}`}>
        <source media="(max-width: 760px)" srcSet={item.mobile} />
        <img src={item.src} alt="" />
      </picture>)}
      <span className="business-stage-visual-note">Личная практика остаётся личной. Рабочие ситуации живут в пространстве компании.</span>
    </aside>

    <header className="business-stage-header">
      <BusinessBrand />
      <nav className="business-stage-nav" aria-label="Навигация по странице">
        <a href="#path">Путь</a>
        <a href="#roles">Роли</a>
        <a href="#contact">Начать</a>
      </nav>
      <div className="business-stage-header-actions">
        <Link to="/business/login">Войти</Link>
        <button className="business-stage-menu" type="button" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="business-stage-mobile-menu" onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <XIcon size={21} aria-hidden="true" /> : <ListIcon size={21} aria-hidden="true" />}</button>
      </div>
      {mobileMenuOpen && <nav id="business-stage-mobile-menu" className="business-stage-mobile-menu" aria-label="Навигация по странице">
        <a href="#path" onClick={() => setMobileMenuOpen(false)}>Путь</a>
        <a href="#roles" onClick={() => setMobileMenuOpen(false)}>Роли</a>
        <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Начать</a>
        <Link to="/business/login">Войти в кабинет</Link>
      </nav>}
    </header>

    <main id="business-stage-main" className="business-stage-main">
      <section className="business-stage-hero" data-business-scene="hero" aria-labelledby="business-stage-title">
        <h1 id="business-stage-title"><span>Рабочие разговоры</span><span>дают результат</span></h1>
        <p>Арена связывает рабочую ситуацию, подготовку, встречу и договорённости в один понятный цикл для команды.</p>
        <div className="business-stage-hero-actions">
          <Link className="business-stage-primary" to="/business/register?next=%2Fbusiness%2Fcreate">Создать пространство <ArrowRightIcon size={17} aria-hidden="true" /></Link>
          <button className="business-stage-link" type="button" onClick={() => request("demo")}>Посмотреть, как это работает</button>
        </div>
      </section>

      <section className="business-stage-statement" data-business-scene="situation" data-stage-reveal aria-labelledby="statement-title">
        <h2 id="statement-title">Реальная ситуация.</h2>
        <p>Не нужно превращать обучение в отдельную жизнь. Руководитель начинает с настоящего случая, а команда проходит его в своём рабочем контексте.</p>
        <ul aria-label="Что проходит команда"><li>готовится к разговору</li><li>обсуждает решение</li><li>фиксирует договорённости</li><li>возвращается к следующему шагу</li></ul>
      </section>

      <section id="path" className="business-stage-path" data-business-scene="team" aria-labelledby="path-title">
        <div className="business-stage-path-title" data-stage-reveal><h2 id="path-title">Путь команды.</h2><p>У каждого своя роль и доступ. У всех — одна понятная последовательность работы.</p></div>
        <div className="business-stage-path-content">
          <ol>{pathRows.map(([title, text]) => <li key={title} data-stage-reveal><h3>{title}</h3><p>{text}</p></li>)}</ol>
          <WorkspaceFragment role="manager" />
        </div>
      </section>

      <section id="roles" className="business-stage-roles" data-business-scene="result" aria-labelledby="roles-title">
        <div data-stage-reveal><h2 id="roles-title">Своя точка входа.</h2><p>Интерфейс не заставляет сотрудника думать как руководитель, а руководителя — разбираться в чужих личных шагах.</p></div>
        <div className="business-stage-role-switcher" data-stage-reveal role="tablist" aria-label="Выберите роль">
          {Object.entries(rolePreviews).map(([key, item]) => <button key={key} type="button" role="tab" aria-selected={role === key} className={role === key ? "is-active" : ""} onClick={() => setRole(key)}>{item.label}</button>)}
        </div>
        <WorkspaceFragment role={role} />
      </section>

      <section className="business-stage-privacy" data-business-scene="hero" data-stage-reveal aria-labelledby="privacy-title">
        <h2 id="privacy-title">Два пространства.</h2>
        <p>Арена переговоров помогает тренироваться самостоятельно. Корпоративная связывает назначенные ситуации, командные встречи и результат. Они не смешивают личный путь с доступами компании.</p>
        <Link to="/">Перейти в личную Арену <ArrowRightIcon size={16} aria-hidden="true" /></Link>
      </section>

      <section ref={formRef} id="contact" className="business-stage-contact" data-business-scene="result" aria-labelledby="contact-title">
        <div className="business-stage-contact-copy" data-stage-reveal><h2 id="contact-title">Начните с ситуации.</h2><p>Расскажите, к какому разговору готовится команда. Покажем, как собрать первый рабочий цикл.</p><button className="business-stage-link" type="button" onClick={() => request("integration")}>Нужна интеграция</button></div>
        {success ? <div className="business-stage-success" role="status" data-stage-reveal><h3>Заявка отправлена</h3><p>Мы получили контакты и описание задачи. Вернёмся с ответом в рабочее время.</p><Link className="business-stage-primary" to="/business/register?next=%2Fbusiness%2Fcreate">Создать пространство <ArrowRightIcon size={16} aria-hidden="true" /></Link></div> : <form className="business-stage-form" onSubmit={submit} data-stage-reveal>
          <p>{formAction}</p>
          <div className="business-stage-form-grid"><label>Ваше имя<input name="name" required minLength="2" maxLength="120" value={form.name} onChange={update} autoComplete="name" placeholder="Имя и фамилия" /></label><label>Компания<input name="company" required minLength="2" maxLength="180" value={form.company} onChange={update} autoComplete="organization" placeholder="Название компании" /></label></div>
          <label>Рабочая почта<input type="email" name="email" required value={form.email} onChange={update} autoComplete="email" placeholder="name@company.ru" /></label>
          <label>Задача команды<textarea name="message" maxLength="3000" rows="4" value={form.message} onChange={update} placeholder="Например: готовим руководителей к сложным переговорам с клиентами" /></label>
          <label className="business-honeypot" aria-hidden="true">Сайт<input name="website" tabIndex="-1" autoComplete="off" value={form.website} onChange={update} /></label>
          <label className="business-stage-consent"><input type="checkbox" name="consent" required checked={form.consent} onChange={update} /><span>Согласен на обработку контактов, чтобы получить ответ на заявку.</span></label>
          {error && <p className="business-stage-error" role="alert">{error}</p>}
          <button disabled={busy} className="business-stage-primary" type="submit">{busy ? "Отправляем…" : formAction} <ArrowRightIcon size={16} aria-hidden="true" /></button>
        </form>}
      </section>
    </main>

    <footer className="business-stage-footer"><BusinessBrand /><p>Практика переговоров для команд, которым важно договориться.</p><Link to="/business/login">Войти в кабинет</Link></footer>
  </div>;
}
