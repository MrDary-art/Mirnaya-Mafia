import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { answerFeedbackText, answerQualityLabels } from "../components/answerQuality.js";
import "./guided-demo.css";
import "./mode-guide.css";

const guides = {
  ai: {
    label: "ИИ-ДИАЛОГ", landing: "/ai", title: ["Ваша задача.", "Диалог с ИИ.", "Ваш разбор."],
    intro: "Два способа потренироваться с ИИ: свободные переговоры или собеседование. Посмотрите весь путь до запуска настоящей сессии.",
    formatTitle: "Своя ситуация или собеседование?",
    steps: [
      ["Выберите формат", "Сначала решите, что хотите отработать. Выбор карточки открывает подготовку, но ещё не начинает разговор."],
      ["Подготовьте контекст", "Опишите задачу и проверьте настройки. Сессия начнётся только после вашего подтверждения."],
      ["Ведите диалог", "Вы отвечаете сами, а ИИ играет собеседника. Здесь можно попробовать два подхода и увидеть условную реакцию."],
      ["Посмотрите разбор", "После завершения откроется отчёт: сильные ходы, рискованные решения и рекомендации для следующей попытки."],
    ],
    variants: [
      {
        label: "Своя ситуация", summary: "Вы задаёте контекст, роль собеседника и цель. ИИ отвечает как другая сторона переговоров.", href: "/setup?mode=online", cta: "Настроить диалог",
        topic: "Согласовать сроки проекта", role: "Руководитель проекта", counterpart: "Представитель заказчика", goal: "Согласовать реалистичный срок без переработок",
        setupLabel: "Ваша задача", setupValue: "Заказчик просит добавить функции перед запуском", setupSecondLabel: "Цель", setupSecondValue: "Выделить обязательное и согласовать второй этап",
        prompt: "Заказчик просит всё выпустить в пятницу. Как ответить?", choices: ["Какие две функции критичны к запуску?", "Срок невозможен, обсуждать нечего."],
        qualities: ["strong", "weak"],
        reactions: ["ИИ-оппонент уточняет приоритеты: оплату оставляем к запуску, отчёты переносим.", "ИИ-оппонент настаивает на исходном сроке: интересы сторон пока не прояснены."],
        insights: ["Вы уточнили интерес, прежде чем спорить о дате.", "Категоричный отказ закрыл путь к обсуждению вариантов."],
        outcome: "Отчёт по переговорам", result: "Что удалось: прояснить приоритеты. Что улучшить: зафиксировать состав первой версии и дату второго этапа.",
      },
      {
        label: "Собеседование", summary: "Укажите компанию и позицию, затем отвечайте на вопросы ИИ-рекрутера.", href: "/ai/job", cta: "Подготовить собеседование",
        topic: "Интервью на позицию аналитика", role: "Кандидат", counterpart: "ИИ-рекрутер", goal: "Показать опыт на конкретных примерах",
        setupLabel: "Позиция", setupValue: "Продуктовый аналитик", setupSecondLabel: "Компания", setupSecondValue: "Компания, которую вы укажете",
        prompt: "Рекрутер просит рассказать о результате вашей работы. Что ответить?", choices: ["Назову задачу, метрику и свой вклад.", "Скажу, что хорошо работаю в команде."],
        qualities: ["strong", "weak"],
        reactions: ["ИИ-рекрутер уточняет, как вы проверили результат и отделили свой вклад от общего.", "ИИ-рекрутер просит привести конкретный случай и измеримый результат."],
        insights: ["Конкретный пример даёт основу для следующего вопроса.", "Общее утверждение не показывает, как вы решаете задачи."],
        outcome: "Разбор собеседования", result: "Что удалось: объяснить ход решения. Что улучшить: добавить проверяемый результат и вывод.",
      },
    ],
  },
  scenarios: {
    label: "СЦЕНАРИИ", landing: "/scenarios", title: ["Одна ситуация.", "Несколько решений.", "Разные итоги."],
    intro: "Готовые истории для самостоятельной практики. Выбор меняет ход переговоров, а отчёт объясняет последствия — без подключения к ИИ.",
    formatTitle: "Попробуйте разные ситуации",
    steps: [
      ["Выберите историю", "В каталоге видны роль, сложность и примерное время. «Подробнее» ведёт к настройке выбранного сценария."],
      ["Проверьте условия", "Перед стартом прочитайте вводную и параметры тренировки. Только кнопка запуска создаёт сессию."],
      ["Сделайте ход", "Вы выбираете одну из готовых реплик. Эффект варианта меняет состояние переговоров и может открыть другую ветку."],
      ["Разберите итог", "Финал зависит от цепочки решений. Отчёт показывает ход разговора, метрики и рекомендации; попытку можно повторить."],
    ],
    variants: [
      {
        label: "Скидка на поставку", summary: "Поставщик и кафе обсуждают цену, объём и регулярность заказов.", href: "/scenarios", cta: "Открыть каталог",
        topic: "Поставка продуктов для кафе", role: "Закупщик", counterpart: "Поставщик", goal: "Получить выгодные условия без потери качества",
        setupLabel: "Вводная", setupValue: "Текущая цена выше бюджета кафе", setupSecondLabel: "Роль", setupSecondValue: "Закупщик, который планирует регулярные заказы",
        prompt: "Поставщик не готов снижать цену. Что предложить?", choices: ["Обсудим объём еженедельного заказа.", "Либо скидка сейчас, либо мы уходим."],
        qualities: ["strong", "weak"],
        reactions: ["Поставщик предлагает обсудить скидку при фиксированном объёме.", "Поставщик защищает цену и сокращает пространство для сделки."],
        insights: ["Переговоры переходят к обмену условиями — это может открыть ветку сотрудничества.", "Ультиматум повышает риск тупика; следующая сцена может быть иной."],
        outcome: "Возможный финал", result: "Соглашение по объёму и цене или отказ от сделки — итог зависит от всей цепочки ходов.",
      },
      {
        label: "Сроки проекта", summary: "Команда и заказчик ищут способ выпустить важное без перегрузки.", href: "/scenarios", cta: "Открыть каталог",
        topic: "Запуск продукта с новыми задачами", role: "Руководитель проекта", counterpart: "Заказчик", goal: "Сохранить срок и не перегрузить команду",
        setupLabel: "Вводная", setupValue: "Новые функции появились перед запуском", setupSecondLabel: "Роль", setupSecondValue: "Руководитель проекта",
        prompt: "Заказчик просит добавить всё к запуску. Ваш ход?", choices: ["Выделим критичное и запланируем остальное.", "Команда сделает всё в срок без изменений."],
        qualities: ["strong", "weak"],
        reactions: ["Заказчик называет две обязательные функции; появляется пространство для плана.", "Обещание снижает напряжение сейчас, но увеличивает риск невыполнения."],
        insights: ["Приоритеты стали яснее, можно договориться о составе релиза.", "Необоснованное обещание может ухудшить доверие на следующем шаге."],
        outcome: "Возможный финал", result: "Реалистичный план или срыв договорённостей — конкретный финал зависит от дальнейших ходов.",
      },
    ],
  },
  training: {
    label: "ОБУЧЕНИЕ", landing: "/training", title: ["Разберитесь в приёме.", "Попробуйте сами.", "Идите дальше."],
    intro: "В обучении есть короткие уроки и последовательная программа. Посмотрите, как выбрать путь, выполнить задание и увидеть свой прогресс.",
    formatTitle: "Теория или программа?",
    steps: [
      ["Выберите путь", "Теория помогает изучить отдельный приём. Программа ведёт по главам и уровням, открывая следующие шаги по прогрессу."],
      ["Разберитесь в задаче", "Перед практикой видны тема и условия. Урок объясняет инструмент; программа даёт последовательную тренировку навыка."],
      ["Примените приём", "Ответьте на учебную ситуацию и получите обратную связь. Кнопки здесь показывают условный пример, не сохраняют ответ."],
      ["Увидьте результат", "Настоящая практика сохраняет прогресс. После завершения доступны результат и следующий открытый шаг."],
    ],
    variants: [
      {
        label: "Теория", summary: "Короткий урок: объяснение приёма, пример, мини-практика и итог.", href: "/theory", cta: "Открыть уроки",
        topic: "Уточнять интересы", role: "Ученик", counterpart: "Учебная ситуация", goal: "Понять, что стоит за позицией собеседника",
        setupLabel: "Тема урока", setupValue: "Интересы и позиции", setupSecondLabel: "Цель", setupSecondValue: "Задать вопрос, который проясняет потребность",
        prompt: "Партнёр говорит: «Нужна скидка». Какой вопрос полезнее?", choices: ["Что для вас важнее: цена или условия оплаты?", "Почему вам просто не подходит наша цена?"],
        qualities: ["strong", "weak"],
        reactions: ["Сильный ход: вопрос помогает найти интерес за требованием.", "Есть риск: вопрос звучит защитно и не уточняет потребность."],
        insights: ["В реальном уроке вы увидите объяснение ответа и сможете продолжить.", "В реальном уроке обратная связь объяснит, что можно изменить."],
        outcome: "Итог урока", result: "После практики видны результат, ключевая мысль и ссылка на следующий доступный урок.",
      },
      {
        label: "Программа", summary: "Главы и уровни: брифинг, упражнение, разбор и следующий шаг.", href: "/training/path", cta: "Открыть программу",
        topic: "Первый шаг переговоров", role: "Участник программы", counterpart: "Собеседник в упражнении", goal: "Применить новый навык в разговоре",
        setupLabel: "Текущий уровень", setupValue: "Уточнение задачи", setupSecondLabel: "Перед практикой", setupSecondValue: "Прочитайте брифинг и цель уровня",
        prompt: "Собеседник резко отвергает предложение. Ваш первый шаг?", choices: ["Уточню, что именно не подходит.", "Повторю предложение громче и увереннее."],
        qualities: ["strong", "weak"],
        reactions: ["Такой ход помогает получить информацию для следующего шага.", "Повтор позиции без уточнения обычно не раскрывает причину отказа."],
        insights: ["После настоящей попытки результат попадёт в прогресс уровня.", "Разбор покажет, какие решения стоит попробовать иначе."],
        outcome: "Прогресс программы", result: "Завершённый уровень учитывается в прогрессе главы; следующий открывается по правилам программы.",
      },
    ],
  },
};

function Screen({ side, title, children, light = false }) {
  return <article className={`exhibit-screen${light ? " exhibit-screen--guest" : ""}`}><header><span className="exhibit-avatar">{light ? "Б" : "А"}</span><div><small>{side}</small><h3>{title}</h3></div></header><div className="exhibit-screen-body">{children}</div></article>;
}

function Fact({ label, children }) {
  return <div className="exhibit-fact"><small>{label}</small><strong>{children}</strong></div>;
}

function Chapter({ number, title, intro, children }) {
  return <section className="exhibit-chapter is-seen" id={`guide-step-${number}`}><div className="exhibit-chapter-copy"><h2>{title}</h2><p>{intro}</p></div><div className="exhibit-scene">{children}</div></section>;
}

export default function ModeGuide({ mode }) {
  const guide = guides[mode];
  const [variantIndex, setVariantIndex] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(null);
  const variant = guide.variants[variantIndex];
  const choiceQuality = choiceIndex == null ? null : variant.qualities?.[choiceIndex];
  const selectVariant = (index) => { setVariantIndex(index); setChoiceIndex(null); };

  return <div className="exhibit mode-guide">
    <header className="exhibit-hero"><div className="exhibit-hero-grid"><div><h1>{guide.title[0]}<br /><em>{guide.title[1]}</em><br />{guide.title[2]}</h1><p>{guide.intro}</p></div><div className="exhibit-poster mode-guide-poster" aria-label="Четыре шага: выбор, подготовка, практика, разбор"><div className="mode-guide-track">{["Выбор", "Подготовка", "Практика", "Разбор"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong><i aria-hidden="true">↗</i></div>)}</div><div className="exhibit-poster-bottom"><strong>Поймите механику<br />без риска и спешки.</strong><ArrowUpRightIcon size={32} aria-hidden="true" /></div></div></div></header>

    <section className="exhibit-formats" id="guide-formats"><h2>{guide.formatTitle}</h2><div className="exhibit-format-grid" role="group" aria-label="Пример формата">{guide.variants.map((item, index) => <button key={item.label} aria-pressed={variantIndex === index} onClick={() => selectVariant(index)}><h3>{item.label}</h3><p>{item.summary}</p></button>)}</div></section>

    <Chapter number="01" title={guide.steps[0][0]} intro={guide.steps[0][1]}><div className="exhibit-pair"><Screen side="ВАШ ВЫБОР" title={variant.label}><Fact label="Ситуация">{variant.topic}</Fact><Fact label="Ваша роль">{variant.role}</Fact></Screen><Screen side="ЧТО ВПЕРЕДИ" title="Подготовка перед стартом" light><Fact label="Другая сторона">{variant.counterpart}</Fact><Fact label="Ваша цель">{variant.goal}</Fact></Screen></div></Chapter>

    <Chapter number="02" title={guide.steps[1][0]} intro={guide.steps[1][1]}><div className="exhibit-pair"><Screen side="ПЕРЕД НАЧАЛОМ" title="Вводная"><Fact label={variant.setupLabel}>{variant.setupValue}</Fact><Fact label={variant.setupSecondLabel}>{variant.setupSecondValue}</Fact></Screen><Screen side="ВАШ ОРИЕНТИР" title="Цель попытки" light><Fact label="Что вы хотите отработать">{variant.goal}</Fact></Screen></div></Chapter>

    <Chapter number="03" title={guide.steps[2][0]} intro={guide.steps[2][1]}><div className="exhibit-pair"><Screen side="ПРОБНЫЙ МОМЕНТ" title="Ваше решение"><p className="mode-guide-prompt">{variant.prompt}</p><div className="mode-guide-choices" role="group" aria-label="Пробный ответ">{variant.choices.map((text, index) => <button key={text} className={choiceIndex === index && choiceQuality ? `answer-quality-revealed answer-quality-${choiceQuality}` : undefined} aria-pressed={choiceIndex === index} onClick={() => setChoiceIndex(index)}><span>{index + 1}</span>{text}</button>)}</div></Screen><Screen side="УСЛОВНАЯ РЕАКЦИЯ" title={choiceIndex == null ? "Выберите ответ слева" : "Что изменилось?"} light><div className={`mode-guide-reaction${choiceQuality ? ` answer-quality-revealed answer-quality-${choiceQuality}` : ""}`} aria-live="polite">{choiceIndex != null && <>{choiceQuality && <b className={`answer-quality-badge answer-quality-${choiceQuality}`}>{answerQualityLabels[choiceQuality]}</b>}<p>{choiceQuality ? answerFeedbackText(variant.reactions[choiceIndex]) : variant.reactions[choiceIndex]}</p><div className="mode-guide-note"><CheckIcon size={18} aria-hidden="true" /><span>{variant.insights[choiceIndex]}</span></div></>}</div></Screen></div></Chapter>

    <Chapter number="04" title={guide.steps[3][0]} intro={guide.steps[3][1]}><div className="mode-guide-result"><h3>{variant.outcome}</h3><p>{variant.result}</p><div className={`mode-guide-result-line${choiceQuality ? ` answer-quality-revealed answer-quality-${choiceQuality}` : ""}`}><span>Ваше решение</span><strong>{choiceIndex == null ? "Попробуйте выбрать ответ выше" : variant.choices[choiceIndex]}</strong></div><div className="mode-guide-result-line"><span>Что заметить</span><strong>{choiceIndex == null ? "Разбор зависит от ваших действий" : variant.insights[choiceIndex]}</strong></div></div></Chapter>

    <footer className="exhibit-finale"><h2>Готовы попробовать?</h2><Link className="exhibit-button" to={variant.href}>{variant.cta} <ArrowUpRightIcon size={20} aria-hidden="true" /></Link></footer>
  </div>;
}
