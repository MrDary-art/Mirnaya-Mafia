import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { useNavigate } from "react-router-dom";
import { LabError, LabLoading } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import LabHeader from "../components/game-lab/LabHeader.jsx";
import "../components/game-lab/game-lab.css";
import "../components/game-lab/echo.css";
import "../components/game-lab/lab-forest.css";

export default function Echo() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    labApi.trainer("echo").then(setData).catch((reason) => setError(reason.message));
  }, []);
  useEffect(load, [load]);

  async function openCase(item) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = item.run ? await labApi.run(item.run.id) : await labApi.start("echo", item.id);
      navigate(`/lab/echo/play/${payload.run.id}`);
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  }

  const header = <LabHeader title="Эхо: неделя спустя" line="Одно решение. Два будущих." description="Сначала видно последствие, затем — цепочку решений, которая к нему привела. В конце вы меняете одну точку прошлого и сравниваете два будущих." />;
  if (!data && !error) return <div className="lab-page lab-forest">{header}<LabLoading text="Открываем Эхо…" /></div>;
  if (!data) return <div className="lab-page lab-forest">{header}<LabError error={error} onRetry={load} /></div>;
  const item = data.cases[0];
  if (!item) return <div className="lab-page lab-forest">{header}<p className="lab-forest-empty" role="status">Новые исследования скоро появятся. Пока выберите другой тренажёр лаборатории.</p></div>;

  return <div className="lab-page echo-entry-page lab-forest">
    {header}
    <p className="lab-forest-status">{data.completed ? "Траектория открыта" : "Новый формат"}</p>

    {error && <LabError error={error} onRetry={load} />}
    <section className="echo-how-to" aria-label="Как играть">
      <span>Как играть</span>
      <ol>
        <li><b>Увидеть</b> последствие</li>
        <li><b>Связать</b> факты и причины</li>
        <li><b>Изменить</b> одну точку</li>
      </ol>
    </section>
    <section className="echo-case-entry" aria-label="Кейс Эхо">
      <div className="echo-entry-timeline" aria-hidden="true">
        <span className="echo-entry-dot is-past" />
        <span className="echo-entry-line" />
        <span className="echo-entry-dot is-now" />
        <span className="echo-entry-line" />
        <span className="echo-entry-dot is-future" />
        <small>точка решения</small>
        <small>последствие</small>
      </div>
      <div className="echo-case-copy">
        <span>{item.category}</span>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <p className="echo-case-backstory"><b>Предыстория.</b> {item.backstory}</p>
        <div><ClockIcon size={16} aria-hidden="true" />{item.duration}</div>
      </div>
      <button type="button" className="echo-entry-action" onClick={() => openCase(item)} disabled={busy}>
        {busy ? "Открываем…" : item.run?.status === "completed" ? "Посмотреть траекторию" : item.run ? "Продолжить исследование" : "Исследовать последствия"}
        <ArrowRightIcon size={18} aria-hidden="true" />
      </button>
    </section>
  </div>;
}
