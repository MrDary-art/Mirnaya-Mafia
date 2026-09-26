import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { backTargetForRoute, pageForRoute } from "./pageRegistry.js";

export default function ProductPage({ pathname, children }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const page = pageForRoute(pathname);
  const fallback = backTargetForRoute(pathname);
  const explicitReturn = typeof state?.returnTo === "string" && /^\/(?!\/)/.test(state.returnTo) ? state.returnTo : null;
  function goBack() {
    if (explicitReturn) navigate(explicitReturn);
    else if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback.to);
  }
  return <div className={`product-page product-page--${page.profile}`} data-product-page={page.id}>
    <div className="product-stage">
      <button className="product-page-back" type="button" onClick={goBack} aria-label={`Назад ${fallback.label}`}>
        <ArrowLeftIcon size={17} weight="bold" aria-hidden="true" /><span>Назад</span><small>{fallback.label}</small>
      </button>
      <span className="product-stage-index" aria-hidden="true">ARENA / {page.label}</span>
      <span className="product-stage-rule" aria-hidden="true" />
    </div>
    <div className="product-page-body">{children}</div>
  </div>;
}
