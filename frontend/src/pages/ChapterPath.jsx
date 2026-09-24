import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import Icon, { StarRating } from "../components/Icon.jsx";

const chapterContext = {
  "chapter-1": {
    story: "Вы — Марина, руководитель продуктовой команды. Алексей три года работает в команде и после тяжёлого запуска получил оценку «соответствует ожиданиям», хотя рассчитывал на большее. Пока важно не убеждать его, а понять, что стоит за его реакцией.",
    learning: "Слышать смысл за словами, задавать уточняющие вопросы, отделять позицию от интереса и не переходить к аргументам раньше времени.",
  },
  "chapter-2": {
    story: "Вы уже выяснили, почему оценка стала для Алексея болезненной: речь не только о балле, но и о признании вклада, ясности критериев и перспективе роста. Теперь разговор нужно привести к решению.",
    learning: "Удерживать предмет разговора, исследовать возражения, снижать напряжение, опираться на критерии и завершать понятной договорённостью.",
  },
};

const typeLabels = { RECOGNIZE: "распознавание сигнала", FIND_MISTAKE: "анализ ошибки", CHOICE: "выбор хода", COMPARE: "сравнение подходов", NEXT_MOVE: "следующий шаг", APPLY: "применение навыка", ASSUMPTION_CHECK: "проверка предположения", SUMMARIZE: "выделение главного", SEQUENCE: "последовательность", GUIDED_RESPONSE: "формулировка ответа", COMBINED: "комплексное решение" };

const difficultyMeta = {
  "Начальная": { label: "Начальный уровень", brief: "освоить базовый приём", tone: "beginner" },
  "Средняя": { label: "Средний уровень", brief: "применить приём в ситуации", tone: "intermediate" },
  "Повышенная": { label: "Продвинутый уровень", brief: "удержать навык в сложном диалоге", tone: "advanced" },
};

function DifficultyBadge({ difficulty }) {
  const meta = difficultyMeta[difficulty] || { label: "Уровень практики", brief: difficulty, tone: "intermediate" };
  return <span className={`difficulty-badge ${meta.tone}`}><b>{meta.label}</b><small>{meta.brief}</small></span>;
}

export default function ChapterPath() {
  const { chapterId } = useParams(); const nav = useNavigate(); const [data, setData] = useState(null); const [error, setError] = useState(""); const [startingLevel, setStartingLevel] = useState("");
  useEffect(() => { api(`/api/learning-path/chapters/${chapterId}`).then(setData).catch((e) => setError(e.message)); }, [chapterId]);
  const startLevel = async (levelId) => {
    setStartingLevel(levelId);
    try {
      const attempt = await api(`/api/learning-path/levels/${levelId}/attempts`, { method: "POST" });
      nav(`/training/path/attempt/${attempt.attempt_id}`);
    } catch (e) {
      setError(e.message);
      setStartingLevel("");
    }
  };
  if (error) return <section className="learning-path-page"><TrainingNavigation fallback="/training/path" /><div className="glass rounded-3xl p-7"><p className="text-rose-300">{error}</p></div></section>;
  if (!data) return <p className="text-slate-400">Загружаем главу…</p>;
  const context = chapterContext[chapterId] || { story: data.chapter.story, learning: data.chapter.learning };
  return <section className="learning-path-page">
    <TrainingNavigation fallback="/training/path" />
    <div className="path-hero glass"><div><div className="eyebrow">ГЛАВА {data.chapter.order}</div><h1>{data.chapter.title}</h1><p>{data.chapter.description}</p></div>{data.complete && <button className="primary-button" onClick={() => nav(`/training/path/chapter/${chapterId}/summary`)}>Открыть итоги главы</button>}</div>
    <div className="chapter-intro"><article className="chapter-info glass"><div className="section-label">История</div><p>{context.story}</p></article><article className="chapter-info glass"><div className="section-label">Чему учит глава</div><p>{context.learning}</p></article></div>
    <p className="chapter-count">{data.levels.filter((level) => level.best_score !== null).length} из 6 уровней</p>
    <div className="path-content"><div className="path-timeline">{data.levels.map((level, index) => <div className="path-step" key={level.id}>
      <div className={`path-line ${index === data.levels.length - 1 ? "last" : ""} ${level.state}`}><span>{level.state === "completed" || level.state === "mastered" ? <Icon name="check" size={16} /> : index + 1}</span></div>
      <article className={`path-card ${level.state}`}><div className="path-card-top"><span>Уровень {level.order} из 6</span><small>{level.state === "locked" ? "Закрыт" : level.state === "mastered" ? "Освоен" : level.state === "completed" ? "Пройден" : "Текущий"}</small></div><h2>{level.title}</h2><p>{level.skill}</p><div className="path-card-meta"><span>4 задания · 3–5 мин</span><span>{typeLabels[level.exercise_type] || "практика"}</span></div><div className="path-card-bottom"><DifficultyBadge difficulty={level.difficulty} />{level.best_score !== null && <span className="path-stars"><StarRating value={level.stars} total={3} /> · {level.best_score}%</span>}</div>{level.state === "locked" ? <button disabled className="primary-button">Сначала завершите предыдущий уровень</button> : level.best_attempt_id ? <div className="level-card-actions"><button className="primary-button" disabled={startingLevel === level.id} onClick={() => startLevel(level.id)}>{startingLevel === level.id ? "Открываем…" : "Пройти заново"}</button><button className="subtle-button" onClick={() => nav(`/training/path/attempt/${level.best_attempt_id}/review`, { state: { returnTo: `/training/path/chapter/${chapterId}` } })}>Посмотреть разбор</button></div> : <button className="primary-button" disabled={startingLevel === level.id} onClick={() => startLevel(level.id)}>{startingLevel === level.id ? "Открываем…" : "Начать уровень"}</button>}</article>
    </div>)}</div></div>
  </section>;
}
