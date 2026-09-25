import { pageForRoute } from "./pageRegistry.js";
import { sceneForRoute } from "../environment2d/sceneDefinitions.js";

export default function ProductPage({ pathname, children }) {
  const page = pageForRoute(pathname);
  const scene = sceneForRoute(pathname);
  return <div className={`product-page product-page--${page.profile}`} data-product-page={page.id}>
    <div className="product-stage" aria-hidden="true">
      <span className="product-stage-index">ARENA / {page.label}</span>
      <span className="product-stage-rule" />
      <picture className="product-stage-art">
        <source media="(max-width: 767px)" srcSet={scene.mobilePoster} />
        <img src={scene.poster} alt="" loading="lazy" decoding="async" />
      </picture>
    </div>
    <div className="product-page-body">{children}</div>
  </div>;
}
