import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import "./mode-guide-entry.css";

export default function ModeGuideEntry({ to, eyebrow, title, description, action = "Как это работает", actionIcon = "arrow" }) {
  const ActionIcon = actionIcon === "plus" ? PlusIcon : ArrowUpRightIcon;

  return <Link className="mode-guide-entry" to={to}>
    <span className="mode-guide-entry-copy">{eyebrow && <small>{eyebrow}</small>}<b>{title}</b><span>{description}</span></span>
    <span className="mode-guide-entry-action">{action} <i className={actionIcon === "plus" ? "is-plus" : undefined}><ActionIcon size={20} weight="bold" aria-hidden="true" /></i></span>
  </Link>;
}
