import { Link } from "react-router-dom";

export default function BusinessBrand() {
  return <Link className="business-brand" to="/business" aria-label="Арена для бизнеса — главная">
    <img src="/assets/arena-owl-logo.png" width="38" height="38" alt="" />
    <span>Арена<small>для бизнеса</small></span>
  </Link>;
}
