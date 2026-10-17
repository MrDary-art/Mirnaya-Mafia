import { Link } from "react-router-dom";

export default function BusinessBrand({ to = "/business" }) {
  return <Link className="business-brand" to={to} aria-label="Арена для бизнеса — главная">
    <img src="/assets/arena-owl-logo.png" width="38" height="38" alt="" />
    <span>Арена<small>для бизнеса</small></span>
  </Link>;
}
