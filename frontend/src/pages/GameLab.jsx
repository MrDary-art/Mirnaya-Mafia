import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { BookOpenIcon } from "@phosphor-icons/react/dist/csr/BookOpen";
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
  const echoProgress = trainerProgress(echo?.completed, echo?.case_count);

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
      <div className="echo-home-scene" aria-hidden="true">
        <div className="echo-home-grid" />
        <div className="echo-home-thread"><i /><span /><i /><span /><i /></div>
        <span className="echo-home-state"><i />Причинное исследование</span>
        <span className="echo-home-scene-label">ТРЕНАЖЁР 02<br /><b>ЭХО</b></span>
      </div>
      <div className="echo-home-copy">
        <div className="echo-home-topline"><span>Тренажёр 02 · последствия решений</span>{echo.completed > 0 && <strong>Открыт</strong>}</div>
        <h2>{echo.title}</h2>
        <p>{echo.description}</p>
        <div className="echo-home-meta"><span><ClockIcon size={16} aria-hidden="true" />{echo.duration}</span><span><StarIcon size={16} aria-hidden="true" />+{echo.reward} звезды</span></div>
        <div className="echo-home-progress"><div><span>Пройдено кейсов</span><b>{echo.completed} / {echo.case_count}</b></div><div className="echo-home-progress-track" role="progressbar" aria-label="Прогресс Эхо" aria-valuemin="0" aria-valuemax="100" aria-valuenow={echoProgress}><span style={{ width: `${echoProgress}%` }} /></div></div>
        <span className="echo-home-action">{echo.completed ? "Открыть траекторию" : "Начать исследование"}<ArrowRightIcon size={19} aria-hidden="true" /></span>
      </div>
    </Link>}

    <Link className="lab-serial-entry" to="/serials">
      <div className="lab-serial-mark" aria-hidden="true"><BookOpenIcon size={32} weight="regular" /><span>03</span></div>
      <div className="lab-serial-copy"><span>Арена Сериал · интерактивные истории</span><h2>Сюжеты, в которых решение меняет отношения</h2><p>Проходите жизненные ситуации как визуальные истории: открывайте серии, выбирайте ход и смотрите, к чему он приводит.</p><span className="lab-serial-action">Открыть сериалы<ArrowRightIcon size={19} aria-hidden="true" /></span></div>
    </Link>
  </div>;
}
