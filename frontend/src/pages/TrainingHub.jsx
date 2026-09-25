import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TrainingNavigation from "../components/training/TrainingNavigation.jsx";
import { api } from "../api.js";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { PathIcon } from "@phosphor-icons/react/dist/csr/Path";

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
  return <div className="training-hub"><TrainingNavigation fallback="/" /><header className="training-hub-head"><div><div className="eyebrow">ОБУЧЕНИЕ ПЕРЕГОВОРАМ</div><h1>Изучайте и закрепляйте навыки</h1><p>Начните с короткого урока или двигайтесь по последовательной программе. Практические задания сохраняют ваш прогресс.</p></div><div className="training-hub-scene" aria-hidden="true"><span>06 / УЧЕБНАЯ АСТРОЛЯБИЯ</span></div></header><div className="training-hub-options"><Link to="/theory" className="training-hub-choice training-hub-theory"><BooksIcon size={34} weight="duotone" aria-hidden="true" /><span className="eyebrow">ЧИТАТЬ И ПРОВЕРЯТЬ</span><h2>Теория</h2><p>Понятные инструменты разговора, примеры и мини-практика после чтения.</p><span className="training-hub-count">{overview.theory ? `${overview.theory.total} уроков · ${overview.theory.completed} завершено` : "Откройте каталог уроков"}</span><strong>Открыть теорию ↗</strong></Link><Link to="/training/path" className="training-hub-choice training-hub-path"><PathIcon size={34} weight="duotone" aria-hidden="true" /><span className="eyebrow">ПОСЛЕДОВАТЕЛЬНАЯ ПРАКТИКА</span><h2>Программа</h2><p>Главы и уровни открываются по вашему реальному прогрессу. Каждый шаг ведёт к следующему навыку.</p><span className="training-hub-count">{chapterCount != null ? `${chapterCount} глав · ${levelCount} уровней` : "Откройте программу"}</span><strong>Перейти к программе ↗</strong></Link></div></div>;
}
