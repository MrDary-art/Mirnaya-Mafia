import ForestSectionHeader from "./ForestSectionHeader.jsx";
import "./practice-forest.css";

const links = [
  { to: "/app", label: "Обзор", end: true },
  { to: "/ai", label: "Практика с ИИ" },
  { to: "/rooms", label: "1 на 1" },
  { to: "/scenarios", label: "Сценарии" },
];

export default function PracticeHeader(props) {
  return <ForestSectionHeader {...props} links={links} navigationLabel="Разделы практики" tabTransitionKey="practice" />;
}
