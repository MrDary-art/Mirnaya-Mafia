import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import LearningHeader from "../components/training/LearningHeader.jsx";
import { api } from "../api.js";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { PathIcon } from "@phosphor-icons/react/dist/csr/Path";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";

export default function TrainingHub() {
  const [overview, setOverview] = useState({ theory: null, path: null });
  useEffect(() => {
    let active = true;
    Promise.allSettled([api("/api/theory"), api("/api/learning-path")]).then(([theory, path]) => {
      if (active) setOverview({ theory: theory.status === "fulfilled" ? theory.value : null, path: path.status === "fulfilled" ? path.value : null });
    });
    return () => { active = false; };
  }, []);
  const chapterCount = overview.path?.chapters?.length;
  const levelCount = overview.path?.chapters?.reduce((sum, chapter) => sum + (chapter.total || 0), 0);
  const completedLevels = overview.path?.chapters?.reduce((sum, chapter) => sum + (chapter.progress || 0), 0);
  return <div className="training-hub learning-forest" role="region" aria-label="Обучение">
    <TrainingNavigation fallback="/app" />
    <LearningHeader title="Обучение" line="Знания становятся навыком." description="Изучайте инструменты переговоров и закрепляйте их в практике. Каждый следующий шаг опирается на ваш прогресс." />
    <div className="training-hub-options">
      <TrainingChoice to="/theory" variant="theory" Icon={BooksIcon} title="Теория" caption="Читать и проверять" description="Понятные инструменты разговора, примеры и мини-практика после чтения." count={overview.theory ? `${overview.theory.total} уроков · ${overview.theory.completed} завершено` : "Откройте каталог уроков"} completed={overview.theory?.completed} total={overview.theory?.total} action="Открыть теорию" />
      <TrainingChoice to="/training/path" variant="path" Icon={PathIcon} title="Закрепление теории" caption="Последовательная практика" description="Главы и уровни открываются по вашему реальному прогрессу. Каждый шаг ведёт к следующему навыку." count={chapterCount != null ? `${chapterCount} глав · ${levelCount} уровней` : "Откройте отработку"} completed={completedLevels} total={levelCount} action="Перейти к отработке" />
    </div>
  </div>;
}

function TrainingChoice({ to, variant, Icon, title, caption, description, count, completed, total, action }) {
  return <Link to={to} className={`training-hub-choice training-hub-${variant}`}>
    <div className="training-choice-heading"><div><h2>{title}</h2><span className="training-choice-caption">{caption}</span></div><Icon size={32} weight="duotone" aria-hidden="true" /></div>
    <p>{description}</p>
    <div className="training-choice-progress"><span className="training-hub-count">{count}</span>{total > 0 && <progress value={completed || 0} max={total} aria-label={`${title}: выполнено ${completed || 0} из ${total}`} />}</div>
    <strong>{action}<ArrowRightIcon size={18} aria-hidden="true" /></strong>
  </Link>;
}
