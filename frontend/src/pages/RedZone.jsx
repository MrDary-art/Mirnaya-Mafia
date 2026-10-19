import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { useNavigate } from "react-router-dom";
import { Character, LabBackdrop, LabError, LabLoading } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import { caseAction } from "../components/game-lab/gameLabModel.js";
import LabHeader from "../components/game-lab/LabHeader.jsx";
import "../components/game-lab/game-lab.css";
import "../components/game-lab/lab-forest.css";

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

  const header = <LabHeader title="Красная зона" line="Сохраняйте опору под давлением." description={data?.trainer.description || "Отстаивайте свою позицию и выбирайте, когда уточнить условия, обозначить границу или взять паузу."} image="scenarios" />;
  if (!data && !error) return <div className="lab-page lab-forest">{header}<LabLoading text="Готовим Красную зону…" /></div>;
  if (!data) return <div className="lab-page lab-forest">{header}<LabError error={error} onRetry={load} /></div>;

  return <div className="lab-page lab-trainer lab-forest">
    {header}
    <div className="lab-trainer-stats" aria-label="Прогресс">
      <div><strong>{data.completed}</strong><span>из {data.cases.length} пройдено</span></div>
      <div><StarIcon size={17} aria-hidden="true" /><strong>{data.stars}</strong><span>звёзд</span></div>
    </div>

    {error && <LabError error={error} onRetry={() => setError("")} />}
    {!data.cases.length && <p className="lab-forest-empty" role="status">Кейсы скоро появятся. Загляните в другие направления лаборатории.</p>}
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
