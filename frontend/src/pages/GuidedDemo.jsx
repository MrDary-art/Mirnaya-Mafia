import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import "./guided-demo.css";

const examples = {
  purchase: { label: "Согласовать цену", mode: "human", topic: "Поставка фруктов для кафе", host: "Закупщик кафе", goal: "Получить скидку за регулярные поставки", guestGoal: "Сохранить маржу и договориться о стабильном объёме", roles: ["Владелец поставщика", "Менеджер оптовых продаж"], descriptions: ["Принимает решения о цене и долгосрочном сотрудничестве.", "Обсуждает объём, график и условия поставок."], offer: "Если будем заказывать каждую неделю, какую цену вы сможете предложить?", reply: "Давайте зафиксируем объём. Тогда я смогу обсудить скидку.", insight: "Вопрос о регулярности перевёл спор о цене в обсуждение взаимной выгоды.", better: "Предложите конкретный объём и дату первой поставки." },
  project: { label: "Обсудить сроки", mode: "human", topic: "Заказчик добавил задачи перед запуском", host: "Руководитель проекта", goal: "Согласовать новый объём без переработок команды", guestGoal: "Сохранить важные функции к дате запуска", roles: ["Представитель заказчика", "Владелец продукта"], descriptions: ["Отвечает за договорённости и приоритеты заказчика.", "Определяет, какие функции нужны в первой версии."], offer: "Какие две функции критичны к запуску, а что можно перенести?", reply: "Оплата обязательна. Отчёты можем выпустить следующей версией.", insight: "Уточнение приоритетов позволило разделить обязательные и отложенные задачи.", better: "Зафиксируйте состав первой версии и дату следующего релиза." },
  interview: { label: "Два собеседования", mode: "duel", topic: "Собеседование на Python-разработчика", host: "Кандидат А", goal: "Показать навыки на практических задачах", guestGoal: "Пройти такое же собеседование независимо", roles: ["Кандидат Б"], descriptions: ["Те же условия и вопросы. Ответы первого кандидата скрыты."], offer: "Я ускорил обработку заказов: убрал повторные запросы к базе.", reply: "Как вы измерили ускорение и проверили, что данные остались корректными?", insight: "Конкретный пример даёт интервьюеру основание проверить опыт.", better: "Добавьте измеримый результат и способ проверки решения." },
};

function Chapter({ id, number, title, intro, children }) {
  return <section className="exhibit-chapter" id={id}>
    <div className="exhibit-chapter-copy"><span className="exhibit-kicker">{number} / КАК ЭТО РАБОТАЕТ</span><h2>{title}</h2><p>{intro}</p></div>
    <div className="exhibit-scene">{children}</div>
  </section>;
}
function Screen({ side, title, children, light = false }) {
  return <article className={`exhibit-screen${light ? " exhibit-screen--guest" : ""}`}><header><span className="exhibit-avatar">{light ? "Б" : "А"}</span><div><small>{side}</small><h3>{title}</h3></div><span className="exhibit-screen-dots" aria-hidden="true">•••</span></header><div className="exhibit-screen-body">{children}</div></article>;
}
function Fact({ label, children, privateInfo = false }) {
  return <div className="exhibit-fact"><small>{privateInfo && <LockSimpleIcon size={13}/>} {label}</small><strong>{children}</strong></div>;
}
function Wave({ label }) {
  return <div className="exhibit-voice"><MicrophoneIcon size={19}/><span className="exhibit-wave" aria-hidden="true">{[3,7,5,11,8,4,10,15,9,5,12,8,4,7,11,5,8,3].map((h,i)=><i key={i} style={{height:h*2,animationDelay:`${i*50}ms`}}/>)}</span><small>{label}</small></div>;
}

export default function GuidedDemo() {
  const [example, setExample] = useState("purchase");
  const [role, setRole] = useState(0);
  const [playing, setPlaying] = useState(false);
  const root = useRef(null);
  const data = examples[example]; const duel = data.mode === "duel";
  const guestGoal = role === 0 ? data.guestGoal : example === "purchase"
    ? "Согласовать минимальный еженедельный заказ и оплату до отгрузки"
    : "Выделить обязательные функции и согласовать второй этап работ";
  useEffect(() => {
    const node = root.current;
    const observer = new IntersectionObserver((entries) => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("is-seen"); observer.unobserve(entry.target); }
    }), {threshold:.08});
    node.querySelectorAll(".exhibit-chapter").forEach(el=>observer.observe(el));
    let frame;
    const follow = () => {
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
        const anchors = [...node.querySelectorAll("h1,h2")];
        const active = anchors.reduce((a,b)=>Math.abs(a.getBoundingClientRect().top-innerHeight*.3)<Math.abs(b.getBoundingClientRect().top-innerHeight*.3)?a:b);
        const box = active.getBoundingClientRect(); const size = innerWidth<768 ? 100 : 210;
        window.dispatchEvent(new CustomEvent("arena:demo-guide",{detail:{x:innerWidth-size/2-18,y:Math.max(size/2+30,Math.min(innerHeight-size/2-30,box.top+60)),size}}));
      });
    };
    follow(); window.addEventListener("scroll",follow,{passive:true}); window.addEventListener("resize",follow);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener("scroll",follow);window.removeEventListener("resize",follow);};
  }, []);
  function choose(value) { setExample(value);setRole(0);setPlaying(false); }
  return <div className="exhibit" ref={root}>
    <header className="exhibit-hero"><div className="exhibit-kicker">АРЕНА ПЕРЕГОВОРОВ / ИНТЕРАКТИВНЫЙ ОБЗОР</div><div className="exhibit-hero-grid"><div><h1>Одна ситуация.<br/><em>Две стороны.</em><br/>Ваш разговор.</h1><p>Как устроена встреча 1×1 — глазами каждого участника. От первой задачи до понимания, что в следующий раз можно сделать лучше.</p><a className="exhibit-scroll" href="#exhibit-formats">Листайте и смотрите ↓</a></div><div className="exhibit-poster" aria-label="Схема: два участника и общая задача"><span className="exhibit-poster-caption">У КАЖДОГО СВОЯ ПОЗИЦИЯ</span><div className="exhibit-orbits"><div className="exhibit-orbit orbit-a">А<small>ваша цель</small></div><div className="exhibit-orbit orbit-b">Б<small>другая сторона</small></div></div><div className="exhibit-poster-bottom"><span>Общая ситуация</span><strong>Найдите решение<br/>вместе.</strong><ArrowUpRightIcon size={32}/></div></div></div><div className="exhibit-footnote"><span>Обзор для знакомства с продуктом</span><span>Без звонка · без микрофона · без бронирования</span></div></header>

    <section className="exhibit-formats" id="exhibit-formats"><div className="exhibit-kicker">СНАЧАЛА — ФОРМАТ</div><h2>С человеком.<br/>Или параллельно с ИИ?</h2><div className="exhibit-format-grid"><article><span>01</span><h3>Человек ↔ человек</h3><p>Вы и партнёр получаете разные роли в одной ситуации. Обсуждаете условия голосом и видео. ИИ помогает подготовить сценарий и разобрать разговор.</p></article><article><span>02</span><h3>Два человека ↔ ИИ</h3><p>Вы оба подтверждаете участие. В назначенное время открывается общий час: каждый проходит своё интервью, когда ему удобно. Затем ИИ выбирает, кто справился лучше, и даёт каждому личный разбор.</p></article></div></section>
    <div className="exhibit-example-bar"><span>Посмотреть на примере</span><div role="group" aria-label="Пример ситуации">{Object.entries(examples).map(([key,item])=><button key={key} aria-pressed={example===key} onClick={()=>choose(key)}>{item.label}</button>)}</div><p>Ниже — иллюстрация интерфейса. Все реплики и результаты в обзоре условные.</p></div>

    <Chapter id="exhibit-invite" number="01" title="С чего начинается встреча?" intro="Вы описываете ситуацию, желаемый результат и выбираете время по Москве. Отправляете партнёру код. Он видит, куда и зачем его приглашают.">
      <div className="exhibit-pair"><Screen side="ВЫ · СОЗДАТЕЛЬ" title="Готовите встречу"><Fact label="Ситуация">{data.topic}</Fact><Fact label="Ваш желаемый результат" privateInfo>{data.goal}</Fact><div className="exhibit-calendar"><small>ПРИМЕР БРОНИ · МСК</small><div>{["ПН","ВТ","СР","ЧТ","ПТ"].map((day,i)=><span key={day} className={i===2?"chosen":""}>{day}<b>{21+i}</b></span>)}</div><strong>СР · {duel ? "15:00 — 16:00" : "15:00 — 15:15"}</strong></div><div className="exhibit-code">Код приглашения <b>DEMO-7Q4K</b></div></Screen><Screen side="ПАРТНЁР · ПО КОДУ" title="Знакомится с условиями" light><span className="exhibit-pill">Приглашение в 1×1</span><h4>{data.topic}</h4><p>Создатель: Алексей<br/>Среда, 15:00 МСК · {duel ? "час на прохождение" : "15 минут"}</p><div className="exhibit-note"><CheckIcon size={18}/><span>Тема и условия доступны до входа.</span></div><div className="exhibit-note"><LockSimpleIcon size={18}/><span>Личная цель создателя остаётся скрытой.</span></div></Screen></div>
    </Chapter>
    <Chapter id="exhibit-roles" number="02" title={duel?"Почему задания одинаковые?":"А кем будет второй участник?"} intro={duel?"Для сравнения нужны одинаковые условия. Здесь оба — кандидаты на одну роль. Каждый проходит своё интервью и не видит чужих ответов.":"ИИ читает задачу создателя и предлагает подходящие роли другой стороны. Партнёр выбирает, кого хочет сыграть. Попробуйте выбор справа — личное задание ниже изменится."}>
      <div className="exhibit-pair"><Screen side="ВЫ" title="Ваша сторона"><Fact label="Ваша роль">{data.host}</Fact><Fact label="Личная цель" privateInfo>{data.goal}</Fact><p>Тема остаётся общей. У каждого — своя позиция и свои основания для решений.</p><div className="exhibit-seal"><span>1×1</span><small>ДВА УЧАСТНИКА<br/>ОДНА СИТУАЦИЯ</small></div></Screen><Screen side="ВТОРОЙ УЧАСТНИК" title={duel?"Та же роль — своя попытка":"Выбирает роль"} light><fieldset className="exhibit-roles"><legend className="sr-only">Роль в примере</legend>{data.roles.map((name,i)=><label className={role===i?"selected":""} key={name}><input type="radio" name="demo-role" checked={role===i} onChange={()=>setRole(i)}/><span><b>{name}</b><small>{data.descriptions[i]}</small></span></label>)}</fieldset><Fact label="Личное задание после входа" privateInfo>{guestGoal}</Fact><p className="exhibit-selected-note">{data.descriptions[role]}</p></Screen></div><p className="exhibit-caption">В реальной комнате варианты создаются по вашей задаче. Если ИИ недоступен, показывается базовая роль с пояснением.</p>
    </Chapter>
    <Chapter id="demo-practice" number="03" title="Что происходит в самой встрече?" intro={duel?"Оба подтвердили участие — открылся час на прохождение. Алексей начинает в 15:05, Мария — в 15:30. У каждого до 15 минут на ответы, но закончить нужно до 16:00. Ответы второго кандидата скрыты.":"Оба участника проверяют устройства и подтверждают готовность. Когда наступает время встречи, начинается разговор. У каждого перед глазами своё задание."}>
      <div className="exhibit-pair"><Screen side={duel?"КАНДИДАТ А":"ВАШ ЭКРАН"} title={duel?"Отдельное интервью":"Разговор с партнёром"}><div className="exhibit-call"><div className="exhibit-silhouette">{duel?"ИИ":"Б"}</div><span>{duel?"Интервьюер":"Другая сторона"}</span><div className="exhibit-call-controls"><VideoCameraIcon size={18}/><MicrophoneIcon size={18}/><span>14:32</span></div></div><Fact label="Ваша задача">{data.goal}</Fact></Screen><Screen side={duel?"КАНДИДАТ Б":"ЭКРАН ПАРТНЁРА"} title={duel?"Независимая попытка":"Тот же разговор, другая цель"} light><div className="exhibit-call"><div className="exhibit-silhouette">{duel?"ИИ":"А"}</div><span>{duel?"Интервьюер":"Создатель встречи"}</span><div className="exhibit-call-controls"><VideoCameraIcon size={18}/><MicrophoneIcon size={18}/><span>14:32</span></div></div><Fact label="Его задача">{guestGoal}</Fact></Screen></div>
      <div className="exhibit-dialogue"><div><span className="exhibit-kicker">ПРИМЕР ФРАГМЕНТА</span><h3>Как выглядит обмен репликами?</h3><p>Нажмите, чтобы раскрыть короткий пример. Это анимация, звук не записывается.</p><button className="exhibit-button-secondary" onClick={()=>setPlaying(!playing)}>{playing?"Свернуть пример":"Показать пример разговора"}</button></div><div className="exhibit-transcript" aria-live="polite">{playing?<><div className="exhibit-bubble"><small>{duel?"Кандидат":"Вы"}</small><p>{data.offer}</p><Wave label="0:12"/></div><div className="exhibit-bubble reply"><small>{duel?"ИИ-интервьюер":data.roles[role]}</small><p>{data.reply}</p></div></>:<div className="exhibit-transcript-idle"><MicrophoneIcon size={34}/><p>{duel?"Две независимые беседы.":"Две стороны одного разговора."}<br/>Каждый ответ имеет значение.</p></div>}</div></div>
    </Chapter>
    <Chapter id="exhibit-report" number="04" title="Теперь — в зал ожидания." intro={duel ? "Закончили раньше? Можете вернуться позже. Когда оба завершат интервью, ИИ сравнит ответы на общую задачу, объявит результат и подготовит личные рекомендации." : "После разговора оба участника переходят в зал ожидания. ИИ разбирает реплики и готовит каждому обратную связь. Отчёт откроется автоматически."}>
      <div className="exhibit-waiting"><div><span className="exhibit-kicker">ЗАЛ ОЖИДАНИЯ</span><h3>{duel ? "Две попытки. Один честный итог." : "Разговор завершён. Разбор готовится."}</h3><p>{duel ? "15:45 МСК · Оба кандидата закончили. Сравниваем содержание ответов, аргументацию и конкретные примеры." : "Смотрим, как вы задавали вопросы, объясняли интересы и искали решение."}</p></div><div className="exhibit-waiting-status"><span><b>А</b> Алексей <small>Завершил <CheckIcon/></small></span><span><b>Б</b> Мария <small>Завершила <CheckIcon/></small></span><div className="exhibit-analysis"><i/><i/><i/> ИИ анализирует ответы</div></div></div>
      <div className="exhibit-report-label">ДАЛЬШЕ — ПРИМЕР ГОТОВОГО РЕЗУЛЬТАТА</div>
      {duel && <div className="exhibit-verdict"><span className="exhibit-kicker">ОБЩИЙ ВЕРДИКТ</span><h3>В этой попытке сильнее — Алексей.</h3><p>Он подкрепил решение измерениями и объяснил проверку результата. Мария предложила рабочий подход, но не раскрыла, как проверяет его надёжность.</p><small>Условный пример. В настоящей встрече вывод зависит от ваших ответов; при равном качестве возможна ничья.</small></div>}
      <div className="exhibit-pair"><Screen side="ВИДИТ ТОЛЬКО АЛЕКСЕЙ" title="Ваш личный разбор"><Fact label="Что удалось">{duel ? "Конкретное решение и измеримый результат" : "От позиции к интересам"}</Fact><p>{data.insight}</p><h4>Что улучшить</h4><p>{data.better}</p><div className="exhibit-note"><LockSimpleIcon size={18}/><span>Ошибки и рекомендации видны только вам.</span></div></Screen><Screen side="ВИДИТ ТОЛЬКО МАРИЯ" title="Её личный разбор" light><Fact label="Что удалось">{duel ? "Понятно объяснила ход решения" : "Обозначила интересы своей стороны"}</Fact><h4>Что улучшить</h4><p>{duel ? "Не хватило проверки на крайних случаях. Назовите, какие тесты вы добавите и почему именно они обнаружат ошибку." : "Обсудите не только желаемые условия, но и то, на какие уступки готовы пойти ради соглашения."}</p><div className="exhibit-note"><LockSimpleIcon size={18}/><span>Общий итог доступен обоим. Личный разбор — каждому свой.</span></div></Screen></div>
    </Chapter>
    <section className="exhibit-faq"><span className="exhibit-kicker">ЕЩЁ ПАРА ВАЖНЫХ ВЕЩЕЙ</span><h2>А если коротко?</h2><div><article><h3>Здесь кто-то подключён?</h3><p>Нет. Это интерактивное объяснение продукта. Все экраны и реплики — примеры, а не настоящая встреча.</p></article><article><h3>ИИ разговаривает вместо человека?</h3><p>В переговорах людей — нет. Он готовит роли и помогает с анализом. В формате двух собеседований ИИ выступает интервьюером для каждого.</p></article><article><h3>Можно попробовать по-настоящему?</h3><p>Да. Создайте встречу, передайте код второму пользователю. Он выберет роль, войдёт со своего аккаунта, и вы оба подтвердите готовность.</p></article><article><h3>Нужно проходить интервью одновременно?</h3><p>Нет. После подтверждения обоих и наступления времени встречи у вас один общий час. Начинайте независимо. Как только оба закончат, ИИ сравнит результаты. Если кто-то не успел пройти, сравнение не состоится, а личный разбор останется доступен.</p></article></div></section>
    <footer className="exhibit-finale"><span className="exhibit-kicker">ТЕПЕРЬ ВЫ ЗНАЕТЕ, КАК ЭТО УСТРОЕНО</span><h2>Посмотреть — понятно.<br/><em>Попробовать — полезнее.</em></h2><p>Возьмите свою ситуацию и пригласите человека, с которым хотите потренироваться.</p><Link className="exhibit-button" to="/rooms">Создать настоящую встречу <ArrowUpRightIcon size={20}/></Link><small>Откроется настройка. Комната не создастся автоматически.</small></footer>
  </div>;
}
