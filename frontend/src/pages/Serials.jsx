import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { SerialArtwork, SerialError, SerialIcon, SerialLoading } from "../components/serials/SerialShared.jsx";
import { categoryLabel, latestRun, mainEpisodes } from "../components/serials/serialModel.js";
import "../components/serials/serials.css";

export default function Serials() {
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

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

  const stories = data?.stories || [];
  const continuing = stories.map((story) => ({ story, run: latestRun(story) }))
    .filter(({ run }) => run && run.status !== "completed")
    .sort((left, right) => String(right.run.updated_at || "").localeCompare(String(left.run.updated_at || "")))[0];
  const featured = continuing?.story || stories[0];

  return <div className="serials-page serials-library">
    <header className="serials-page-heading"><div><h1>После <em>слов</em><span className="serials-title-dot">.</span></h1><p>Интерактивные истории о разговорах, в которых решения имеют последствия.</p></div></header>
    {!data && !error && <SerialLoading text="Открываем истории…" />}
    {error && <SerialError error={error} onRetry={load} />}
    {data && <>
      {featured && <section className="serials-featured">
        <SerialArtwork story={featured} className="serials-featured-art" />
        <div className="serials-featured-shade" />
        <div className="serials-featured-copy">
          <span className="serials-featured-tag"><span />{continuing ? "ПРОДОЛЖИТЬ ИСТОРИЮ" : categoryLabel(featured).toUpperCase()}</span>
          <h2>{featured.subtitle || featured.title}</h2>
          <p>{featured.description}</p>
          <div className="serials-featured-meta"><span>{mainEpisodes(featured).length} серии</span></div>
          <Link to={continuing ? `/serials/play/${continuing.run.id}` : `/serials/${featured.id}`} className="serials-button serials-button--lime">{continuing ? "Продолжить" : "Открыть историю"}<SerialIcon name="arrow-right" /></Link>
        </div>
      </section>}

      <section className="serials-library-section" aria-labelledby="serials-library-title">
        <header><h2 id="serials-library-title">Истории</h2><span>{stories.length}</span></header>
        <div className="serials-catalog">{stories.map((story, index) => <StoryCard story={story} key={story.id} index={index} />)}</div>
      </section>
    </>}
  </div>;
}

function StoryCard({ story, index }) {
  const run = latestRun(story);
  const episodes = mainEpisodes(story);
  return <Link className="serials-story-card" to={`/serials/${story.id}`} style={{ "--serial-card-order": index }}>
    <div className="serials-card-image">
      <SerialArtwork story={story} />
      <span className="serials-card-category">{categoryLabel(story)}</span>
      {run && <span className="serials-card-progress">{run.status === "completed" ? "Пройдена" : "Продолжить"}</span>}
      <div className="serials-card-image-title">{story.subtitle || story.title}</div>
    </div>
    <div className="serials-card-copy">
      <div className="serials-card-meta"><span>{episodes.length} серии</span></div>
      <h2>{story.title}</h2>
      <p>{story.description}</p>
    </div>
  </Link>;
}
