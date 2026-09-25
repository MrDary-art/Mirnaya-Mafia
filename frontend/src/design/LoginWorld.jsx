import { useEffect, useRef } from "react";

// Login has no owl canvas. Its quiet forest poster is from the same river sequence.
export default function LoginWorld({ motionMode = "full" }) {
  const worldRef = useRef(null);
  useEffect(() => {
    const onVisibility = () => worldRef.current?.toggleAttribute("data-forest-paused", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return <div ref={worldRef} className="auth-product-world forest-login-world" data-forest-motion={motionMode} aria-hidden="true">
    <picture>
      <source media="(max-width: 767px)" srcSet="/assets/forest2d/hero-mobile.webp" />
      <img src="/assets/forest2d/hero.webp" alt="" decoding="async" fetchPriority="high" />
    </picture>
    <span className="forest-login-vignette" />
    <img className="forest-login-branch" src="/assets/forest2d/branch.webp" alt="" decoding="async" />
    <span className="forest-login-mist" />
  </div>;
}
