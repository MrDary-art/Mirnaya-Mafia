import { useEffect, useState } from "react";

const sceneBySection = {
  overview: { id: "arrival", desktop: "/assets/forest2d/hero.webp", mobile: "/assets/forest2d/hero-mobile.webp" },
  episodes: { id: "scenarios", desktop: "/assets/forest2d/scenarios.webp", mobile: "/assets/forest2d/scenarios-mobile.webp" },
  learning: { id: "learning", desktop: "/assets/forest2d/learning.webp", mobile: "/assets/forest2d/learning-mobile.webp" },
  meetings: { id: "rooms", desktop: "/assets/forest2d/rooms.webp", mobile: "/assets/forest2d/rooms-mobile.webp" },
  team: { id: "team", desktop: "/assets/forest2d/friends.webp", mobile: "/assets/forest2d/friends-mobile.webp" },
  community: { id: "community", desktop: "/assets/forest2d/friends.webp", mobile: "/assets/forest2d/friends-mobile.webp" },
  analytics: { id: "history", desktop: "/assets/forest2d/history.webp", mobile: "/assets/forest2d/history-mobile.webp" },
  calendar: { id: "calendar", desktop: "/assets/forest2d/rooms.webp", mobile: "/assets/forest2d/rooms-mobile.webp" },
  profile: { id: "profile", desktop: "/assets/forest2d/profile.webp", mobile: "/assets/forest2d/profile-mobile.webp" },
  settings: { id: "profile", desktop: "/assets/forest2d/profile.webp", mobile: "/assets/forest2d/profile-mobile.webp" },
  onboarding: { id: "arrival", desktop: "/assets/forest2d/hero.webp", mobile: "/assets/forest2d/hero-mobile.webp" },
};

export function businessSceneForSection(section) {
  return sceneBySection[section] || sceneBySection.overview;
}

function SceneImage({ scene, previous = false }) {
  return <picture className={`business-forest-scene${previous ? " is-previous" : ""}`} data-scene={scene.id}>
    <source media="(max-width: 767px)" srcSet={scene.mobile} />
    <img src={scene.desktop} alt="" decoding="async" fetchPriority={previous ? "low" : "high"} />
  </picture>;
}

// This is deliberately only scenery: work surfaces remain opaque enough to read,
// while a route change still has a visible connection to the personal Arena world.
export default function BusinessForestBackdrop({ section = "overview" }) {
  const next = businessSceneForSection(section);
  const [current, setCurrent] = useState(next);
  const [previous, setPrevious] = useState(null);

  useEffect(() => {
    if (current.id === next.id) return undefined;
    setPrevious(current);
    setCurrent(next);
    const timeout = window.setTimeout(() => setPrevious(null), 280);
    return () => window.clearTimeout(timeout);
  }, [current, next]);

  return <div className="business-forest-stage" aria-hidden="true">
    {previous && <SceneImage scene={previous} previous />}
    <SceneImage scene={current} />
  </div>;
}
