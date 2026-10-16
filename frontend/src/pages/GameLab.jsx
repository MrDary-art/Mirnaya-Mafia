import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { Link } from "react-router-dom";
import { Character, LabBackdrop, LabBrand, LabError, LabLoading } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import { trainerProgress } from "../components/game-lab/gameLabModel.js";
import "../components/game-lab/game-lab.css";
import "../components/game-lab/echo.css";

export default function GameLab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    labApi.catalog().then(setData).catch((reason) => setError(reason.message));
  }, []);
  useEffect(load, [load]);

  if (!data && !error) return <div className="lab-page"><LabLoading /></div>;
  if (!data) return <div className="lab-page"><LabError error={error} onRetry={load} /></div>;
  const trainer = data.trainers.find((item) => item.id === "red-zone") || data.trainers[0];
  const echo = data.trainers.find((item) => item.id === "echo");
  const progress = trainerProgress(trainer?.completed, trainer?.case_count);

  return <div className="lab-page lab-home">
    <header className="lab-page-header">
      <div>
        <h1>Игровая лаборатория</h1>
        <p>Короткие тренажёры для сложных разговоров. Здесь важен не «правильный ответ», а решение, которое выдерживает давление.</p>
      </div>
      <LabBrand />
    </header>

    {trainer && <Link className="lab-feature" to={`/lab/${trainer.id}`}>
      <div className="lab-feature-scene" aria-hidden="true">
        <LabBackdrop background="office" />
        <div className="lab-feature-light" />
        <Character character={{ portrait: "viktor" }} />
        <span className="lab-feature-state"><i />Критическая точка</span>
      </div>
      <div className="lab-feature-copy">
        <span className="lab-feature-number">Тренажёр 01</span>
        <h2>{trainer.title}</h2>
        <p>{trainer.description}</p>
        <div className="lab-feature-meta">
          <span><ClockIcon size={17} aria-hidden="true" />{trainer.duration}</span>
          <span><StarIcon size={17} aria-hidden="true" />+{trainer.reward} за первый результат</span>
        </div>
        <div className="lab-feature-progress">
          <div><span>Пройдено кейсов</span><strong>{trainer.completed} / {trainer.case_count}</strong></div>
          <div className="lab-feature-progress-track" role="progressbar" aria-label="Прогресс тренажёра" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        </div>
        <span className="lab-feature-action">{trainer.completed ? "Продолжить практику" : "Открыть тренажёр"}<ArrowRightIcon size={20} aria-hidden="true" /></span>
      </div>
    </Link>}

    {echo && <Link className="echo-home-entry" to="/lab/echo">
      <div className="echo-home-thread" aria-hidden="true"><i /><span /><i /><span /><i /></div>
      <div><span>Новый тренажёр</span><h2>{echo.title}</h2><p>{echo.description}</p></div>
      <div className="echo-home-meta"><span><ClockIcon size={16} aria-hidden="true" />{echo.duration}</span><strong>{echo.completed ? "Открыть траекторию" : "Исследовать"}<ArrowRightIcon size={18} aria-hidden="true" /></strong></div>
    </Link>}
  </div>;
}
