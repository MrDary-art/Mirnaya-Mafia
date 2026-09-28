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

function Chapter({ id, title, intro, children }) {
  return <section className="exhibit-chapter" id={id}>
    <div className="exhibit-chapter-copy"><h2>{title}</h2><p>{intro}</p></div>
    <div className="exhibit-scene">{children}</div>
  </section>;
}
function Screen({ side, title, children, light = false }) {
  return <article className={`exhibit-screen${light ? " exhibit-screen--guest" : ""}`}><header><span className="exhibit-avatar">{light ? "Б" : "А"}</span><div><small>{side}</small><h3>{title}</h3></div></header><div className="exhibit-screen-body">{children}</div></article>;
}
function Fact({ label, children, privateInfo = false }) {
  return <div className="exhibit-fact"><small>{privateInfo && <LockSimpleIcon size={13}/>} {label}</small><strong>{children}</strong></div>;
}
function Wave() {
  return <div className="exhibit-voice"><MicrophoneIcon size={19}/><span className="exhibit-wave" aria-hidden="true">{[3,7,5,11,8,4,10,15,9,5,12,8,4,7,11,5,8,3].map((h,i)=><i key={i} style={{height:h*2,animationDelay:`${i*50}ms`}}/>)}</span></div>;
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
    <header className="exhibit-hero"><div className="exhibit-hero-grid"><div><h1>Одна ситуация.<br/><em>Две стороны.</em><br/>Ваш разговор.</h1><p>Посмотрите, как проходит встреча 1×1: от задачи до личного разбора.</p></div><div className="exhibit-poster" aria-label="Схема: два участника и общая задача"><div className="exhibit-orbits"><div className="exhibit-orbit orbit-a">А<small>ваша цель</small></div><div className="exhibit-orbit orbit-b">Б<small>другая сторона</small></div></div><div className="exhibit-poster-bottom"><strong>Найдите решение<br/>вместе.</strong><ArrowUpRightIcon size={32}/></div></div></div></header>

    <section className="exhibit-formats" id="exhibit-formats"><h2>С человеком.<br/>Или параллельно с ИИ?</h2><div className="exhibit-format-grid"><article><h3>Человек ↔ человек</h3><p>Разные роли в одной ситуации. Вы разговариваете, ИИ помогает подготовить задачу и разобрать итог.</p></article><article><h3>Два человека ↔ ИИ</h3><p>Каждый проходит своё интервью. После обеих попыток появляется сравнение и личный разбор.</p></article></div></section>
    <div className="exhibit-example-bar"><div role="group" aria-label="Пример ситуации">{Object.entries(examples).map(([key,item])=><button key={key} aria-pressed={example===key} onClick={()=>choose(key)}>{item.label}</button>)}</div></div>

    <Chapter id="exhibit-invite" title="С чего начинается встреча?" intro="Опишите ситуацию, выберите время и отправьте партнёру код приглашения.">
      <div className="exhibit-pair"><Screen side="ВЫ · СОЗДАТЕЛЬ" title="Готовите встречу"><Fact label="Ситуация">{data.topic}</Fact><Fact label="Ваш желаемый результат" privateInfo>{data.goal}</Fact><div className="exhibit-calendar"><div>{["ПН","ВТ","СР","ЧТ","ПТ"].map((day,i)=><span key={day} className={i===2?"chosen":""}>{day}<b>{21+i}</b></span>)}</div><strong>СР · {duel ? "15:00 — 16:00" : "15:00 — 15:15"} МСК</strong></div><div className="exhibit-code">Код приглашения <b>DEMO-7Q4K</b></div></Screen><Screen side="ПАРТНЁР · ПО КОДУ" title="Знакомится с условиями" light><h4>{data.topic}</h4><p>Создатель: Алексей<br/>Среда, 15:00 МСК · {duel ? "час на прохождение" : "15 минут"}</p><div className="exhibit-note"><LockSimpleIcon size={18}/><span>Личная цель создателя остаётся скрытой.</span></div></Screen></div>
    </Chapter>
    <Chapter id="exhibit-roles" title={duel?"Почему задания одинаковые?":"А кем будет второй участник?"} intro={duel?"Оба кандидата получают одинаковые условия и отвечают независимо.":"Партнёр выбирает роль. Попробуйте варианты справа — личное задание изменится."}>
      <div className="exhibit-pair"><Screen side="ВЫ" title="Ваша сторона"><Fact label="Ваша роль">{data.host}</Fact><Fact label="Личная цель" privateInfo>{data.goal}</Fact></Screen><Screen side="ВТОРОЙ УЧАСТНИК" title={duel?"Та же роль — своя попытка":"Выбирает роль"} light><fieldset className="exhibit-roles"><legend className="sr-only">Роль в примере</legend>{data.roles.map((name,i)=><label className={role===i?"selected":""} key={name}><input type="radio" name="demo-role" checked={role===i} onChange={()=>setRole(i)}/><span><b>{name}</b><small>{data.descriptions[i]}</small></span></label>)}</fieldset><Fact label="Личное задание после входа" privateInfo>{guestGoal}</Fact></Screen></div>
    </Chapter>
    <Chapter id="demo-practice" title="Что происходит в самой встрече?" intro={duel?"После подтверждения у каждого есть своё интервью и до 15 минут на ответы в рамках общего часа.":"Когда оба участника готовы, начинается разговор. Каждый видит свою роль и задачу."}>
      <div className="exhibit-pair"><Screen side={duel?"КАНДИДАТ А":"ВАШ ЭКРАН"} title={duel?"Отдельное интервью":"Разговор с партнёром"}><div className="exhibit-call"><div className="exhibit-silhouette">{duel?"ИИ":"Б"}</div><span>{duel?"Интервьюер":"Другая сторона"}</span><div className="exhibit-call-controls"><VideoCameraIcon size={18}/><MicrophoneIcon size={18}/><span>14:32</span></div></div><Fact label="Ваша задача">{data.goal}</Fact></Screen><Screen side={duel?"КАНДИДАТ Б":"ЭКРАН ПАРТНЁРА"} title={duel?"Независимая попытка":"Тот же разговор, другая цель"} light><div className="exhibit-call"><div className="exhibit-silhouette">{duel?"ИИ":"А"}</div><span>{duel?"Интервьюер":"Создатель встречи"}</span><div className="exhibit-call-controls"><VideoCameraIcon size={18}/><MicrophoneIcon size={18}/><span>14:32</span></div></div><Fact label="Его задача">{guestGoal}</Fact></Screen></div>
      <div className="exhibit-dialogue"><div><h3>Как выглядит обмен репликами?</h3><button className="exhibit-button-secondary" onClick={()=>setPlaying(!playing)}>{playing?"Свернуть пример":"Показать пример разговора"}</button></div><div className="exhibit-transcript" aria-live="polite">{playing?<><div className="exhibit-bubble"><small>{duel?"Кандидат":"Вы"}</small><p>{data.offer}</p><Wave/></div><div className="exhibit-bubble reply"><small>{duel?"ИИ-интервьюер":data.roles[role]}</small><p>{data.reply}</p></div></>:<div className="exhibit-transcript-idle"><MicrophoneIcon size={34}/><p>{duel?"Две независимые беседы.":"Две стороны одного разговора."}</p></div>}</div></div>
    </Chapter>
    <Chapter id="exhibit-report" title="Теперь — в зал ожидания." intro={duel ? "После обеих попыток ИИ сравнит ответы и подготовит личные рекомендации." : "После разговора ИИ подготовит каждому личный разбор."}>
      <div className="exhibit-waiting"><div><h3>{duel ? "Две попытки. Один итог." : "Разговор завершён. Разбор готовится."}</h3><p>{duel ? "Сравниваем аргументы и примеры в ответах." : "Смотрим, как вы задавали вопросы и искали решение."}</p></div><div className="exhibit-waiting-status"><span><b>А</b> Алексей <small>Завершил <CheckIcon/></small></span><span><b>Б</b> Мария <small>Завершила <CheckIcon/></small></span><div className="exhibit-analysis"><i/><i/><i/> ИИ анализирует ответы</div></div></div>
      {duel && <div className="exhibit-verdict"><h3>В этой попытке сильнее — Алексей.</h3><p>Он подкрепил решение измерениями и объяснил проверку результата.</p></div>}
      <div className="exhibit-pair"><Screen side="ВИДИТ ТОЛЬКО АЛЕКСЕЙ" title="Ваш личный разбор"><Fact label="Что удалось">{duel ? "Конкретное решение и измеримый результат" : "От позиции к интересам"}</Fact><p>{data.insight}</p><h4>Что улучшить</h4><p>{data.better}</p></Screen><Screen side="ВИДИТ ТОЛЬКО МАРИЯ" title="Её личный разбор" light><Fact label="Что удалось">{duel ? "Понятно объяснила ход решения" : "Обозначила интересы своей стороны"}</Fact><h4>Что улучшить</h4><p>{duel ? "Добавьте способ проверки решения на крайних случаях." : "Обсудите возможные уступки ради соглашения."}</p></Screen></div>
    </Chapter>
    <footer className="exhibit-finale"><h2>Готовы попробовать?</h2><Link className="exhibit-button" to="/rooms">Создать встречу <ArrowUpRightIcon size={20}/></Link></footer>
  </div>;
}
