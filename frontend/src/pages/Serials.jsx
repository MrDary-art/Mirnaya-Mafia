import { useEffect, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { SerialArtwork, SerialError, SerialLoading } from "../components/serials/SerialShared.jsx";
import { categoryLabel, latestRun, mainEpisodes } from "../components/serials/serialModel.js";
import { businessPracticePath } from "../business/navigation.js";
import "../components/game-lab/case-list.css";
import "../components/serials/serials.css";

export default function Serials() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const serialsBase = companyId ? businessPracticePath(companyId, "serials") : "/serials";
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [startingStoryId, setStartingStoryId] = useState("");
  const [restartingStoryId, setRestartingStoryId] = useState("");

  async function getLibrary() {
    let value = await api("/api/serials");
    if (!value.welcome_claimed) {
      try {
        const welcome = await api("/api/serials/welcome", { method: "POST" });
        value = { ...value, ...welcome };
        void refresh();
      } catch { /* The library remains usable without the welcome reward. */ }
    }
    return value;
  }

  async function load() {
    setError("");
    try { setData(await getLibrary()); }
    catch (exception) { setError(exception.message); }
  }

  useEffect(() => {
    let active = true;
    getLibrary().then((value) => { if (active) setData(value); }).catch((exception) => { if (active) setError(exception.message); });
    return () => { active = false; };
  }, []);

  async function startStory(story) {
    if (startingStoryId || restartingStoryId) return;
    setStartingStoryId(story.id);
    setError("");
    try {
      const result = await api(`/api/serials/${encodeURIComponent(story.id)}/runs`, { method: "POST", body: { slot: 1 } });
      navigate(`${serialsBase}/play/${result.run.id}`, { state: { returnTo: serialsBase } });
    } catch (exception) {
      setError(exception.message);
      setStartingStoryId("");
    }
  }

  async function restartStory(story) {
    const run = latestRun(story);
    if (!run || startingStoryId || restartingStoryId) return;
    setRestartingStoryId(story.id);
    setError("");
    try {
      const result = await api(`/api/serials/runs/${encodeURIComponent(run.id)}/restart`, { method: "POST", body: { revision: run.revision } });
      navigate(`${serialsBase}/play/${result.run.id}`, { state: { returnTo: serialsBase } });
    } catch (exception) {
      setError(exception.message);
      setRestartingStoryId("");
    }
  }

  const stories = data?.stories || [];
  const orderedStories = [
    ...stories.filter((story) => latestRun(story)?.status !== "completed"),
    ...stories.filter((story) => latestRun(story)?.status === "completed"),
  ];

  return <div className="serials-page serials-library">
    <header className="serials-page-heading"><div><h1>После <em>слов</em><span className="serials-title-dot">.</span></h1><p>Интерактивные истории о разговорах, в которых решения имеют последствия.</p></div></header>
    {!data && !error && <SerialLoading text="Открываем истории…" />}
    {error && <SerialError error={error} onRetry={load} />}
    {data && <>
      <section className="serials-library-section" aria-labelledby="serials-library-title">
        <header><h2 id="serials-library-title">Истории</h2><span>{stories.length}</span></header>
        <div className="lab-case-list serials-case-list">{orderedStories.map((story) => <StoryCard story={story} key={story.id} serialsBase={serialsBase} onStart={startStory} onRestart={restartStory} starting={startingStoryId === story.id} restarting={restartingStoryId === story.id} />)}</div>
      </section>
    </>}
  </div>;
}

function StoryCard({ story, serialsBase, onStart, onRestart, starting, restarting }) {
  const run = latestRun(story);
  const episodes = mainEpisodes(story);
  const isComplete = run?.status === "completed";
  const isActive = run && !isComplete;
  const action = isActive ? "Продолжить" : "Начать";
  const actionDescription = "Продолжить историю";
  return <article className={`lab-case-row serials-case-row${isComplete ? " is-complete" : ""}`}>
    <div className="lab-case-visual serials-case-visual" aria-hidden="true">
      <SerialArtwork story={story} />
    </div>
    <div className="lab-case-copy">
      <div className="lab-case-topline"><span>{categoryLabel(story)}</span></div>
      <h2>{story.title}</h2>
      <p>{story.description}</p>
      <div className="lab-case-meta"><span><ClockIcon size={15} aria-hidden="true" />{episodes.length} серии</span></div>
    </div>
    <div className="serials-case-actions">
      {isComplete ? <>
        <button className="lab-case-action serials-case-action serials-case-action--restart" type="button" disabled={restarting} onClick={() => onRestart(story)}>{restarting ? "Запускаем…" : "Пройти заново"}<ArrowClockwiseIcon size={18} aria-hidden="true" /></button>
      </> : isActive ? <Link className="lab-case-action serials-case-action is-continue" to={`${serialsBase}/play/${run.id}`} aria-label={`${actionDescription}: ${story.title}`}>{action}<ArrowRightIcon size={18} aria-hidden="true" /></Link> : <button className="lab-case-action serials-case-action" type="button" disabled={starting} onClick={() => onStart(story)}>{starting ? "Открываем…" : action}<ArrowRightIcon size={18} aria-hidden="true" /></button>}
    </div>
  </article>;
}
