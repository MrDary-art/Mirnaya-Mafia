import MentorChat from "../components/MentorChat.jsx";
import RoomResults from "../components/RoomResults.jsx";
import ChatBubble from "../components/LiveChatBubble.jsx";
import { exampleReport } from "./ReportExample.jsx";

export function MentorExample() {
  return <div className="practice-page"><header className="practice-intro"><span className="eyebrow">УЧЕБНЫЙ ПРИМЕР · НЕ НАСТОЯЩАЯ СЕССИЯ</span><h1>Два разговора, одна задача</h1><p>Слева — переговоры. Справа — личная помощь ментора. Нажмите «Активировать помощь», чтобы посмотреть оформление.</p></header><div className="conversation-layout"><section className="conversation-main"><div className="conversation-presence"><b>Заказчик</b><span>Пример диалога</span></div><div className="conversation-log live-chat-log"><ChatBubble label="Заказчик" text="Мне нужен запуск в пятницу. Почему вы предлагаете перенос?"/><ChatBubble own label="Вы" text="После новых требований полный запуск займёт ещё неделю. Бюджет сохраним."/><ChatBubble label="Заказчик" text="В пятницу презентация партнёрам. Что вы можете показать к этому сроку?"/></div></section><aside className="conversation-context"><details><summary>Ваша цель и ограничения</summary><p>Согласовать этапы запуска, сохранив бюджет.</p></details><MentorChat example/></aside></div></div>;
}

export function DuelExample({human=false}) {
  const labels=["Соответствие вопросу","Конкретность примеров","Обоснование решения","Собственный вклад"];
  const room={mode:human?"human":"duel",your_id:1,participants:{1:{display_name:"Алексей"},2:{display_name:"Мария"}},
    competition:{status:"ready",winner_id:2,tie:false,maximum:16,scores:{1:10,2:13},summary:"Мария подробнее обосновала выбор решения и показала, как проверила результат. Алексей привёл подходящий пример, но не объяснил проверку.",criteria:labels.map((label,i)=>({id:i,label,candidates:{1:{score:[3,3,2,2][i],quote:"Я сделал учебный проект и использовал знакомый инструмент."},2:{score:[3,3,4,3][i],quote:"Сравнила два решения на тестовой задаче и проверила крайние случаи."}}}))},
    shared_result:{terms:[{label:"Первый запуск",proposed:"Основные функции в пятницу, остальные — через неделю",confirmed:"Согласовано: в пятницу показываем основные функции"}]},
    your_report:human?exampleReport:{...exampleReport,scenario_title:"Пример личного разбора интервью",narrative:{status:"Учебная попытка завершена",headline:"Сильный пример стоит дополнить проверкой",lead:"Вы описали собственный проект и инструмент. Для более убедительного ответа осталось показать, как проверяли результат.",sections:[{id:"example",kind:"improve",title:"Показать проверку решения",body:"Название инструмента объясняет выбор, но ещё не подтверждает качество результата.",evidence:{speaker:"Вы",quote:"Я сделал учебный проект и использовал знакомый инструмент."},alternative:"Расскажите, какие проверки выполнили и какую ошибку они помогли найти."}],next_step:"Выберите одну задачу своего проекта и объясните проверку результата."}}};
  return <><p className="preview-label">ВЫМЫШЛЕННЫЙ ПРИМЕР · оценки не сохраняются в профиль</p><RoomResults room={room} example/></>;
}
