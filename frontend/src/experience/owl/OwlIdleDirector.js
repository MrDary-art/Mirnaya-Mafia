const ACTIONS = [
  { name: "neutral", weight: 3, duration: 1.2, pose: {} },
  { name: "watchLeft", weight: 2, duration: 1.35, pose: { gazeX: -.68, tilt: -.018 } },
  { name: "watchRight", weight: 2, duration: 1.35, pose: { gazeX: .68, tilt: .018 } },
  { name: "headTilt", weight: 2, duration: 1.45, pose: { tilt: .055, nod: -.012 } },
  { name: "featherSettle", weight: 2, duration: 1.1, pose: { feathers: .055 } },
  { name: "bodyShift", weight: 1, duration: 1.5, pose: { shift: .014, tail: -.022 } },
  { name: "eyeScan", weight: 2, duration: 1.55, pose: { gazeX: .42, gazeY: .14 } },
  { name: "softWingAdjust", weight: 1, duration: 1.15, pose: { wings: .075, feathers: .025 } },
];

const ZERO = Object.freeze({ gazeX: 0, gazeY: 0, tilt: 0, nod: 0, feathers: 0, shift: 0, tail: 0, wings: 0 });

export class OwlIdleDirector {
  constructor(random = Math.random) {
    this.random = random;
    this.history = [];
    this.active = null;
    this.nextAt = 0;
  }

  reset(now = 0) {
    this.active = null;
    this.nextAt = now + 2400;
  }

  choose(state = "rest") {
    const available = ACTIONS.filter(({ name }) => !this.history.includes(name));
    const weightFor = ({ name, weight }) => {
      if (state === "analyze" && (name === "eyeScan" || name === "headTilt")) return weight * 2;
      if (state === "listen" && (name === "watchLeft" || name === "watchRight")) return weight * 2;
      if (state === "focus" && name === "softWingAdjust") return weight * .35;
      return weight;
    };
    const total = available.reduce((sum, action) => sum + weightFor(action), 0);
    let pick = Math.max(0, Math.min(.999999, this.random())) * total;
    const chosen = available.find((action) => (pick -= weightFor(action)) < 0) || available.at(-1);
    this.history.push(chosen.name);
    this.history = this.history.slice(-3);
    return chosen;
  }

  update(now, state = "rest", enabled = true) {
    if (!enabled) {
      this.reset(now);
      return ZERO;
    }
    if (this.active && now >= this.active.end) {
      this.active = null;
      this.nextAt = now + (2 + this.random() * 7) * 1000;
    }
    if (!this.active && now >= this.nextAt) {
      const action = this.choose(state);
      this.active = { ...action, start: now, end: now + action.duration * 1000 };
    }
    if (!this.active) return ZERO;
    const progress = Math.max(0, Math.min(1, (now - this.active.start) / (this.active.end - this.active.start)));
    const envelope = Math.sin(Math.PI * progress) ** 2;
    return Object.fromEntries(Object.keys(ZERO).map((key) => [key, (this.active.pose[key] || 0) * envelope]));
  }
}
