import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { backTargetForRoute, pageForRoute } from "./pageRegistry.js";

export default function ProductPage({ pathname, children }) {
  const navigate = useNavigate();
  const { state, search } = useLocation();
  const page = pageForRoute(pathname);
  const fallback = backTargetForRoute(pathname, search);
  const hideBack = /^\/report\/[^/]+\/ideal-dialogue$/.test(pathname);
  const explicitReturn = typeof state?.returnTo === "string" && /^\/(?!\/)/.test(state.returnTo) ? state.returnTo : null;
  function goBack() {
    const current = `${pathname}${search}`;
    const hasReturn = explicitReturn && explicitReturn !== current;
    navigate(hasReturn ? explicitReturn : fallback.to, { replace: true, state: hasReturn ? state?.returnState ?? null : null });
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
