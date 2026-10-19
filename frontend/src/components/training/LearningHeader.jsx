import ForestSectionHeader from "../ForestSectionHeader.jsx";
import "./learning-forest.css";

const links = [{ to: "/training", label: "Обзор", end: true }, { to: "/theory", label: "Теория" }, { to: "/training/path", label: "Программа" }];

export default function LearningHeader({ title, line, description }) {
  return <ForestSectionHeader title={title} line={line} description={description} image="learning" links={links} navigationLabel="Разделы обучения" />;
}
