import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import "./mode-guide-entry.css";

export default function ModeGuideEntry({ to, eyebrow, title, description }) {
  return <Link className="mode-guide-entry" to={to}>
    <span className="mode-guide-entry-copy"><small>{eyebrow}</small><b>{title}</b><span>{description}</span></span>
    <span className="mode-guide-entry-action">Как это работает <i><ArrowUpRightIcon size={20} weight="bold" aria-hidden="true" /></i></span>
  </Link>;
}
