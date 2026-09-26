import { HOME_SECTIONS, clamp01, sectionIdFromHash, speedClass, smoothstep,
  travelDuration, worldPosition, worldTarget } from "./homeWorldModel.js";

export class HomeWorldScrollController {
  constructor({ root, onActive, onFrame }) {
    this.root = root;
    this.onActive = onActive;
    this.onFrame = onFrame;
    this.activeId = "hero";
    this.direction = 1;
    this.reverseSince = 0;
    this.lastScroll = window.scrollY;
    this.lastTime = performance.now();
    this.velocity = 0;
    this.travel = null;
    this.frame = 0;
    this.offsets = [];
    this.visibleSections = new Set(["hero"]);
    this.observer = null;
    this.resize = () => this.measure();
    this.interrupt = (event) => {
      if (event.type === "keydown" && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      this.cancelTravel();
    };
    this.navigateEvent = (event) => this.navigate(event.detail?.sectionId || "hero");
    this.hashEvent = () => this.navigate(sectionIdFromHash(window.location.hash), { updateHash: false });
    this.tick = (now) => {
      this.sample(now);
      this.frame = requestAnimationFrame(this.tick);
    };
  }

  start() {
    this.measure();
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.dataset.homeSection;
        if (entry.isIntersecting) this.visibleSections.add(id);
        else this.visibleSections.delete(id);
      }
    }, { rootMargin: "30% 0px 30% 0px", threshold: 0 });
    this.root.querySelectorAll("[data-home-section]").forEach((element) => this.observer.observe(element));
    window.addEventListener("resize", this.resize);
    window.addEventListener("wheel", this.interrupt, { passive: true });
    window.addEventListener("touchstart", this.interrupt, { passive: true });
    window.addEventListener("keydown", this.interrupt);
    window.addEventListener("arena:navigate-home", this.navigateEvent);
    window.addEventListener("hashchange", this.hashEvent);
    const initialId = sectionIdFromHash(window.location.hash);
    if (initialId !== "hero") {
      const target = this.offsets[HOME_SECTIONS.findIndex((section) => section.id === initialId)];
      window.scrollTo({ left: 0, top: target, behavior: "instant" });
    }
    this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.cancelTravel();
    this.observer?.disconnect();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("wheel", this.interrupt);
    window.removeEventListener("touchstart", this.interrupt);
    window.removeEventListener("keydown", this.interrupt);
    window.removeEventListener("arena:navigate-home", this.navigateEvent);
    window.removeEventListener("hashchange", this.hashEvent);
  }

  measure() {
    this.offsets = HOME_SECTIONS.map(({ id }) => {
      const element = this.root.querySelector(`[data-home-section="${id}"]`);
      return element ? element.getBoundingClientRect().top + window.scrollY : 0;
    });
  }

  cancelTravel() {
    this.travel = null;
  }

  navigate(id, { updateHash = true } = {}) {
    const index = HOME_SECTIONS.findIndex((section) => section.id === id);
    if (index < 0) return;
    this.measure();
    const target = this.offsets[index];
    const current = worldPosition(window.scrollY, this.offsets, window.innerHeight);
    const duration = travelDuration(Math.ceil(Math.abs(index - current)), window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (updateHash) {
      const base = `${window.location.pathname}${window.location.search}`;
      history.replaceState(history.state, "", id === "hero" ? base : `${base}#${id}`);
    }
    if (!duration) {
      window.scrollTo({ left: 0, top: target, behavior: "instant" });
      this.cancelTravel();
    } else {
      this.travel = { from: window.scrollY, target, started: performance.now(), duration };
    }
  }

  sample(now) {
    if (this.travel) {
      const t = clamp01((now - this.travel.started) / this.travel.duration);
      const eased = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      // This controller already eases the trajectory. CSS scroll-behavior:
      // smooth must not start a second animation for every sampled frame.
      window.scrollTo({ left: 0, top: this.travel.from + (this.travel.target - this.travel.from) * eased, behavior: "instant" });
      if (t >= 1) this.travel = null;
    }
    const scrollY = window.scrollY;
    const dt = Math.max(16, now - this.lastTime);
    const change = scrollY - this.lastScroll;
    const instant = Math.abs(change) / dt * 1000;
    this.velocity += (instant - this.velocity) * Math.min(1, dt / 110);
    if (Math.abs(change) > 1 && Math.sign(change) !== this.direction) {
      if (!this.reverseSince) this.reverseSince = now;
      if (now - this.reverseSince >= 105) {
        this.direction = Math.sign(change);
        this.reverseSince = 0;
      }
    } else if (Math.abs(change) > 1) this.reverseSince = 0;
    const position = worldPosition(scrollY, this.offsets, window.innerHeight);
    const index = Math.min(HOME_SECTIONS.length - 1, Math.floor(position + .54));
    const activeId = HOME_SECTIONS[index].id;
    if (activeId !== this.activeId) {
      this.activeId = activeId;
      this.onActive(activeId);
    }
    const speed = speedClass(this.velocity, Math.abs(change) > window.innerHeight * 1.2);
    const target = worldTarget(position, window.innerWidth, this.direction);
    const snapshot = {
      scrollY, velocity: this.velocity, speed, direction: this.direction, position, width: window.innerWidth,
      activeSection: activeId, nextSection: HOME_SECTIONS[Math.min(index + 1, HOME_SECTIONS.length - 1)].id,
      previousSection: HOME_SECTIONS[Math.max(0, index - 1)].id,
      loadedScenes: [...this.visibleSections],
      sceneProgress: position - Math.floor(position), cameraProgress: smoothstep(position / (HOME_SECTIONS.length - 1)),
      heroProgress: clamp01(scrollY / Math.max(1, this.offsets[1] - this.offsets[0])),
      target, travelling: !!this.travel, returningHome: this.travel?.target === 0,
    };
    this.onFrame(snapshot);
    this.lastScroll = scrollY;
    this.lastTime = now;
  }
}
