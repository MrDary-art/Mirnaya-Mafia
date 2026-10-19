import { useEffect, useState } from "react";
import "./public-forest-journey.css";

const scenes = ["hero", "ai", "rooms", "scenarios", "learning", "friends", "profile"];

export default function PublicForestJourney() {
  const [activeScene, setActiveScene] = useState("hero");

  useEffect(() => {
    const sections = [...document.querySelectorAll("[data-public-forest-scene]")];
    if (!sections.length) return undefined;
    let frame = 0;
    const updateScene = () => {
      frame = 0;
      const midpoint = window.innerHeight / 2;
      const current = sections.reduce((closest, section) => {
        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - midpoint);
        return distance < closest.distance ? { id: section.dataset.publicForestScene, distance } : closest;
      }, { id: "hero", distance: Number.POSITIVE_INFINITY });
      setActiveScene(current.id || "hero");
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(updateScene); };
    const observer = new IntersectionObserver(schedule, { threshold: [0, .2, .5, .8, 1] });
    sections.forEach((section) => observer.observe(section));
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <div className="public-forest-journey" aria-hidden="true">
    {scenes.map((scene, index) => <picture key={scene} className={`public-forest-scene${activeScene === scene ? " is-active" : ""}`}>
      <source media="(max-width: 767px)" srcSet={`/assets/forest2d/${scene}-mobile.webp`} />
      <img src={`/assets/forest2d/${scene}.webp`} alt="" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} />
    </picture>)}
  </div>;
}
