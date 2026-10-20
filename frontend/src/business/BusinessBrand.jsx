import { Link } from "react-router-dom";

export default function BusinessBrand({ to = "/business/workspaces" }) {
  return <Link className="business-brand" to={to} aria-label="Арена бизнеса — главная">
    <img src="/assets/arena-owl-logo.png?v=owl-suit" width="38" height="38" alt="" />
    <span>Арена<small>бизнеса</small></span>
  </Link>;
}
