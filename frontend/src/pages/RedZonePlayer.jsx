import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { Link, useParams } from "react-router-dom";
import { Character, LabBackdrop, LabError, LabLoading, Metrics, ProgressLine, ResultActions, StageBadge } from "../components/game-lab/GameLabShared.jsx";
import { labApi } from "../components/game-lab/labApi.js";
import { shortcutFor } from "../components/game-lab/gameLabModel.js";
import "../components/game-lab/game-lab.css";

export default function RedZonePlayer() {
  const { runId } = useParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogueRef = useRef(null);

  const load = useCallback(() => {
    setError("");
    labApi.run(runId).then(setData).catch((reason) => setError(reason.message));
  }, [runId]);

  useEffect(load, [load]);
  useEffect(() => {
    if (data?.scene) dialogueRef.current?.focus({ preventScroll: true });
  }, [data?.run?.revision, data?.scene]);

  const act = useCallback(async (choiceId) => {
    if (!data?.scene || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await labApi.act(data.run.id, {
        revision: data.run.revision,
        node_id: data.scene.id,
        ...(choiceId ? { choice_id: choiceId } : {}),
      });
      setData(next);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }, [busy, data]);

  useEffect(() => {
    function onKey(event) {
      if (!data?.scene || busy || event.altKey || event.ctrlKey || event.metaKey) return;
      if (data.scene.phase === "reaction" && event.key === "Enter") {
        event.preventDefault();
        act();
        return;
      }
      const index = Number(event.key) - 1;
      if (data.scene.phase === "decision" && index >= 0 && index < data.scene.choices.length) {
        event.preventDefault();
        act(data.scene.choices[index].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, busy, data?.scene]);

  async function restart() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      setData(await labApi.restart(data.run.id, data.run.revision));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) return <div className="lab-player-shell"><LabLoading text="Восстанавливаем разговор…" /></div>;
  if (!data) return <div className="lab-player-shell"><LabError error={error} onRetry={load} /></div>;
  const finished = data.run.status === "completed";
  const scene = data.scene;

  return <div className={`lab-player-shell stage-${data.run.tension_stage}`}>
    <header className="lab-player-header">
      <div className="lab-player-heading">
        <span>Красная зона · {data.case.category}</span>
        <h1>{data.case.title}</h1>
      </div>
      <div className="lab-player-progress">
        <span>{Math.min(data.run.turn + (scene?.phase === "decision" ? 1 : 0), data.total_turns)} / {data.total_turns}</span>
        <ProgressLine current={data.run.turn} total={data.total_turns} />
      </div>
      <Link className="lab-player-close" to="/lab/red-zone" aria-label="Закрыть кейс"><XIcon size={21} aria-hidden="true" /></Link>
    </header>

    {error && <div className="lab-player-error" role="alert"><span>{error}</span><button onClick={load}>Обновить</button></div>}

    {!finished ? <main className="lab-game" aria-label="Тренажёр разговора">
      <section className="lab-scene" aria-label={`Собеседник: ${data.case.character.name}`}>
        <LabBackdrop background={data.case.background} />
        <div className="lab-scene-wash" />
        <Character character={data.case.character} />
        <div className="lab-scene-caption">
          <StageBadge stage={data.run.tension_stage} />
          <div><strong>{data.case.character.name}</strong><span>{data.case.character.role}</span></div>
        </div>
      </section>

      <section className="lab-conversation">
        <article ref={dialogueRef} tabIndex="-1" className={`lab-dialogue is-${scene.phase}`} aria-live="polite" aria-atomic="true">
          <header><span>{scene.phase === "reaction" ? "Реакция собеседника" : data.case.character.name}</span>{scene.phase === "decision" && <small>Ваш ход</small>}</header>
          <p>{scene.text}</p>
        </article>

        <div className={`lab-actions is-${scene.phase}`}>
          {scene.phase === "decision" ? <fieldset className="lab-choices">
            <legend>{scene.prompt}</legend>
            <div>{scene.choices.map((choice, index) => <button key={choice.id} type="button" disabled={busy} onClick={() => act(choice.id)}>
              <span className="lab-choice-key" aria-hidden="true">{shortcutFor(index)}</span>
              <span>{choice.text}</span>
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>)}</div>
          </fieldset> : <div className="lab-continue-wrap">
            <p>Решение принято. Посмотрите, как оно изменило разговор.</p>
            <button className="lab-primary-button lab-continue" type="button" disabled={busy} onClick={() => act()}>{busy ? "Сохраняем…" : "Продолжить"}<ArrowRightIcon size={18} aria-hidden="true" /></button>
          </div>}
        </div>
        <Metrics metrics={data.run.metrics} compact />
      </section>
    </main> : <main className="lab-result">
      <section className="lab-result-visual" aria-hidden="true">
        <LabBackdrop background={data.case.background} />
        <Character character={data.case.character} />
        <span><CheckIcon size={24} weight="bold" /></span>
      </section>
      <section className="lab-result-copy">
        <div className="lab-result-status">{data.reward?.first_completion ? <><StarIcon size={17} weight="fill" />+{data.reward.stars} звезды</> : "Результат кейса"}</div>
        <h2>{data.report.outcome.title}</h2>
        <p>{data.report.outcome.description}</p>
        <Metrics metrics={data.report.metrics} />
        {!!data.report.techniques.length && <div className="lab-techniques"><h3>Ваши рабочие приёмы</h3><div>{data.report.techniques.map((item) => <span key={item.name}>{item.name}{item.count > 1 && <b>×{item.count}</b>}</span>)}</div></div>}
        <ResultActions onRestart={restart} busy={busy} />
      </section>
    </main>}
  </div>;
}
