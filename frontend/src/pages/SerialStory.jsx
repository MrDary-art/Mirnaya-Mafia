import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { SerialArtwork, SerialError, SerialIcon, SerialLoading, SerialModal } from "../components/serials/SerialShared.jsx";
import { categoryLabel, isBonus, mainEpisodes, shortDate } from "../components/serials/serialModel.js";
import "../components/serials/serials.css";

function episodeProgress(episode, index, main, slots, latest) {
  const completed = slots.some((run) => run.completed_episodes?.includes(episode.id));
  const current = !completed && latest?.episode_id === episode.id;
  const revealed = isBonus(episode)
    ? slots.some((run) => main.every((item) => run.completed_episodes?.includes(item.id)))
    : index === 0 || slots.some((run) => main.slice(0, index).every((item) => run.completed_episodes?.includes(item.id)));
  if (completed) return { completed, current, revealed: true, label: "Пройдена", icon: "check" };
  if (current) return { completed, current, revealed: true, label: "Продолжить", icon: "arrow-right" };
  if (revealed) return { completed, current, revealed, label: "Доступна", icon: "book-open" };
  return { completed, current, revealed: false, label: "Закрыта", icon: "lock-keyhole" };
}

function cleanEpisodeTitle(title = "") {
  return title.replace(/^\s*\d+\.\s*/, "");
}

export default function SerialStory() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [chooseSlot, setChooseSlot] = useState(false);

  async function load() {
    setError("");
    try { setData(await api(`/api/serials/${encodeURIComponent(storyId)}`)); }
    catch (exception) { setError(exception.message); }
  }
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    api(`/api/serials/${encodeURIComponent(storyId)}`).then((value) => active && setData(value)).catch((exception) => active && setError(exception.message));
    return () => { active = false; };
  }, [storyId]);

  async function start(slot) {
    if (pending) return;
    setPending(slot); setError("");
    try {
      const result = await api(`/api/serials/${encodeURIComponent(storyId)}/runs`, { method: "POST", body: { slot } });
      navigate(`/serials/play/${result.run.id}`, { state: { returnTo: `/serials/${storyId}` } });
    } catch (exception) { setError(exception.message); }
    finally { setPending(null); }
  }

  async function openEpisode(episode, progress, targetRun) {
    if (pending || !progress.revealed) return;
    if (progress.current && targetRun?.id) {
      navigate(`/serials/play/${targetRun.id}`, { state: { returnTo: `/serials/${storyId}` } });
      return;
    }
    if (!targetRun) { await start(1); return; }
    if (targetRun.status === "active") return;
    setPending(episode.id); setError("");
    try {
      const result = await api(`/api/serials/runs/${encodeURIComponent(targetRun.id)}/episodes/${encodeURIComponent(episode.id)}/start`, { method: "POST", body: { revision: targetRun.revision } });
      navigate(`/serials/play/${result.run.id}`, { state: { returnTo: `/serials/${storyId}` } });
    } catch (exception) { setError(exception.message); }
    finally { setPending(null); }
  }

  const story = data?.story;
  const slots = data?.slots || [];
  const latest = [...slots].filter((slot) => slot?.id).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  const main = mainEpisodes(story);
  const bonusEpisodes = (story?.episodes || []).filter(isBonus);
  const completedMain = main.filter((episode) => slots.some((run) => run.completed_episodes?.includes(episode.id))).length;

  function episodeRow(episode) {
    const mainIndex = main.findIndex((item) => item.id === episode.id);
    const progress = episodeProgress(episode, mainIndex, main, slots, latest);
    const bonus = isBonus(episode);
    const unlockLabel = bonus ? "После финала сезона" : mainIndex > 0 ? `После серии ${mainIndex}` : "Закрыта";
    const stateClass = progress.completed ? "is-complete" : progress.current ? "is-current" : progress.revealed ? "is-available" : "is-locked";
    const completedRun = [...slots].filter((run) => run.completed_episodes?.includes(episode.id)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    const targetRun = progress.current ? latest : progress.completed ? completedRun : latest;
    const canOpen = progress.current || (progress.revealed && (!targetRun || targetRun.status !== "active"));
    const episodeLabel = bonus ? "дополнительную серию" : `серию ${mainIndex + 1}`;
    const openLabel = progress.current ? `Продолжить ${episodeLabel}: ${cleanEpisodeTitle(episode.title)}` : progress.completed ? `Пройти ${episodeLabel} снова: ${cleanEpisodeTitle(episode.title)}` : `Открыть ${episodeLabel}: ${cleanEpisodeTitle(episode.title)}`;
    return <article className={`serials-episode-row ${bonus ? "is-bonus" : ""} ${stateClass} ${canOpen ? "is-openable" : ""}`} key={episode.id}>
      {canOpen && <button type="button" className="serials-episode-open" aria-label={openLabel} disabled={!!pending} onClick={() => openEpisode(episode, progress, targetRun)} />}
      <span className="serials-episode-number" aria-hidden="true">{progress.completed ? <SerialIcon name="check" size={18} /> : bonus ? <SerialIcon name="repeat-2" size={19} /> : String(mainIndex + 1).padStart(2, "0")}</span>
      <div className="serials-episode-copy">
        <span>{bonus ? "Эпизод" : `Серия ${mainIndex + 1}`}{progress.current && <b>Вы здесь</b>}</span>
        <h3>{progress.revealed ? cleanEpisodeTitle(episode.title) : "Название откроется позже"}</h3>
      </div>
      <span className={`serials-episode-state ${canOpen ? "is-action" : ""} ${stateClass}`}>{pending === episode.id ? <span className="serials-spinner" /> : <SerialIcon name={canOpen ? "arrow-right" : progress.icon} size={14} />}{pending === episode.id ? "Открываем…" : progress.revealed ? progress.label : unlockLabel}</span>
    </article>;
  }

  return <div className="serials-page serials-story-page">
    {error && <SerialError error={error} onRetry={load} />}
    {!data && !error && <SerialLoading />}
    {story && <>
      <section className="serials-story-hero">
        <SerialArtwork story={story} />
        <div className="serials-story-hero-shade" />
        <div className="serials-story-hero-copy">
          <div className="serials-eyebrow">{categoryLabel(story)} · ИНТЕРАКТИВНАЯ ИСТОРИЯ</div>
          <h1>{story.subtitle || story.title}</h1>
          <p>{story.description}</p>
          <div className="serials-story-tags"><span><SerialIcon name="clapperboard" />{main.length} серии</span></div>
          <div className="serials-inline-actions">
            <button className="serials-button serials-button--lime" disabled={!!pending} onClick={() => start(latest?.slot || 1)}>{pending ? "Открываем…" : latest ? "Продолжить историю" : "Начать историю"}<SerialIcon name="arrow-right" /></button>
            <button className="serials-story-slots-button" onClick={() => setChooseSlot(true)}><SerialIcon name="copy" />Прохождения <span>{slots.length}/3</span></button>
          </div>
        </div>
      </section>

      <section className="serials-season-content" aria-labelledby="serials-season-title">
        <header className="serials-season-heading"><div><span>Сезон</span><h2 id="serials-season-title">Серии</h2></div><strong>{completedMain} из {main.length} пройдено</strong></header>
        <div className="serials-season-progress" role="progressbar" aria-label="Прогресс сезона" aria-valuemin="0" aria-valuemax={main.length} aria-valuenow={completedMain}><span style={{ width: `${main.length ? completedMain / main.length * 100 : 0}%` }} /></div>
        <div className="serials-episode-list">{main.map(episodeRow)}</div>
        {!!bonusEpisodes.length && <section className="serials-perspective" aria-labelledby="serials-perspective-title">
          <header><SerialIcon name="repeat-2" size={18} /><h3 id="serials-perspective-title">Другая сторона</h3></header>
          <div className="serials-perspective-list">{bonusEpisodes.map(episodeRow)}</div>
        </section>}
      </section>

      {chooseSlot && <SerialModal title="Прохождения" onClose={() => setChooseSlot(false)}><div className="serials-slot-list">{[1, 2, 3].map((slot) => {
        const run = slots.find((item) => item.slot === slot);
        const episode = story.episodes?.find((item) => item.id === run?.episode_id);
        return <button className="serials-slot" key={slot} disabled={!!pending} onClick={() => start(slot)}><span className="serials-slot-index">0{slot}</span><span><strong>{run ? run.status === "completed" ? "История завершена" : episode?.title || "Продолжить" : "Новая история"}</strong><small>{run ? `${shortDate(run.updated_at)} · ${run.completed_episodes?.length || 0} серий пройдено` : "Свободное прохождение"}</small></span>{pending === slot ? <span className="serials-spinner" /> : <SerialIcon name={run ? "arrow-right" : "plus"} size={20} />}</button>;
      })}</div>{error && <p className="serials-inline-error" role="alert">{error}</p>}</SerialModal>}
    </>}
  </div>;
}
