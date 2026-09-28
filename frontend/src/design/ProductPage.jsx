import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { backTargetForRoute, pageForRoute } from "./pageRegistry.js";

export default function ProductPage({ pathname, children }) {
  const navigate = useNavigate();
  const { state, search } = useLocation();
  const page = pageForRoute(pathname);
  const fallback = pathname === "/setup"
    ? { to: new URLSearchParams(search).get("mode") === "online" ? "/ai" : "/scenarios" }
    : backTargetForRoute(pathname);
  const hideBack = /^\/report\/[^/]+\/ideal-dialogue$/.test(pathname);
  const explicitReturn = typeof state?.returnTo === "string" && /^\/(?!\/)/.test(state.returnTo) ? state.returnTo : null;
  function goBack() {
    if (pathname === "/profile") navigate("/app");
    else if (explicitReturn) navigate(explicitReturn);
    else if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback.to);
  }
  return <div className={`product-page product-page--${page.profile}`} data-product-page={page.id}>
    <div className="product-stage">
      {!hideBack && <button className="product-page-back" type="button" onClick={goBack} aria-label="Назад">
        <ArrowLeftIcon size={17} weight="bold" aria-hidden="true" /><span>Назад</span>
      </button>}
      <span className="product-stage-index" aria-hidden="true">АРЕНА ПЕРЕГОВОРОВ / {page.label}</span>
      <span className="product-stage-rule" aria-hidden="true" />
    </div>
    <div className="product-page-body">{children}</div>
  </div>;
}
