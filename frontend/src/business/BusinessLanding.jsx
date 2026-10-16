import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import BusinessBrand from "./BusinessBrand.jsx";
import "../pages/landing.css";
import "./business.css";

const workflow = [
  {
    number: "01",
    title: "Соберите рабочий кейс",
    text: "Выберите готовый сценарий или опишите ситуацию, с которой команда сталкивается каждый день.",
  },
  {
    number: "02",
    title: "Дайте команде практику",
    text: "Назначьте переговоры, сроки и программу подготовки в одном рабочем пространстве.",
  },
  {
    number: "03",
    title: "Обсудите решения",
    text: "Смотрите ход обучения, разбирайте выборы и планируйте следующий навык без лишней отчётности.",
  },
];

const audiences = [
  {
    label: "Сотруднику",
    title: "Понятно, что делать дальше",
    text: "Личная лента заданий, подготовка к разговору и история собственного прогресса.",
    points: ["Сегодняшняя практика", "Подсказка к следующему шагу"],
  },
  {
    label: "Руководителю",
    title: "Команда движется в одном направлении",
    text: "Назначения и сроки остаются под контролем, а результаты видны в пределах выданных прав.",
    points: ["Задания для команды", "Прогресс без микроменеджмента"],
  },
  {
    label: "HR и обучению",
    title: "Обучение связано с рабочими задачами",
    text: "Библиотека кейсов, программы и понятный обзор навыков для развития сотрудников.",
    points: ["Сценарии под профессию", "Динамика навыков"],
  },
];

const formats = [
  {
    name: "Команда",
    note: "Совместный старт",
    text: "Приглашения, кейсы, задания и результаты в одном пространстве.",
    accent: "is-featured",
  },
  {
    name: "Бизнес",
    note: "Несколько подразделений",
    text: "Программы, структура, командная аналитика и сертификаты.",
  },
  {
    name: "Корпорация",
    note: "Индивидуальное подключение",
    text: "Требования к доступу, размещению и интеграциям согласуются отдельно.",
  },
];

function ProductPreview() {
  return (
    <div className="business-preview" aria-label="Пример рабочего пространства компании">
      <div className="business-preview-bar">
        <span className="business-preview-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>Рабочее пространство</span>
        <span className="business-preview-status"><i /> в работе</span>
      </div>
      <div className="business-preview-body">
        <span className="business-preview-kicker">Кейс недели</span>
        <h2>Сложный разговор с клиентом</h2>
        <p>Команда тренирует согласование сроков и сохранение доверия.</p>
        <div className="business-preview-progress" aria-label="Прогресс команды: 68 процентов"><span /></div>
        <div className="business-preview-meta"><span><b>12</b> участников</span><span><b>4</b> шага</span><span><b>68%</b> прогресс</span></div>
      </div>
      <div className="business-preview-footer"><span><i className="is-done"><CheckIcon size={12} aria-hidden="true" /></i> Сценарий открыт</span><span>до 24 октября <ArrowRightIcon size={14} aria-hidden="true" /></span></div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, text, id }) {
  return <div className="business-section-heading"><span className="business-eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2>{text && <p>{text}</p>}</div>;
}

export default function BusinessLanding() {
  const { user, ready } = useAuth();
  const [interest, setInterest] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", company: "", email: "", message: "", consent: false, website: "" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    document.title = "Арена для бизнеса — практика переговоров для команд";
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
      setError(cause.message);
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
  return (
    <div className="business-public">
      <a href="#business-public-main" className="business-skip">К содержимому</a>
      <header className="business-public-header">
        <div className="business-public-header-inner">
          <Link className="business-public-brand" to="/" aria-label="Арена переговоров — главная">
            <img src="/assets/arena-owl-logo.png" width="38" height="38" alt="" />
            <span>АРЕНА<small>ПЕРЕГОВОРОВ</small></span>
          </Link>
          <nav className="business-public-anchor-nav" aria-label="Навигация по странице">
            <a href="#workflow">Как это работает</a>
            <a href="#audiences">Для кого</a>
            <a href="#formats">Форматы</a>
          </nav>
          <div className="business-public-header-actions">
            <Link className="business-public-for-self" to="/">Для себя</Link>
            <Link className="business-text-link" to="/?auth=login">Личный вход</Link>
            <Link className="business-header-company" to="/business/login">Кабинет компании</Link>
          </div>
          <button className="business-public-menu-button" type="button" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="business-public-mobile-menu" onClick={() => setMobileMenuOpen((open) => !open)}>
            {mobileMenuOpen ? <XIcon size={21} aria-hidden="true" /> : <ListIcon size={21} aria-hidden="true" />}
          </button>
        </div>
        {mobileMenuOpen && <nav id="business-public-mobile-menu" className="business-public-mobile-menu" aria-label="Мобильная навигация">
          <a className="business-public-mobile-link" href="#workflow" onClick={() => setMobileMenuOpen(false)}>Как это работает</a>
          <a className="business-public-mobile-link" href="#audiences" onClick={() => setMobileMenuOpen(false)}>Для кого</a>
          <a className="business-public-mobile-link" href="#formats" onClick={() => setMobileMenuOpen(false)}>Форматы</a>
          <div className="business-public-mobile-actions">
            <Link to="/">Для себя</Link>
            <Link to="/?auth=login">Личный вход</Link>
            <Link className="is-primary" to="/business/login">Кабинет компании</Link>
          </div>
        </nav>}
      </header>

      <main id="business-public-main">
        <section className="business-hero" aria-labelledby="business-hero-title">
          <img className="business-hero-forest" src="/assets/forest2d/hero.webp" alt="" aria-hidden="true" fetchPriority="high" />
          <div className="business-hero-inner">
            <div className="business-hero-copy">
              <span className="business-eyebrow">Арена для бизнеса · обучение команд</span>
              <h1 id="business-hero-title">Договариваться проще, когда команда тренируется вместе.</h1>
              <p>Практика переговоров для вашей команды — от рабочего кейса до разбора конкретных решений.</p>
              <div className="business-hero-actions">
                <Link className="primary-button" to="/business/register?next=%2Fbusiness%2Fcreate">Создать рабочее пространство <ArrowRightIcon size={17} aria-hidden="true" /></Link>
                <button className="subtle-button" type="button" onClick={() => request("demo")}>Запросить демонстрацию</button>
              </div>
              <Link className="business-hero-demo-link" to="/business/demo">Попробовать учебный кабинет <ArrowRightIcon size={15} aria-hidden="true" /></Link>
              <div className="business-hero-note"><span className="business-note-mark"><CheckIcon size={14} aria-hidden="true" /></span><span>Личный аккаунт остаётся вашим. Корпоративные задания и результаты живут отдельно.</span></div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="business-proof" aria-label="Что получает компания">
          <div><span>01</span><strong>Рабочие кейсы</strong><p>Ситуации из вашей практики</p></div>
          <div><span>02</span><strong>Единый ритм</strong><p>Задания и сроки для команды</p></div>
          <div><span>03</span><strong>Понятный итог</strong><p>Разбор решений и следующий шаг</p></div>
        </section>

        <section id="workflow" className="business-public-section business-workflow-section" aria-labelledby="workflow-title">
          <SectionHeading id="workflow-title" eyebrow="Рабочий цикл" title="От ситуации к следующему навыку." text="Один понятный процесс для сотрудника, руководителя и команды обучения." />
          <div className="business-workflow-grid">
            {workflow.map((step) => <article key={step.number} className="business-workflow-card"><span className="business-card-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p><span className="business-card-line" aria-hidden="true" /></article>)}
          </div>
        </section>

        <section id="audiences" className="business-public-section business-audience-section" aria-labelledby="audiences-title">
          <SectionHeading id="audiences-title" eyebrow="Один продукт — три фокуса" title="Каждому понятно, что делать дальше." />
          <div className="business-audience-grid">
            {audiences.map((audience) => <article key={audience.label} className="business-audience-card"><span className="business-card-label">{audience.label}</span><h3>{audience.title}</h3><p>{audience.text}</p><ul>{audience.points.map((point) => <li key={point}><CheckIcon size={15} aria-hidden="true" />{point}</li>)}</ul></article>)}
          </div>
        </section>

        <section id="formats" className="business-public-section business-format-section" aria-labelledby="formats-title">
          <div className="business-format-heading"><SectionHeading id="formats-title" eyebrow="Форматы подключения" title="Пространство под вашу команду." text="Начните с одного кейса и расширяйте практику по мере роста команды." /><button className="business-text-action" type="button" onClick={() => request("proposal")}>Обсудить условия <ArrowRightIcon size={16} aria-hidden="true" /></button></div>
          <div className="business-format-grid">
            {formats.map((format) => <article key={format.name} className={"business-format-card " + (format.accent || "")}><div className="business-format-top"><span>{format.name}</span>{format.accent && <b>Для старта</b>}</div><h3>{format.note}</h3><p>{format.text}</p><button className="business-format-link" type="button" onClick={() => request("proposal")}>Обсудить формат <ArrowRightIcon size={15} aria-hidden="true" /></button></article>)}
          </div>
        </section>

        <section ref={formRef} id="business-contact" className="business-contact" aria-labelledby="contact-title">
          <div className="business-contact-intro"><span className="business-eyebrow">Следующий шаг</span><h2 id="contact-title">Начнём с вашей задачи.</h2><p>Расскажите, кого и к каким разговорам вы готовите. Мы покажем, как собрать первый рабочий кейс.</p><button className="business-text-action business-contact-integration" type="button" onClick={() => request("integration")}>Запросить интеграцию <ArrowRightIcon size={16} aria-hidden="true" /></button><span className="business-contact-note">Ответим в рабочее время. Оплата на сайте пока не подключена.</span></div>
          {success ? <div className="business-contact-confirmation" role="status"><span className="business-success-mark"><CheckIcon size={22} aria-hidden="true" /></span><h3>Запрос сохранён</h3><p>Контакт и описание задачи переданы команде. Если хотите, можно сразу создать рабочее пространство.</p><Link className="primary-button" to="/business/register?next=%2Fbusiness%2Fcreate">Создать пространство <ArrowRightIcon size={16} aria-hidden="true" /></Link></div> : <form className="business-contact-form" onSubmit={submit}><div className="business-form-heading"><strong>{formAction}</strong><span>Заполните форму — это займёт около минуты.</span></div><div className="business-form-grid\"><label>Ваше имя<input name="name" required minLength="2" maxLength="120" value={form.name} onChange={update} autoComplete="name" placeholder="Имя и фамилия" /></label><label>Компания<input name="company" required minLength="2" maxLength="180" value={form.company} onChange={update} autoComplete="organization" placeholder="Название компании" /></label></div><label>Рабочая почта<input type="email" name="email" required value={form.email} onChange={update} autoComplete="email" placeholder="name@company.ru" /></label><label>Задача команды<textarea name="message" maxLength="3000" rows="4" value={form.message} onChange={update} placeholder="Например: хотим подготовить менеджеров к сложным переговорам с клиентами" /></label><label className="business-honeypot" aria-hidden="true">Сайт<input name="website" tabIndex="-1" autoComplete="off" value={form.website} onChange={update} /></label><label className="business-consent"><input type="checkbox" name="consent" required checked={form.consent} onChange={update} /><span>Согласен на обработку указанных контактов для ответа на этот запрос.</span></label>{error && <p className="business-alert" role="alert">{error}</p>}<button disabled={busy} className="primary-button" type="submit">{busy ? "Сохраняем…" : formAction} <ArrowRightIcon size={16} aria-hidden="true" /></button></form>}
        </section>
      </main>

      <footer className="business-public-footer"><BusinessBrand /><p>Тренировки, задания и развитие команды.</p><Link to="/">Личная Арена <ArrowRightIcon size={15} aria-hidden="true" /></Link></footer>
    </div>
  );
}
