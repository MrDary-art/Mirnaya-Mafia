import type { Metrics } from "@arena/contracts";
export type ChaosEvent={id:string;text:string;effects:Partial<Metrics>;options:{text:string;effects:Partial<Metrics>}[]};
// Adapted from backend/app/engine/scenario.py in Git snapshot 190b893.
export const chaosEvents:ChaosEvent[]=[
  {id:"interruption",text:"Оппонент перебивает вас: «Позвольте, я не закончил!»",effects:{goal:-1,control:-2,eq:-1},options:[{text:"Извиниться и дать договорить",effects:{trust:2,control:-1,eq:2}},{text:"Вежливо продолжить: «Я услышал, позвольте завершить мысль»",effects:{trust:1,control:2,eq:1}},{text:"Перебить в ответ",effects:{trust:-4,control:-1,eq:-3}}]},
  {id:"phone_call",text:"Звонит телефон. Оппонент смотрит на вас.",effects:{control:-1},options:[{text:"Извиниться и проигнорировать звонок",effects:{trust:2,control:1,eq:1}},{text:"Быстро ответить: «Коротко»",effects:{trust:-1,control:-2,eq:-1}},{text:"Отклонить вызов",effects:{trust:1,control:1}}]},
  {id:"visitor",text:"В комнату заходит коллега оппонента.",effects:{},options:[{text:"Сделать паузу и подождать",effects:{trust:1,control:1,eq:1}},{text:"Продолжить говорить",effects:{trust:-1,eq:-1}},{text:"Предложить продолжить позже",effects:{trust:1,control:-1}}]},
  {id:"connection_loss",text:"Связь прерывается. Вы слышите: «...пропадает...»",effects:{goal:-1,control:-1},options:[{text:"Говорить короче и чётче",effects:{trust:1,control:2,eq:1}},{text:"Повторять последнее предложение",effects:{control:-1}},{text:"Предложить перезвонить",effects:{trust:1,eq:1}}]},
  {id:"topic_change",text:"Оппонент резко меняет тему: «Кстати, а что насчёт...»",effects:{goal:-2,control:-2},options:[{text:"Вернуть к теме: «Давайте сначала закроем текущий вопрос»",effects:{trust:1,control:3,eq:1}},{text:"Поддержать новую тему",effects:{trust:1,control:-2,goal:-2}},{text:"Игнорировать и продолжить",effects:{trust:-2,eq:-1}}]},
];
