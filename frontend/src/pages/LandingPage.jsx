import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { useAuth } from "../auth.jsx";
import { howSteps, quickAnswers, team, useCases } from "./landingContent.js";
import "./landing.css";

const privateEntry = (path, user) => user ? path : `/register?next=${encodeURIComponent(path)}`;
const loginEntry = "/login?next=%2Fapp";

function LandingHeader({ user }) {
  return <header className="landing-header">
    <div className="landing-header-inner">
      <a className="landing-brand" href="#top" aria-label="Арена переговоров — наверх"><span className="landing-brand-symbol" aria-hidden="true">А</span><span>АРЕНА<small>ПЕРЕГОВОРОВ</small></span></a>
      <Link className="landing-header-login" to={user ? "/app" : loginEntry}>{user ? "В кабинет" : "Войти"}</Link>
    </div>
  </header>;
}

function SectionHeading({ number, eyebrow, title, description, id }) {
  return <div className="landing-section-heading"><span className="landing-section-index" aria-hidden="true">{number}</span><div><span className="landing-eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div></div>;
}

function HeroPreview() {
  return <div className="landing-hero-preview" aria-label="Иллюстрация тренировки: ответ клиента, варианты решения и обратная связь">
    <div className="landing-preview-top"><div className="landing-window-dots" aria-hidden="true"><i /><i /><i /></div><span>СЦЕНАРИЙ / РАЗГОВОР С КЛИЕНТОМ</span><b>01 / 04</b></div>
    <div className="landing-preview-body"><div className="landing-preview-context"><span className="landing-mini-avatar">К</span><div><small>КЛИЕНТ</small><p>Ваше предложение дороже конкурента на 18%. Почему я должен выбрать вас?</p></div></div>
      <span className="landing-preview-caption">КАК ВЫ ОТВЕТИТЕ?</span>
      <div className="landing-preview-option is-highlighted"><span>A</span><p>Давайте сначала уточним, какие параметры вы сравниваете кроме цены.</p><i aria-hidden="true">↗</i></div>
      <div className="landing-preview-option"><span>Б</span><p>У нас выше качество и лучше поддержка.</p></div>
      <div className="landing-preview-option"><span>В</span><p>Если вопрос только в цене, можем обсудить скидку.</p></div>
      <div className="landing-preview-feedback"><strong>СИЛЬНЫЙ ХОД</strong><p>Вы не начали защищать цену, пока не выяснили критерии сравнения.</p></div>
    </div>
  </div>;
}

function QuickTry({ user }) {
  const [answer, setAnswer] = useState(null);
  const selected = quickAnswers.find((item) => item.id === answer);
  return <section id="quick-try" className="landing-section landing-quick-section" aria-labelledby="quick-title"><div className="landing-container">
    <SectionHeading number="01 / 12" eyebrow="20 СЕКУНД ПРАКТИКИ" title="Попробуйте один ход прямо сейчас" id="quick-title" />
    <div className="landing-quick-grid"><div className="landing-quick-case"><span className="landing-case-tag">СИТУАЦИЯ / РУКОВОДИТЕЛЬ И СОТРУДНИК</span><div className="landing-quick-quote"><span className="landing-mini-avatar">С</span><blockquote>Я уже третий раз получаю больше ответственности, но это никак не отражается на моей роли.</blockquote></div><h3>Как вы начнёте разговор?</h3></div>
      <div className="landing-quick-play"><div className="landing-quick-top"><span>ВАШ ХОД</span><span>01 / 01</span></div><div className="landing-quick-answers">{quickAnswers.map((item) => <button key={item.id} type="button" aria-pressed={answer === item.id} disabled={answer !== null} onClick={() => setAnswer(item.id)}><span>{item.id.toUpperCase()}</span>{item.text}</button>)}</div>
        {selected && <div className="landing-quick-result" role="status" aria-live="polite"><span>{selected.label}</span><p>{selected.feedback}</p><div><button type="button" onClick={() => setAnswer(null)}>Переиграть ход</button><Link to={privateEntry("/scenarios", user)}>Пройти полную тренировку <ArrowRightIcon size={17} aria-hidden="true" /></Link></div></div>}
      </div></div>
  </div></section>;
}

export default function LandingPage() {
  const { user } = useAuth();
  return <div className="landing" id="top">
    <a className="landing-skip" href="#main-content">К содержимому</a>
    <LandingHeader user={user} />
    <main id="main-content">
      <section className="landing-hero" aria-labelledby="landing-title">
        <picture className="landing-forest" aria-hidden="true"><source media="(max-width: 767px)" srcSet="/assets/forest2d/hero-mobile.webp" /><img src="/assets/forest2d/hero.webp" alt="" fetchPriority="high" /></picture>
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow"><i aria-hidden="true" /> ТРЕНИРОВОЧНАЯ ПЛОЩАДКА ДЛЯ СЛОЖНЫХ РАЗГОВОРОВ</span>
            <h1 id="landing-title">Переговоры лучше тренировать <em>до того, как они станут реальными.</em></h1>
            <p>Практикуйте собеседования, торг, сложные разговоры и рабочие конфликты. Пробуйте разные формулировки, наблюдайте последствия и получайте понятный разбор своих решений.</p>
            <div className="landing-hero-actions"><a className="landing-button landing-button-primary" href="#quick-try">Попробовать один ход <ArrowRightIcon size={19} aria-hidden="true" /></a></div>
          </div>
          <HeroPreview />
        </div>
      </section>

      <QuickTry user={user} />

      <section id="features" className="landing-section landing-feature-section" aria-labelledby="features-title"><div className="landing-container"><SectionHeading number="02 / 12" eyebrow="СИТУАЦИИ" title="Разговоры, в которых обычно нельзя нажать «переиграть»" description="Здесь — можно. Тренируйте подход до настоящей встречи." id="features-title" /><div className="landing-use-grid">{useCases.map((item) => <article key={item.number} className="landing-use-card"><span>{item.number} / СИТУАЦИЯ</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></div></section>

      <section id="modes" className="landing-section landing-modes-section" aria-labelledby="modes-title"><div className="landing-container"><SectionHeading number="03 / 12" eyebrow="РЕЖИМЫ" title="Тренируйтесь по-разному" description="Выберите формат под задачу: изучить приём, проверить решение в сюжете или поговорить с человеком." id="modes-title" /><div className="landing-mode-grid"><article className="landing-mode-card landing-mode-training"><div className="landing-mode-top"><span>01 / AI TRAINING</span><span>ЗНАНИЯ + ПРАКТИКА</span></div><h3>Учитесь и сразу применяйте</h3><p>Короткая теория по методам переговоров и сюжетная практика с постепенным усложнением.</p><div className="landing-mode-visual landing-mode-path" aria-hidden="true"><div><span>01</span><strong>Теория</strong><i /></div><div><span>02</span><strong>Мини-практика</strong><i /></div><div><span>03</span><strong>Сценарий</strong><i /></div></div></article><article className="landing-mode-card"><div className="landing-mode-top"><span>02 / ИИ-ДИАЛОГ</span><span>СВОИМИ СЛОВАМИ</span></div><h3>Свободная практика с ИИ</h3><p>Настройте ситуацию, цель и собеседника. Проведите разговор своими словами и посмотрите разбор.</p><div className="landing-mode-visual landing-mode-chat" aria-hidden="true"><span>Ваша ситуация</span><div>Что важно для другой стороны?</div><div>Уточним условия и найдём вариант.</div></div></article><article className="landing-mode-card"><div className="landing-mode-top"><span>03 / ONLINE 1×1</span><span>ЖИВОЙ РАЗГОВОР</span></div><h3>Практика с человеком</h3><p>Встретьтесь с другим участником, обсудите общую ситуацию и получите структурированный разбор.</p><div className="landing-mode-visual landing-mode-pair" aria-hidden="true"><span>А</span><i>↔</i><span>Б</span></div></article></div></div></section>

      <section id="how" className="landing-section landing-how-section" aria-labelledby="how-title"><div className="landing-container"><SectionHeading number="04 / 12" eyebrow="ЛОГИКА ТРЕНИРОВКИ" title="Как это работает" description="Одна тренировка — понятный путь от ситуации до следующей, более сильной попытки." id="how-title" /><div className="landing-how-grid">{howSteps.map((step) => <article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div><div className="landing-conversation-line" aria-label="Линия разговора: ситуация, ваш ход, реакция, новая информация, следующий ход, разбор">{["Ситуация", "Ваш ход", "Реакция", "Новая информация", "Следующий ход", "Разбор"].map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}</div></div></section>

      <section className="landing-section landing-difference-section" aria-labelledby="difference-title"><div className="landing-container"><SectionHeading number="05 / 12" eyebrow="ПОЧЕМУ ЭТО ТРЕНИРОВКА" title="Не просто поговорить с ботом" description="Обычный AI-чат и тренажёр решают разные задачи. Здесь важны не только ответы, но и последствия решений." id="difference-title" /><div className="landing-compare-grid"><div className="landing-compare-card"><span>ОБЫЧНЫЙ AI-ЧАТ</span><h3>Свободный разговор</h3><p>Помогает исследовать тему и сформулировать ответ. Структуру тренировки, цель и критерии результата обычно задаёте сами.</p></div><div className="landing-compare-card is-arena"><span>АРЕНА ПЕРЕГОВОРОВ</span><h3>Ситуация → решение → разбор</h3><p>Контекст и цель задаются до старта. Ходы меняют состояние сессии, а после разговора можно посмотреть результат и пройти её иначе.</p></div></div><div className="landing-branch"><div className="landing-branch-start"><small>КЛИЕНТ</small><strong>«Это слишком дорого»</strong></div><div className="landing-branch-grid"><div><span>ОДНА ФРАЗА</span><p>«Тогда можем сделать скидку»</p><strong>«Хорошо, а ещё дешевле?»</strong></div><div><span>ДРУГАЯ ФРАЗА</span><p>«С чем вы сейчас сравниваете наше предложение?»</p><strong>«С прошлогодним контрактом. Там был меньший объём».</strong></div></div><p>Одна формулировка может открыть совсем другую информацию.</p></div></div></section>

      <section className="landing-section landing-report-section" aria-labelledby="report-title"><div className="landing-container landing-report-grid"><div><SectionHeading number="06 / 12" eyebrow="ПОСЛЕ РАЗГОВОРА" title="Остаётся не просто история сообщений" description="Разбор показывает влияние решений в одной тренировке, а не оценивает личность." id="report-title" /></div><div className="landing-report-mock"><div className="landing-report-head"><span>ПРИМЕР ОТЧЁТА · УСЛОВНЫЕ ДАННЫЕ</span><strong>СЕССИЯ ЗАВЕРШЕНА</strong></div><div className="landing-report-summary"><span>ИТОГОВЫЙ РАЗБОР</span><h3>Разговор перешёл от цены к условиям сотрудничества.</h3><p>Вы уточнили критерии клиента и предложили обсудить ценность, прежде чем уступать в цене.</p></div><div className="landing-report-metrics">{[["Доверие", 72], ["Цель", 64], ["Контроль", 68], ["EQ", 81]].map(([name, value]) => <div key={name}><span>{name}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}</b></div>)}</div><div className="landing-report-insights"><div><span>СИЛЬНЫЙ ХОД</span><p>Уточнили параметры сравнения.</p></div><div><span>ЗОНА РОСТА</span><p>Зафиксируйте следующий шаг и срок ответа.</p></div></div></div></div></section>

      <section className="landing-section landing-learning-section" aria-labelledby="learning-title"><div className="landing-container"><SectionHeading number="07 / 12" eyebrow="ТЕОРИЯ + ПРАКТИКА" title="Сначала понять метод. Потом проверить его в разговоре" description="Метод сначала объясняется, затем проверяется на небольшом кейсе и позже встречается в более сложной ситуации." id="learning-title" /><div className="landing-learning-grid"><div className="landing-learning-lessons"><article><span>УРОК 01 / ПОДГОТОВКА</span><h3>BATNA</h3><p>Что делать, если соглашения не будет, и где проходит ваша реальная граница.</p></article><article><span>УРОК 02 / УСЛОВИЯ</span><h3>ZOPA</h3><p>Где пересекаются допустимые условия сторон и как искать пространство сделки.</p></article></div><div className="landing-learning-practice"><span>СЮЖЕТНАЯ ПРАКТИКА</span><h3>Поставщик меняет условия перед отгрузкой.</h3><p>Выберите ход, посмотрите реакцию и решите, стоит ли менять предложение.</p><div>ТЕОРИЯ <i>→</i> МИНИ-ПРАКТИКА <i>→</i> СЦЕНАРИЙ <i>→</i> РАЗБОР</div></div></div></div></section>

      <section className="landing-section landing-rooms-section" aria-labelledby="rooms-title"><div className="landing-container landing-rooms-grid"><div><span className="landing-eyebrow">08 / 12 · ONLINE 1×1</span><h2 id="rooms-title">Когда нужен настоящий собеседник</h2><p>Online 1×1 позволяет практиковаться не только против сценария или ИИ, но и с другим участником. У каждого своя позиция, а разговор — общий.</p><Link className="landing-button landing-button-primary" to="/demo/rooms">Изучить формат 1×1 <ArrowUpRightIcon size={19} aria-hidden="true" /></Link></div><div className="landing-rooms-visual" aria-label="Этапы встречи один на один"><div className="landing-rooms-orbits"><span>А<small>ВАША СТОРОНА</small></span><i>×</i><span>Б<small>ПАРТНЁР</small></span></div><div className="landing-rooms-flow">{["Приглашение", "Подключение", "Разговор", "Разбор"].map((item, index) => <span key={item}>{String(index + 1).padStart(2, "0")} / {item}</span>)}</div></div></div></section>

      <section id="companies" className="landing-section landing-company-section" aria-labelledby="companies-title"><div className="landing-container"><SectionHeading number="09 / 12" eyebrow="ДЛЯ КОМПАНИЙ" title="Тренировки, которые можно превратить в корпоративный инструмент" description="Для L&D, HR и руководителей команд: единые задачи и видимый прогресс без учебной формальности." id="companies-title" /><div className="landing-company-grid"><div><span>УЖЕ В ПРОДУКТЕ</span><ul><li>Пространство компании и сотрудники</li><li>Задания, попытки и сроки</li><li>Программы и аналитика результатов</li></ul></div><div><span>РАЗВИВАЕМ</span><ul><li>Более гибкие корпоративные сценарии</li><li>Новые способы сравнивать прогресс команд</li></ul></div></div></div></section>

      <section className="landing-section landing-origin-section" aria-labelledby="origin-title"><div className="landing-container landing-origin-grid"><span className="landing-eyebrow">10 / 12 · ПОЧЕМУ МЫ ЭТО СДЕЛАЛИ</span><div><h2 id="origin-title">Знать теорию недостаточно.</h2><p>Перед сложным разговором можно помнить десятки правильных принципов, но в реальной ситуации всё решает конкретная формулировка.</p><p>Нам хотелось создать место, где можно безопасно ошибиться, увидеть, что изменилось после одной реплики, и сразу попробовать другой ход. Поэтому продукт строится вокруг практики, повторения и разбора.</p></div></div></section>

      <section className="landing-facts" aria-label="Что уже есть в продукте"><div className="landing-container"><span>10 <small>теоретических методов</small></span><span>4 <small>метрики результата одной сессии</small></span><span>1×1 <small>практика с человеком</small></span></div></section>

      <section id="team" className="landing-section landing-team-section" aria-labelledby="team-title"><div className="landing-container"><SectionHeading number="11 / 12" eyebrow="ЛЮДИ ЗА ПРОДУКТОМ" title="Команда проекта" description="Мы вместе проектируем механику переговоров, интерфейс и техническую платформу." id="team-title" /><div className="landing-team-grid">{team.map((person, index) => <article key={person.name}><span className={`landing-team-monogram landing-team-monogram-${index + 1}`} aria-hidden="true">{person.initials}</span><span className="landing-team-number">{String(index + 1).padStart(2, "0")} / КОМАНДА</span><h3>{person.name}</h3><p>{person.role}</p></article>)}</div></div></section>

      <section className="landing-section landing-final-section" aria-labelledby="final-title"><div className="landing-container landing-final-inner"><span className="landing-eyebrow">12 / 12 · ВАШ СЛЕДУЮЩИЙ ХОД</span><h2 id="final-title">Следующий сложный разговор можно <em>сначала потренировать.</em></h2><p>Выберите ситуацию, попробуйте свой подход и посмотрите, что изменится.</p><div><Link className="landing-button landing-button-primary" to={user ? "/training" : "/register?next=%2Ftraining"}>{user ? "Продолжить обучение" : "Начать тренировку"} <ArrowRightIcon size={19} aria-hidden="true" /></Link></div></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-container landing-footer-grid"><div><a className="landing-brand" href="#top"><span className="landing-brand-symbol" aria-hidden="true">А</span><span>АРЕНА<small>ПЕРЕГОВОРОВ</small></span></a><p>Интерактивный тренажёр переговоров и сложных разговоров.</p></div><nav aria-label="Навигация внизу страницы"><strong>Разделы</strong><a href="#features">Возможности</a><a href="#modes">AI Training</a><a href="#rooms-title">Online 1×1</a><a href="#companies">Для компаний</a><a href="#team">Команда</a></nav><nav aria-label="Аккаунт"><strong>Аккаунт</strong>{user ? <><Link to="/app">В кабинет</Link><Link to="/profile">Профиль</Link></> : <><Link to={loginEntry}>Войти</Link><Link to="/register?next=%2Fapp">Регистрация</Link></>}</nav><div><strong>Команда</strong>{team.map((person) => <span key={person.name}>{person.name}</span>)}</div></div><div className="landing-container landing-footer-bottom"><span>© {new Date().getFullYear()} Арена переговоров</span></div></footer>
  </div>;
}
