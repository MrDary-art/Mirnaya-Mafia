import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { useNavigate } from "react-router-dom";
import { Character, LabBackdrop, LabError, LabLoading } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import { caseAction } from "../components/game-lab/gameLabModel.js";
import "../components/game-lab/game-lab.css";

export default function RedZone() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    labApi.trainer("red-zone").then(setData).catch((reason) => setError(reason.message));
  }, []);
  useEffect(load, [load]);

  async function openCase(item) {
    if (pending) return;
    setPending(item.id);
    setError("");
    try {
      const result = item.run ? await labApi.run(item.run.id) : await labApi.start("red-zone", item.id);
      navigate(`/lab/red-zone/play/${result.run.id}`);
    } catch (reason) {
      setError(reason.message);
      setPending("");
    }
  }

  if (!data && !error) return <div className="lab-page"><LabLoading text="Готовим Красную зону…" /></div>;
  if (!data) return <div className="lab-page"><LabError error={error} onRetry={load} /></div>;

  return <div className="lab-page lab-trainer">
    <header className="lab-trainer-header">
      <div className="lab-trainer-title">
        <span>Управление напряжённым разговором</span>
        <h1>Красная зона</h1>
        <p>{data.trainer.description}</p>
      </div>
      <div className="lab-trainer-stats" aria-label="Прогресс">
        <div><strong>{data.completed}</strong><span>из {data.cases.length} пройдено</span></div>
        <div><StarIcon size={17} aria-hidden="true" /><strong>{data.stars}</strong><span>звёзд</span></div>
      </div>
    </header>

    {error && <LabError error={error} onRetry={() => setError("")} />}
    <section className="lab-case-list" aria-label="Кейсы тренажёра">
      {data.cases.map((item, index) => <article className={`lab-case-row${item.run?.status === "completed" ? " is-complete" : ""}`} key={item.id}>
        <button type="button" className="lab-case-open" onClick={() => openCase(item)} disabled={!!pending} aria-label={`${caseAction(item)}: ${item.title}`} />
        <div className="lab-case-visual" aria-hidden="true">
          <LabBackdrop background={item.background} />
          <Character character={item.character} />
          <span className="lab-case-index">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="lab-case-copy">
          <div className="lab-case-topline"><span>{item.category}</span>{item.run?.status === "completed" && <span className="lab-case-done"><CheckIcon size={13} weight="bold" />Пройдено</span>}</div>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
          <div className="lab-case-meta"><span><ClockIcon size={15} />{item.duration}</span><span>{item.character.name}</span>{item.endings_found > 0 && <span>{item.endings_found} из {item.endings_total} результатов</span>}</div>
        </div>
        <span className="lab-case-action">{pending === item.id ? <i className="lab-spinner" /> : <>{caseAction(item)}<ArrowRightIcon size={18} /></>}</span>
      </article>)}
    </section>
  </div>;
}
