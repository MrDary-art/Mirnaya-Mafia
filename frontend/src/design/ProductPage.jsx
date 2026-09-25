import { useEffect, useState } from "react";
import { pageForRoute } from "./pageRegistry.js";
import { motifForRoute } from "../experience/product-world/productWorldState.js";

const STORAGE_KEY = "arena_product_effects";
const options = [
  ["full", "Полные эффекты"], ["calm", "Спокойные эффекты"], ["off", "Без эффектов"],
];

export default function ProductPage({ pathname, children }) {
  const page = pageForRoute(pathname);
  const motif = motifForRoute(pathname);
  const [effects, setEffects] = useState(() => localStorage.getItem(STORAGE_KEY) || "full");
  useEffect(() => { localStorage.setItem(STORAGE_KEY, effects); }, [effects]);
  return <div className={`product-page product-page--${page.profile}`} data-product-page={page.id} data-effects={effects}>
    <div className="product-stage" aria-hidden="true">
      <span className="product-stage-index">ARENA / {page.label}</span>
      <span className="product-stage-rule" />
      {motif && <img className="product-static-motif product-static-motif--base" src={`/assets/product-world/${motif}.png`} alt="" />}
      {page.id === "room" && <img className="product-static-motif product-static-motif--team" src="/assets/product-world/M11.png" alt="" />}
      {page.id === "rooms" && <img className="product-static-motif product-static-motif--booking" src="/assets/product-world/M10.png" alt="" />}
    </div>
    <div className="product-page-body">{children}</div>
    <div className="product-effects-control">
      <label htmlFor="product-effects">Эффекты интерфейса</label>
      <select id="product-effects" value={effects} onChange={(event) => setEffects(event.target.value)}>
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  </div>;
}
