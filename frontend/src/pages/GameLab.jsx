import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { api } from "../api.js";
import { Link } from "react-router-dom";
import { Character, LabBackdrop, LabError, LabLoading } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import { trainerProgress } from "../components/game-lab/gameLabModel.js";
import LabHeader from "../components/game-lab/LabHeader.jsx";
import "../components/game-lab/game-lab.css";
import "../components/game-lab/echo.css";
import "../components/game-lab/lab-forest.css";

export default function GameLab() {
  const [data, setData] = useState(null);
  const [stories, setStories] = useState(null);
  useEffect(() => { api("/api/serials").then(value => setStories(value.stories || [])).catch(() => {}); }, []);
  const completedStories = stories?.filter(story => story.slots?.some(slot => slot?.status === "completed")).length || 0;
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    labApi.catalog().then(setData).catch((reason) => setError(reason.message));
  }, []);
  useEffect(load, [load]);

  const header = <LabHeader title="Игровая лаборатория" line="Ваш выбор меняет историю." description="Исследуйте силу слов в игровых историях, разговорах под давлением и расследованиях. Пробуйте разные решения и наблюдайте за последствиями." />;
  if (!data && !error) return <div className="lab-page lab-forest">{header}<LabLoading /></div>;
  if (!data) return <div className="lab-page lab-forest">{header}<LabError error={error} onRetry={load} /></div>;
  const trainer = data.trainers.find((item) => item.id === "red-zone") || data.trainers[0];
  const echo = data.trainers.find((item) => item.id === "echo");
  const progress = trainerProgress(trainer?.completed, trainer?.case_count);
  const echoProgress = trainerProgress(echo?.completed, echo?.case_count);

  return <div className="lab-page lab-home lab-forest">
    {header}
    <div className="lab-trainer-grid">
    <Link className="lab-serial-entry lab-trainer-card" to="/serials" state={{ returnTo: "/lab" }}>
      <div className="lab-serial-scene" aria-hidden="true">
        <div className="lab-serial-art" />
        <div className="lab-serial-art-wash" />
        <span className="lab-serial-state"><i />Интерактивные истории</span>
        <span className="lab-serial-scene-label">ТРЕНАЖЁР 01<br /><b>ПОСЛЕ СЛОВ</b></span>
      </div>
      <div className="lab-serial-copy">
        <div className="lab-card-breadcrumb"><span>Интерактивные истории</span></div>
        <h2>После слов</h2>
        <p>Истории про отношения и последствия выбора. Экспериментируйте с решениями и наблюдайте, как меняется сюжет.</p>
        <div className="lab-serial-meta"><span><ClockIcon size={16} aria-hidden="true" />5–12 минут</span></div>
        <div className="lab-serial-progress"><div><span>Пройдено сюжетов</span><strong>{stories ? `${completedStories} / ${stories.length}` : "—"}</strong></div><div className="lab-serial-progress-track" role="progressbar" aria-label="Пройдено сюжетов" aria-valuemin="0" aria-valuemax={stories?.length || 1} aria-valuenow={completedStories}><span style={{width:`${stories?.length ? completedStories / stories.length * 100 : 0}%`}} /></div></div>
        <span className="lab-serial-action">Открыть истории<ArrowRightIcon size={19} aria-hidden="true" /></span>
      </div>
    </Link>

    {trainer && <Link className="lab-feature lab-trainer-card" to={`/lab/${trainer.id}`}>
      <div className="lab-feature-scene" aria-hidden="true">
        <LabBackdrop background="office" />
        <div className="lab-feature-light" />
        <Character character={{ portrait: "viktor" }} />
        <span className="lab-feature-state"><i />Критическая точка</span>
        <span className="lab-serial-scene-label">ТРЕНАЖЁР 02<br /><b>КРАСНАЯ ЗОНА</b></span>
      </div>
      <div className="lab-feature-copy">
        <div className="lab-card-breadcrumb"><span>Разговоры под давлением</span></div>
        <h2>{trainer.title}</h2>
        <p>Несколько ситуаций под давлением: отстаивайте свою позицию и выбирайте, когда уточнить условия, обозначить границу или взять паузу.</p>
        <div className="lab-feature-meta">
          <span><ClockIcon size={17} aria-hidden="true" />{trainer.duration}</span>
        </div>
        <div className="lab-feature-progress">
          <div><span>Пройдено кейсов</span><strong>{trainer.completed} / {trainer.case_count}</strong></div>
          <div className="lab-feature-progress-track" role="progressbar" aria-label="Прогресс тренажёра" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        </div>
        <span className="lab-feature-action">{trainer.completed ? "Продолжить практику" : "Открыть тренажёр"}<ArrowRightIcon size={20} aria-hidden="true" /></span>
       </div>
    </Link>}

    {echo && <Link className="echo-home-entry lab-trainer-card" to="/lab/echo">
      <div className="echo-home-scene" aria-hidden="true">
        <div className="echo-home-art" />
        <div className="echo-home-art-wash" />
        <span className="echo-home-state"><i />Причинное исследование</span>
        <span className="echo-home-scene-label">ТРЕНАЖЁР 03<br /><b>ЭХО</b></span>
      </div>
      <div className="echo-home-copy">
        <div className="lab-card-breadcrumb"><span>Исследование последствий</span></div>
        <h2>{echo.title}</h2>
        <p>Вы знакомитесь с последствиями решения, затем изучаете причины и меняете одну точку в разговоре, чтобы увидеть другой исход.</p>
        <div className="echo-home-meta"><span><ClockIcon size={16} aria-hidden="true" />{echo.duration}</span></div>
        <div className="echo-home-progress"><div><span>Пройдено кейсов</span><b>{echo.completed} / {echo.case_count}</b></div><div className="echo-home-progress-track" role="progressbar" aria-label="Прогресс Эхо" aria-valuemin="0" aria-valuemax="100" aria-valuenow={echoProgress}><span style={{ width: `${echoProgress}%` }} /></div></div>
        <span className="echo-home-action">{echo.completed ? "Открыть траекторию" : "Начать исследование"}<ArrowRightIcon size={19} aria-hidden="true" /></span>
      </div>
    </Link>}
    </div>
  </div>;
}
