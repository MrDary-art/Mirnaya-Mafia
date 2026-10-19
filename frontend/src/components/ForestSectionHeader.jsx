import { NavLink } from "react-router-dom";
import "./forest-section-header.css";

export default function ForestSectionHeader({ title, titleId, line, description, image = "hero", links = [], navigationLabel, children }) {
  return <>
    <header className="forest-section-header" style={{ "--section-image": `url("/assets/forest2d/${image}.webp")` }}>
      <div className="forest-section-copy"><h1 id={titleId}>{title}</h1><p className="forest-section-line">{line}</p><p className="forest-section-description">{description}</p></div>
      {children}
    </header>
    {links.length > 0 && <nav className="forest-section-tabs" aria-label={navigationLabel}>
      {links.map(({ to, label, end }) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
    </nav>}
  </>;
}
