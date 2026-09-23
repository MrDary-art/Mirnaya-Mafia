import { useEffect, type RefObject } from "react";

const targets = ".hero-copy > *, .section-heading, .how-card, .lower-copy > *, .lower-art, .page-top, .mission-hero, .cycle-card, .scenario-card, .detail-panel, .dialogue-card, .choices, .side-panel, .finding, .report-card, .exercise, .auth-intro, .auth-card";

export function useSectionReveal(root: RefObject<HTMLDivElement | null>, disabled: boolean) {
  useEffect(() => {
    if (disabled || !root.current || !("IntersectionObserver" in window)) return;
    const container = root.current;
    const seen = new WeakSet<Element>();
    const pending = new Set<HTMLElement>();
    const animations = new Set<Animation>();
    const show = (element: HTMLElement, animate: boolean) => {
      element.classList.remove("reveal-wait");
      pending.delete(element);
      observer.unobserve(element);
      if (animate && typeof element.animate === "function") {
        const animation = element.animate([{ opacity: 0, transform: "translateY(22px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 700, easing: "cubic-bezier(.2,.7,.2,1)" });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    };
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) show(entry.target as HTMLElement, true);
    }), { threshold: 0, rootMargin: "0px 0px -24px 0px" });
    const discover = () => {
      for (const element of pending) if (!element.isConnected) { observer.unobserve(element); pending.delete(element); }
      container.querySelectorAll<HTMLElement>(targets).forEach(element => {
        if (seen.has(element)) return;
        seen.add(element);
        element.classList.add("reveal-wait");
        pending.add(element);
        observer.observe(element);
      });
    };
    discover();
    const changes = new MutationObserver(discover);
    changes.observe(container, { childList: true, subtree: true });
    const focus = (event: FocusEvent) => {
      for (const element of pending) if (element.contains(event.target as Node)) show(element, false);
    };
    container.addEventListener("focusin", focus);
    return () => {
      changes.disconnect(); observer.disconnect();
      container.removeEventListener("focusin", focus);
      pending.forEach(element => element.classList.remove("reveal-wait"));
      animations.forEach(animation => animation.cancel());
    };
  }, [root, disabled]);
}
