import { Link, NavLink, useLocation } from "react-router-dom";
import { BookOpen, ChartNoAxesCombined, Compass, History, MessageCircle, Mic, Settings2, ShoppingBag, Sparkles, Target, Users, Video } from "lucide-react";

type Icon=typeof Compass;
type Section={to:string;label:string;description:string;icon:Icon;group:"Практика"|"Обучение"|"Сообщество"|"Профиль"};
export const sections:Section[]=[
  {to:"/today",label:"Сегодня",description:"Испытание дня и следующий шаг обучения.",icon:Compass,group:"Практика"},
  {to:"/practice",label:"Сценарии",description:"Офлайн-ситуации с ветвлениями и отчётом.",icon:Target,group:"Практика"},
  {to:"/ai",label:"Диалог с ИИ",description:"Свободные переговоры текстом; голосовой ввод при настроенном Whisper.",icon:Sparkles,group:"Практика"},
  {to:"/ai?mode=interview",label:"Собеседование",description:"Практика интервью по выбранной должности.",icon:MessageCircle,group:"Практика"},
  {to:"/rooms",label:"Онлайн 1×1",description:"Комнаты, приглашения и парные переговоры.",icon:Video,group:"Практика"},
  {to:"/rooms/demo",label:"Демо 1×1",description:"Пошаговая демонстрация встречи.",icon:Video,group:"Практика"},
  {to:"/path",label:"Путь развития",description:"Десять глав и 60 уровней.",icon:BookOpen,group:"Обучение"},
  {to:"/skills",label:"Дерево навыков",description:"Упражнения HR и Sales.",icon:ChartNoAxesCombined,group:"Обучение"},
  {to:"/theory",label:"Теория",description:"Уроки BATNA и ZOPA.",icon:BookOpen,group:"Обучение"},
  {to:"/errors",label:"Работа над ошибками",description:"Повторите слабые ходы миссий.",icon:Target,group:"Обучение"},
  {to:"/people",label:"Друзья и чат",description:"Поиск людей, переписка и входящие заявки.",icon:Users,group:"Сообщество"},
  {to:"/activity",label:"История",description:"Все попытки и комнаты в одной ленте.",icon:History,group:"Профиль"},
  {to:"/progress",label:"Прогресс",description:"Миссии, опыт и результаты.",icon:ChartNoAxesCombined,group:"Профиль"},
  {to:"/profile",label:"Мой профиль",description:"Роли, статистика и последняя миссия.",icon:Users,group:"Профиль"},
  {to:"/shop",label:"Магазин и награды",description:"Звёзды, достижения и оформление профиля.",icon:ShoppingBag,group:"Профиль"}
];
const groups=["Практика","Обучение","Сообщество","Профиль"] as const;
const unavailable=[
  {label:"Сценарные учебные программы",description:"Отдельные старые программы пока не связаны с новым путём из 10 глав."},
  {label:"Публичная анкета",description:"Серверное хранение и настройки приватности ещё не готовы."},
  {label:"Непрерывный голосовой диалог",description:"Сейчас доступна запись реплики и распознавание через Whisper при настройке сервера."},
  {label:"Командный рейтинг",description:"Для рейтинга нужны проверяемые результаты и отдельные правила."}
];
const inside=[
  {to:"/today",label:"Ежедневное испытание",description:"Отдельная миссия и награда один раз за день."},
  {to:"/practice",label:"Тренер-призрак",description:"Подсказки в авторских шагах офлайн-сценариев."},
  {to:"/practice",label:"Скрытая цель и хаос",description:"Модификаторы при запуске локальной миссии."},
  {to:"/practice",label:"Таймер давления",description:"30 или 60 секунд на решение в миссии."},
  {to:"/ai",label:"Голосовой ввод",description:"Распознавание реплики при подключённом Whisper."},
  {to:"/rooms",label:"Парное собеседование",description:"Два независимых интервью при настроенном ИИ-провайдере."},
  {to:"/path",label:"Разбор уровня и главы",description:"Ошибки, лучшие ответы и результат обучения."},
  {to:"/shop",label:"Достижения и ранги",description:"Условия, даты получения и награды звёздами."},
  {to:"/activity",label:"Отчёты и продолжение",description:"Вернитесь к завершённым и текущим занятиям."}
];
export function SidebarSections({owner}:{owner:boolean}){
  const location=useLocation();
  return <nav className="section-sidebar" aria-label="Разделы проекта"><NavLink to="/sections" className={({isActive})=>`nav-item section-all-link ${isActive?"active":""}`}><Compass size={19}/>Все разделы</NavLink>{groups.map(group=><div className="section-nav-group" key={group}><span className="section-nav-heading">{group}</span>{sections.filter(item=>item.group===group).map(item=><NavLink key={item.to} to={item.to} end={item.to==="/today"} className={({isActive})=>{const selected=item.to==="/ai?mode=interview"?location.pathname==="/ai"&&location.search.includes("mode=interview"):item.to==="/ai"?isActive&&!location.search.includes("mode=interview"):isActive;return `nav-item ${selected?"active":""}`}}><item.icon size={18}/>{item.label}</NavLink>)}</div>)}{owner&&<div className="section-nav-group"><span className="section-nav-heading">Управление</span><NavLink to="/admin" className={({isActive})=>`nav-item ${isActive?"active":""}`}><Settings2 size={18}/>Администрирование</NavLink></div>}</nav>;
}
export function MobileSections(){
  const tabs=[sections[0],sections[1],sections[2],sections[6],sections[10]];
  return <nav className="mobile-nav" aria-label="Навигация">{tabs.map(item=><NavLink key={item.to} to={item.to}><item.icon size={19}/><span>{item.label}</span></NavLink>)}<NavLink to="/sections"><Compass size={19}/><span>Все</span></NavLink></nav>;
}
export function QuickSections(){
  const featured=[sections[1],sections[2],sections[4],sections[6],sections[7],sections[9],sections[11],sections[14]];
  return <section className="section-directory-preview"><div className="section-row"><h2>Разделы проекта</h2><Link className="text-link" to="/sections">Показать все →</Link></div><div className="section-quick-grid">{featured.map(item=><Link className="section-quick-card" to={item.to} key={item.to}><item.icon size={20}/><strong>{item.label}</strong><small>{item.description}</small></Link>)}</div></section>;
}
export default function SectionsPage({owner}:{owner:boolean}){
  return <div className="page"><span className="kicker">КАРТА ПРОЕКТА</span><h1>Все разделы</h1><p className="lead">Здесь собраны режимы старого проекта и их текущие рабочие страницы.</p>{groups.map(group=><section className="section-directory-group" key={group}><h2>{group}</h2><div className="section-directory-grid">{sections.filter(item=>item.group===group).map(item=><Link className="section-directory-card" to={item.to} key={item.to}><item.icon size={25}/><h3>{item.label}</h3><p>{item.description}</p><span>Открыть →</span></Link>)}</div></section>)}<section className="section-directory-group"><h2>Внутри режимов</h2><div className="section-directory-grid">{inside.map(item=><Link className="section-directory-card" to={item.to} key={item.label}><Target size={25}/><h3>{item.label}</h3><p>{item.description}</p><span>Перейти к режиму →</span></Link>)}</div></section>{owner&&<section className="section-directory-group"><h2>Управление</h2><Link className="section-directory-card" to="/admin"><Settings2 size={25}/><h3>Администрирование</h3><p>Статусы последних миссий и комнат.</p><span>Открыть →</span></Link></section>}<section className="section-directory-group"><h2>Что ещё переносится</h2><div className="section-directory-grid">{unavailable.map(item=><div className="section-directory-card unavailable" key={item.label}><Mic size={25}/><h3>{item.label}</h3><p>{item.description}</p><span>В разработке</span></div>)}</div></section></div>;
}
