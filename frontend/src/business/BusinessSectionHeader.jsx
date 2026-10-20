import ForestSectionHeader from "../components/ForestSectionHeader.jsx";
import { businessSceneForSection } from "./BusinessForestBackdrop.jsx";
import "./business-sections-forest.css";

const sectionLines = {
  episodes: "От разговора — к решению.",
  learning: "Практика, которая работает.",
  meetings: "Обсуждайте. Решайте. Действуйте.",
  council: "Один разговор — общее решение.",
  team: "Сильная команда начинается с диалога.",
  community: "Разговор продолжается.",
  analytics: "Прогресс, который видно.",
  calendar: "Важное — в вашем ритме.",
  profile: "Ваш опыт. Ваш следующий шаг.",
  settings: "Ваше пространство. Ваши правила.",
};

export function hasBusinessForestHeader(section) {
  return Object.hasOwn(sectionLines, section);
}

export default function BusinessSectionHeader({ section, title, description, children }) {
  const image = businessSceneForSection(section).desktop.split("/").at(-1).replace(".webp", "");
  return <div className="business-section-intro">
    <ForestSectionHeader title={title} line={sectionLines[section]} description={description} image={image} />
    {children}
  </div>;
}
