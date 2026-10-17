import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { SerialArtwork, SerialBack, SerialBackdrop, SerialError, SerialIcon, SerialLoading, SerialModal, SerialPortrait, StarBalance } from "../components/serials/SerialShared.jsx";
import { characterFor, choiceDisabledReason, choicePrice, isBonus, nextEpisode, sceneHasEnding, sceneLines, speakerLabel, withoutAgeLabel } from "../components/serials/serialModel.js";
import { DecisionMetrics, EpisodeBrief, EpisodeResult } from "../components/serials/SerialLearning.jsx";
import { businessPracticePath } from "../business/navigation.js";
import "../components/serials/serials.css";

function initialSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("arena_serial_reading") || "{}");
    return { large: saved?.large === true, contrast: saved?.contrast === true };
  } catch { return { large: false, contrast: false }; }
}

function needsBrief(payload) {
  if (!payload?.episode?.learning || payload.run?.status !== "active") return false;
  return payload.history?.at(-1)?.episode_id !== payload.episode.id;
}

export default function SerialPlayer() {
  const { runId, companyId } = useParams();
  const serialsBase = companyId ? businessPracticePath(companyId, "serials") : "/serials";
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [settings, setSettings] = useState(initialSettings);
  const [music, setMusic] = useState(false);
  const [musicError, setMusicError] = useState("");
  const [briefEpisodeId, setBriefEpisodeId] = useState(null);
  const requestPending = useRef(false);
  const audioRef = useRef(null);
  const continueRef = useRef(null);
  const previousStars = useRef(null);
  const dialogueRef = useRef(null);
  const choicesRef = useRef(null);
  const revealNextScene = useRef(false);
  const keyboardInput = useRef(false);

  function applyLoaded(value) {
    setData(value);
    previousStars.current = value.stars;
    setBriefEpisodeId(needsBrief(value) ? value.episode.id : null);
  }

  async function load() {
    if (requestPending.current) return;
    setError("");
    try { applyLoaded(await api(`/api/serials/runs/${encodeURIComponent(runId)}`)); }
    catch (exception) { setError(exception.message); }
  }

  useEffect(() => {
    let active = true;
    setData(null); setError(""); setLineIndex(0); setBriefEpisodeId(null);
    api(`/api/serials/runs/${encodeURIComponent(runId)}`).then((value) => { if (active) applyLoaded(value); }).catch((exception) => active && setError(exception.message));
    return () => { active = false; };
  }, [runId]);
  useEffect(() => { setLineIndex(0); }, [data?.scene?.id, data?.episode?.id]);
  useEffect(() => { try { localStorage.setItem("arena_serial_reading", JSON.stringify(settings)); } catch { /* Keep preferences in memory. */ } }, [settings]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const lines = sceneLines(data?.scene);
  const safeLineIndex = Math.min(lineIndex, lines.length - 1);
  const line = lines[safeLineIndex];
  const lastLine = safeLineIndex >= lines.length - 1;
  const choices = data?.scene?.choices || [];
  const terminal = sceneHasEnding(data?.scene);
  const finished = data?.run?.status === "episode_complete" || data?.run?.status === "completed";
  const character = characterFor(data?.story, line?.speaker);
  const lastSpeakingCharacter = character || [...lines.slice(0, safeLineIndex + 1)].reverse().map((entry) => characterFor(data?.story, entry.speaker)).find(Boolean);
  const playerIsSpeaking = line?.speaker === "you";
  const sceneIsNarration = !line?.speaker || line?.speaker === "narrator";
  const sceneCharacter = sceneIsNarration ? null : character || lastSpeakingCharacter;
  const sceneSpeakerStatus = character ? "Говорит" : playerIsSpeaking ? "Ваша реплика" : "Сцена";
  const sceneSpeakerName = character?.name || (playerIsSpeaking ? "Вы" : locationLabel(data?.scene?.background));
  const sceneSpeakerContext = character?.role ? withoutAgeLabel(character.role) : (playerIsSpeaking && lastSpeakingCharacter ? `${lastSpeakingCharacter.name} слушает` : "");
  const dialogueState = sceneIsNarration ? "is-narration" : playerIsSpeaking ? "is-player-line" : "is-character-line";
  const dialogueTurnLabel = sceneIsNarration ? "Описание" : playerIsSpeaking ? "Ваш ответ" : "Реплика";
  const dialogueSpeakerName = sceneIsNarration ? locationLabel(data?.scene?.background) : speakerLabel(data?.story, line?.speaker) || "Собеседник";
  const showContinue = !lastLine || (!choices.length && !terminal);
  const ending = data?.ending || data?.scene?.ending || data?.run?.ending;
  const next = data && nextEpisode(data);
  const otherPerspective = data?.episodes?.find((episode) => isBonus(episode) && episode.available);
  const showBrief = Boolean(data && !finished && briefEpisodeId === data.episode.id);
  const episodeNumber = data ? (data.story.episodes || []).filter((item) => !isBonus(item)).findIndex((item) => item.id === data.episode.id) + 1 : 0;

  useEffect(() => {
    const key = () => { keyboardInput.current = true; };
    const pointer = () => { keyboardInput.current = false; };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", pointer);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", pointer); };
  }, []);
  useEffect(() => {
    if (!revealNextScene.current || showBrief) return;
    revealNextScene.current = false;
    const target = dialogueRef.current || document.querySelector(".serials-finale");
    if (!target) return;
    if (keyboardInput.current) target.focus({ preventScroll: true });
    const bounds = target.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) target.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [data?.run?.revision, showBrief]);
  useEffect(() => {
    if (showBrief || !lastLine || !choices.length || modal || confirm) return;
    const first = choicesRef.current?.querySelector("button:not(:disabled)");
    if (keyboardInput.current) first?.focus({ preventScroll: true });
    const bounds = choicesRef.current?.getBoundingClientRect();
    if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      choicesRef.current.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "nearest" });
    }
  }, [showBrief, lastLine, data?.scene?.id, modal, confirm]);

  async function mutate(path, body = {}) {
    if (requestPending.current || !data) return;
    requestPending.current = true; setBusy(true); setError("");
    try {
      const value = await api(`/api/serials/runs/${encodeURIComponent(runId)}${path}`, { method: "POST", body: { revision: data.run.revision, ...body } });
      revealNextScene.current = true;
      setData(value); setConfirm(null); setModal(null); setLineIndex(0);
      if (path === "/restart" || path.startsWith("/episodes/")) setBriefEpisodeId(value.episode.id);
      if (value.stars !== previousStars.current) { previousStars.current = value.stars; void refresh(); }
    } catch (exception) { setError(exception.message); }
    finally { requestPending.current = false; setBusy(false); }
  }

  function advance() {
    if (showBrief || busy || requestPending.current || modal || confirm || finished) return;
    if (!lastLine) { setLineIndex((value) => value + 1); return; }
    if (!choices.length) void mutate("/act", { node_id: data.scene.id });
  }
  continueRef.current = advance;
  useEffect(() => {
    function keydown(event) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || showBrief) return;
      if (event.key !== " " && event.key !== "Enter") return;
      const target = event.target;
      if (target?.closest?.("button,a,input,select,textarea,summary,details,[contenteditable],[role=button],[role=dialog]")) return;
      event.preventDefault(); continueRef.current?.();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [showBrief]);

  function selectChoice(choice) {
    if (busy || requestPending.current || choiceDisabledReason(choice, data.stars)) return;
    if (choicePrice(choice)) setConfirm({ type: "choice", choice, cost: choicePrice(choice) });
    else void mutate("/act", { node_id: data.scene.id, choice_id: choice.id });
  }
  function startEpisode(episode) {
    if (busy || requestPending.current || !episode.available) return;
    if (episode.cost && !episode.owned) { setModal(null); setConfirm({ type: "episode", episode, cost: episode.cost }); }
    else void mutate(`/episodes/${encodeURIComponent(episode.id)}/start`);
  }
  function performConfirmed() {
    if (confirm.type === "restart") void mutate("/restart");
    else if (confirm.type === "episode") void mutate(`/episodes/${encodeURIComponent(confirm.episode.id)}/start`);
    else void mutate("/act", { node_id: data.scene.id, choice_id: confirm.choice.id });
  }
  async function toggleMusic() {
    setMusicError("");
    if (music) { audioRef.current?.pause(); setMusic(false); return; }
    if (!audioRef.current) { const audio = new Audio(); audio.preload = "none"; audio.src = "/assets/serials/quiet-evening.wav"; audio.loop = true; audio.volume = 0.2; audioRef.current = audio; }
    try { await audioRef.current.play(); setMusic(true); }
    catch { setMusic(false); setMusicError("Музыка пока недоступна. Попробуйте включить её ещё раз."); }
  }

  return <div className={`serials-page serials-player ${settings.large ? "serials-player--large" : ""} ${settings.contrast ? "serials-player--contrast" : ""}`}>
    {!data && !error && <SerialLoading text="Возвращаемся в вашу историю…" />}
    {error && <SerialError error={error} onRetry={load}>{data && <button className="serials-text-link" onClick={load}>Обновить сохранение</button>}</SerialError>}
    {data && <>
      <header className="serials-player-header">
        <SerialBack to={`${serialsBase}/${data.story.id}`}>К сезону</SerialBack>
        <div className="serials-player-title"><span>{isBonus(data.episode) ? "Другая сторона" : `Серия ${episodeNumber}`} · {withoutAgeLabel(data.episode.perspective || "Ваша история")}</span><h1>{data.episode.title}</h1></div>
        <div className="serials-player-actions"><button className="serials-player-menu-trigger" aria-label="Меню эпизода" aria-haspopup="dialog" onClick={() => setModal("menu")}><SerialIcon name="more-horizontal" size={22} /></button></div>
      </header>
      {musicError && <p className="serials-inline-error" role="status">{musicError}</p>}

      {showBrief ? <section className="serials-briefing"><div className="serials-briefing-art"><SerialArtwork story={data.story} /><span>{withoutAgeLabel(data.episode.perspective || data.story.title)}</span></div><EpisodeBrief episode={data.episode} learning={data.episode.learning} onStart={() => setBriefEpisodeId(null)} /></section> : !finished ? <section className={`serials-scene-workspace ${lastLine && choices.length ? "has-choices" : ""}`}>
        <section className={`serials-cinema serials-cinema--${data.scene?.background || "school"} ${character ? "is-character-turn" : playerIsSpeaking ? "is-player-turn" : "is-establishing"}`} aria-label="Сцена истории">
          <SerialBackdrop className="serials-cinema-background" background={data.scene?.background} variant="scene" />
          <div className="serials-cinema-light" />
          <div className="serials-cinema-location"><span />{locationLabel(data.scene?.background)}</div>
          {sceneCharacter && <SerialPortrait index={sceneCharacter.portrait} className={`serials-cinema-character ${character ? "is-speaking" : "is-listening"}`} />}
          <div className="serials-cinema-vignette" />
          <div className={`serials-cinema-speaker ${character ? "is-speaking" : playerIsSpeaking ? "is-player" : "is-narration"}`}>
            <span>{sceneSpeakerStatus}</span>
            <strong>{sceneSpeakerName}</strong>
            {sceneSpeakerContext && <small>{sceneSpeakerContext}</small>}
          </div>
          <div className="serials-line-progress" aria-label={`Реплика ${safeLineIndex + 1} из ${lines.length}`}>{lines.map((_, index) => <span key={index} className={index <= safeLineIndex ? "is-read" : ""} />)}</div>
        </section>
        <div className="serials-conversation-column">
          <div className={`serials-dialogue-row ${dialogueState} ${showContinue ? "has-continue" : ""}`}><section ref={dialogueRef} tabIndex={-1} className={`serials-dialogue ${dialogueState}`} aria-live="polite" aria-atomic="true"><div className="serials-dialogue-speaker"><div className="serials-dialogue-identity"><span aria-hidden="true" /><div><strong>{dialogueSpeakerName}</strong>{character?.role && <small>{withoutAgeLabel(character.role)}</small>}</div></div><span className="serials-dialogue-state">{dialogueTurnLabel}</span></div><p>{line?.text}</p>{showContinue ? <div className="serials-dialogue-footer"><button className="serials-continue" onClick={advance} disabled={busy}>{busy ? "Сохраняем…" : "Продолжить"}<SerialIcon name="arrow-right" size={19} /></button></div> : null}</section></div>
          {lastLine && !!choices.length && <section ref={choicesRef} className="serials-choices" aria-label="Что вы ответите?"><header><div className="serials-choice-prompt"><span>Ваш ход</span><h2>Что вы ответите?</h2></div>{choices.some((choice) => Number(choice.cost) > 0 && !choice.owned) && <StarBalance stars={data.stars} />}</header>{choices.map((choice, index) => { const reason = choiceDisabledReason(choice, data.stars); const paid = Number(choice.cost) > 0; return <div key={choice.id} className="serials-choice-wrap"><button className={`serials-choice ${paid ? "is-special" : ""} ${choice.owned && paid ? "is-owned" : ""}`} disabled={busy || !!reason} onClick={() => selectChoice(choice)} aria-describedby={reason ? `serial-choice-reason-${index}` : undefined}><span className="serials-choice-index">{paid ? <SerialIcon name={choice.owned ? "check" : "star"} size={18} /> : String(index + 1).padStart(2, "0")}</span><span className="serials-choice-text">{choice.text}{paid && <small>{choice.owned ? "Дополнительная сцена открыта" : "Дополнительная сцена"}</small>}</span><span className="serials-choice-tail">{paid && !choice.owned ? `${choice.cost} ★` : <SerialIcon name="arrow-up-right" size={18} />}</span></button>{reason && <p className="serials-choice-reason" id={`serial-choice-reason-${index}`}>{reason}</p>}</div>; })}</section>}
          {lastLine && terminal && <div className="serials-terminal-action"><button className="serials-button" disabled={busy} onClick={() => mutate("/act", { node_id: data.scene.id })}>{busy ? "Сохраняем…" : "Посмотреть результат"}<SerialIcon name="arrow-right" /></button></div>}
          <DecisionMetrics effects={data.feedback?.applied_effects} metrics={data.run.metrics} />
        </div>
      </section> : <section tabIndex={-1} className="serials-finale"><div className="serials-finale-art"><SerialArtwork story={data.story} /><div className="serials-finale-seal"><SerialIcon name="bookmark-check" size={29} /></div></div><div className="serials-finale-copy"><p className="serials-finale-status">Результат</p><h2>{ending?.title || "Продолжение следует"}</h2><p>{ending?.text || "Ваши решения сохранены. Впереди — новый взгляд на эту историю."}</p><EpisodeResult metrics={data.run.metrics} /><div className="serials-finale-actions">{next ? <button className="serials-button" disabled={busy} onClick={() => startEpisode(next)}>Следующая серия <SerialIcon name="arrow-right" /></button> : otherPerspective ? <button className="serials-button" onClick={() => setModal("episodes")}>Другая сторона <SerialIcon name="repeat-2" /></button> : <Link className="serials-button" to={serialsBase}>Другие истории <SerialIcon name="arrow-right" /></Link>}</div><Link className="serials-text-link" to={`${serialsBase}/${data.story.id}`}>К списку серий</Link></div></section>}

      {modal === "menu" && <SerialModal title="Меню" onClose={() => setModal(null)}><PlayerMenu music={music} onEpisodes={() => setModal("episodes")} onMusic={toggleMusic} onSettings={() => setModal("settings")} onRestart={() => { setModal(null); setConfirm({ type: "restart" }); }} /></SerialModal>}
      {modal === "episodes" && <SerialModal title="Серии" onClose={() => setModal(null)}><div className="serials-player-episodes">{data.episodes.map((episode, index) => { const insufficient = !episode.owned && episode.cost > data.stars; const current = episode.id === data.episode.id; return <article key={episode.id} className={current ? "is-current" : ""}><div><span>{isBonus(episode) ? "Другая сторона" : `Серия ${index + 1}`}</span><h3>{episode.available || episode.completed || current ? episode.title : "Название пока скрыто"}</h3></div>{episode.available && !current ? <button className="serials-text-link" disabled={busy || insufficient} onClick={() => startEpisode(episode)}>{episode.owned || !episode.cost ? "Открыть" : `${episode.cost} ★`}<SerialIcon name="arrow-right" size={15} /></button> : <span className="serials-episode-lock">{episode.completed ? "Пройдена" : current ? "Сейчас" : "Закрыта"}</span>}</article>; })}</div></SerialModal>}
      {modal === "settings" && <SerialModal title="Чтение" onClose={() => setModal(null)}><div className="serials-reading-options"><label><span><strong>Крупный текст</strong></span><input type="checkbox" checked={settings.large} onChange={(event) => setSettings((value) => ({ ...value, large: event.target.checked }))} /></label><label><span><strong>Больше контраста</strong></span><input type="checkbox" checked={settings.contrast} onChange={(event) => setSettings((value) => ({ ...value, contrast: event.target.checked }))} /></label></div></SerialModal>}
      {confirm && <SerialModal title={confirm.type === "restart" ? "Начать заново?" : "Открыть сцену?"} onClose={() => !busy && setConfirm(null)}>{confirm.type === "restart" ? <p className="serials-modal-intro">Текущее прохождение начнётся с первой серии.</p> : <><blockquote className="serials-confirm-quote">{confirm.choice?.text || confirm.episode?.title}</blockquote><p className="serials-modal-intro">Стоимость — <strong>{confirm.cost} ★</strong>. После открытия сцена останется доступной.</p></>}<div className="serials-modal-actions"><button className="serials-button serials-button--ghost" disabled={busy} onClick={() => setConfirm(null)}>Отмена</button><button className="serials-button" disabled={busy || (confirm.cost && confirm.cost > data.stars)} onClick={performConfirmed}>{busy ? "Сохраняем…" : confirm.type === "restart" ? "Начать заново" : `Открыть за ${confirm.cost} ★`}</button></div>{error && <p className="serials-inline-error" role="alert">{error}</p>}</SerialModal>}
    </>}
  </div>;
}

function PlayerMenu({ music, onEpisodes, onMusic, onSettings, onRestart }) {
  return <nav className="serials-player-menu" aria-label="Действия эпизода">
    <button onClick={onEpisodes}><SerialIcon name="list" /><strong>Серии</strong><SerialIcon name="arrow-right" /></button>
    <button aria-pressed={music} onClick={onMusic}><SerialIcon name={music ? "volume-2" : "volume-x"} /><strong>{music ? "Выключить музыку" : "Включить музыку"}</strong></button>
    <button onClick={onSettings}><SerialIcon name="settings-2" /><strong>Настройки чтения</strong><SerialIcon name="arrow-right" /></button>
    <button className="is-danger" onClick={onRestart}><SerialIcon name="rotate-ccw" /><strong>Начать заново</strong></button>
  </nav>;
}

function locationLabel(background) {
  return { school: "После уроков", home: "Дома", cafe: "Встреча в кафе", office: "Рабочий день", courtyard: "Во дворе", bedroom: "Личное пространство", stage: "Перед выступлением", chat: "В переписке" }[background] || "Ваша история";
}
