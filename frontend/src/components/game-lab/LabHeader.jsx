import ForestSectionHeader from "../ForestSectionHeader.jsx";

const links = [
  { to: "/lab", label: "Обзор", end: true },
  { to: "/serials", label: "После слов" },
  { to: "/lab/red-zone", label: "Красная зона" },
  { to: "/lab/echo", label: "Эхо" },
];

export default function LabHeader(props) {
  return <ForestSectionHeader image="history" {...props} links={links} navigationLabel="Разделы игровой лаборатории" />;
}
