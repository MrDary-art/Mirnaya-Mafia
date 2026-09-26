import { pageForRoute } from "./pageRegistry.js";

export default function ProductPage({ pathname, children }) {
  const page = pageForRoute(pathname);
  return <div className={`product-page product-page--${page.profile}`} data-product-page={page.id}>
    <div className="product-stage" aria-hidden="true">
      <span className="product-stage-index">ARENA / {page.label}</span>
      <span className="product-stage-rule" />
    </div>
    <div className="product-page-body">{children}</div>
  </div>;
}
