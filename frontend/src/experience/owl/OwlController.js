import { flightMotion } from "./flightMotion.js";
import { OwlIdleDirector } from "./OwlIdleDirector.js";

const PRIORITY = { idle: 0, pointer: 1, focused: 2, task: 3, system: 4, route: 5 };
const VALID_STATES = new Set([
  "rest", "watch", "focus", "guide", "listen", "analyze", "reveal", "takeoff",
  "flight", "glide", "land", "success", "warning", "error", "hidden",
]);
const TRANSITION_MS = 1600;

export class OwlController {
  constructor(THREE, root) {
    this.THREE = THREE;
    this.root = root;
    this.route = null;
    this.pointer = { x: 0, y: 0 };
    this.focusTarget = null;
    this.forcedTarget = null;
    this.intents = new Map();
    this.state = "rest";
    this.opacity = 0;
    this.transitionStarted = 0;
    this.transitionFrom = null;
    this.fromTransform = null;
    this.nextBlink = 3.2 + Math.random() * 4.6;
    this.blinkStarted = -Infinity;
    this.blinkDuration = .15;
    this.doubleBlinkAt = -Infinity;
    this.headLookX = 0;
    this.headLookZ = 0;
    this.eyeLookY = 0;
    this.lastPointerAt = -Infinity;
    this.idle = new OwlIdleDirector();
    this.proceduralOffsets = new Map();
  }

  attach(model, animations) {
    this.model = model;
    const rigNodes = new Map();
    model.traverse((object) => rigNodes.set(object.name.replace(/[^a-z0-9]/gi, "").toLowerCase(), object));
    const rigNode = (name) => rigNodes.get(name.replace(/[^a-z0-9]/gi, "").toLowerCase());
    const bounds = new this.THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new this.THREE.Vector3());
    model.position.sub(center);
    this.head = rigNode("Head");
    this.leftEye = rigNode("Eye.L");
    this.rightEye = rigNode("Eye.R");
    this.lids = ["LidUpper.L", "LidUpper.R", "LidLower.L", "LidLower.R"]
      .map(rigNode);
    this.neck = ["Neck01", "Neck02", "Neck03"].map(rigNode);
    this.chest = rigNode("Chest");
    this.clavicles = ["Clavicle.L", "Clavicle.R"].map(rigNode);
    this.tail = ["TailBase", "TailCenter", "Tail.L", "Tail.R"].map(rigNode);
    this.legs = ["Hip.L", "Hip.R", "Knee.L", "Knee.R", "Ankle.L", "Ankle.R", "Toe.L", "Toe.R"]
      .map(rigNode);
    this.wings = [
      { sign: 1, upper: rigNode("Wing.L.Upper"), tip: rigNode("Wing.L.Tip") },
      { sign: -1, upper: rigNode("Wing.R.Upper"), tip: rigNode("Wing.R.Tip") },
    ];
    this.feathers = this.wings.flatMap(({ sign }) => Array.from({ length: 4 }, (_, index) => ({
      sign, index, bone: rigNode(`Feather.${sign === 1 ? "L" : "R"}.${String(index + 1).padStart(2, "0")}`),
    })));
    this.baseRotation = new Map(
      [this.head, this.leftEye, this.rightEye, this.chest,
        ...this.neck, ...this.clavicles, ...this.tail, ...this.legs,
        ...this.wings.flatMap(({ upper, tip }) => [upper, tip]),
        ...this.feathers.map(({ bone }) => bone)]
        .filter(Boolean).map((bone) => [bone, bone.rotation.clone()]),
    );
    this.mixer = animations.length ? new this.THREE.AnimationMixer(model) : null;
    this.actions = new Map(animations.map((clip) => [clip.name.toLowerCase(), this.mixer.clipAction(clip)]));
    this.playClip("idle");
    this.mixer?.update(0);
    if (this.activeAction) this.activeAction.paused = true;
    this.freezeIdleAfterSample = false;
    this.root.add(model);
    if (this.route) {
      this.root.position.set(this.route.x, this.route.y, 0);
      this.root.scale.setScalar(this.route.scale);
    }
    this.fromTransform = {
      x: this.root.position.x, y: this.root.position.y,
      scale: this.root.scale.x, opacity: 0,
    };
    this.transitionFrom = { presence: 0 };
    this.transitionStarted = performance.now();
    return center;
  }

  setRoute(route, now = performance.now()) {
    if (this.route) {
      this.transitionFrom = { ...this.route };
      this.fromTransform = {
        x: this.root.position.x, y: this.root.position.y,
        scale: this.root.scale.x, opacity: this.opacity,
      };
      this.transitionStarted = now;
    }
    this.route = route;
  }

  playClip(name) {
    const next = this.actions?.get(name);
    if (!next || this.activeClip === name) return;
    next.reset();
    next.setLoop(name === "idle" || name === "glide" ? this.THREE.LoopRepeat : this.THREE.LoopOnce, Infinity);
    next.clampWhenFinished = name !== "idle" && name !== "glide";
    next.setEffectiveTimeScale(name === "takeoff" || name === "land" ? 2.2 : 1);
    next.play();
    if (name === "idle") {
      // The folded pose is a held foundation. Ambient life comes from the
      // procedural idle director; never cycle the sculpt's spread-wing bind pose.
      next.time = Math.min(.08, next.getClip().duration * .5);
      this.freezeIdleAfterSample = true;
    }
    if (this.activeAction) next.crossFadeFrom(this.activeAction, .16, false);
    this.activeAction = next;
    this.activeClip = name;
  }

  request(owner, state, priority = "task") {
    if (!VALID_STATES.has(state)) return;
    this.intents.set(owner, { state, priority: PRIORITY[priority] ?? PRIORITY.task });
  }

  release(owner) { this.intents.delete(owner); }
  setPointer(x, y, now = performance.now()) { this.pointer = { x, y }; this.lastPointerAt = now; }
  setFocusTarget(target) { this.focusTarget = target; }
  setForcedTarget(target) { this.forcedTarget = target; }

  update(delta, now, reducedMotion) {
    if (!this.route || !this.model) return;
    const routeProgress = Math.max(0, Math.min(1, (now - this.transitionStarted) / TRANSITION_MS));
    const transitioning = !!this.transitionFrom && routeProgress < 1;
    const travelling = transitioning && this.transitionFrom.presence > 0;
    const motion = flightMotion(routeProgress, this.route.x - (this.transitionFrom?.x ?? this.route.x));
    this.flightPhase = travelling && !reducedMotion ? motion.phase : "perched";
    const requested = [...this.intents.values()].sort((a, b) => b.priority - a.priority)[0];
    this.state = travelling && !reducedMotion ? "flight" : requested?.state || this.route.state;
    const idlePose = this.idle.update(now, this.state,
      !reducedMotion && !transitioning && this.route.presence > .3 && this.state !== "hidden");
    // Restore the sampled clip pose before any mixer action is switched.
    // A bind-pose reset here would expose the STL's spread wings whenever
    // PropertyMixer optimizes away an unchanged animation sample.
    for (const [bone, offset] of this.proceduralOffsets) bone.rotation.z -= offset;
    this.proceduralOffsets.clear();
    if (reducedMotion && this.activeClip !== "idle") {
      this.mixer?.stopAllAction();
      this.activeClip = null;
      this.activeAction = null;
      this.playClip("idle");
    }
    if (reducedMotion && this.activeAction) {
      this.activeAction.time = Math.min(.08, this.activeAction.getClip().duration * .5);
      this.activeAction.paused = true;
      this.freezeIdleAfterSample = false;
      this.mixer?.update(0);
    } else if (!reducedMotion) {
      this.playClip(travelling
        ? motion.phase === "focus" || motion.phase === "prepare" ? "idle"
          : motion.phase === "takeoff" ? "takeoff"
            : motion.phase === "brake" || motion.phase === "landing" ? "land" : "glide"
        : "idle");
    }
    const progress = reducedMotion || !transitioning ? 1 : routeProgress;
    const eased = progress * progress * (3 - 2 * progress);
    const pathProgress = travelling && !reducedMotion ? motion.travel : eased;
    const from = this.fromTransform || this.route;
    const lerp = (a, b, amount = eased) => a + (b - a) * amount;
    const flightArc = travelling && !reducedMotion && this.route.presence > 0 ? motion.lift : 0;
    const idle = reducedMotion || transitioning ? 0 : Math.sin(now * 0.00072) * 0.012;
    this.root.position.set(lerp(from.x, this.route.x, pathProgress) + idlePose.shift,
      lerp(from.y, this.route.y, pathProgress) + flightArc + idle, 0);
    const scale = lerp(from.scale, this.route.scale, pathProgress);
    this.root.scale.setScalar(scale);
    this.opacity = lerp(from.opacity ?? this.opacity, this.route.presence);
    this.root.visible = this.opacity > 0.015;
    const damping = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.25) * 7);
    // Pointer tracking must not yaw the whole owl: it made the face appear to spin.
    this.root.rotation.y = 0;
    const bank = travelling && !reducedMotion ? motion.bank : 0;
    this.root.rotation.z += (bank - this.root.rotation.z) * damping;
    if (!transitioning) this.transitionFrom = null;

    if (!reducedMotion) {
      this.mixer?.update(Math.min(delta, 0.05));
      if (this.activeClip === "idle" && this.freezeIdleAfterSample) {
        this.activeAction.paused = true;
        this.freezeIdleAfterSample = false;
      }
    }
    const gaze = this.forcedTarget || this.focusTarget
      || (now - this.lastPointerAt < 6000 ? this.pointer : { x: idlePose.gazeX, y: idlePose.gazeY });
    const gazeX = Math.max(-1, Math.min(1, gaze?.x || 0));
    const gazeY = Math.max(-1, Math.min(1, gaze?.y || 0));
    const eyeTurn = reducedMotion || transitioning ? 0 : gazeX * 0.11;
    const headNod = reducedMotion || transitioning ? 0 : gazeY * 0.018 + idlePose.nod;
    const headTilt = reducedMotion || transitioning ? 0 : gazeX * 0.035 + idlePose.tilt;
    if (reducedMotion) {
      this.eyeLookY = 0;
      this.headLookX = 0;
      this.headLookZ = 0;
    } else {
      this.eyeLookY += (eyeTurn - this.eyeLookY) * (1 - Math.exp(-Math.min(delta, .25) * 13));
      this.headLookX += (headNod - this.headLookX) * damping * 0.65;
      this.headLookZ += (headTilt - this.headLookZ) * damping * 0.65;
    }
    if (this.leftEye) this.leftEye.rotation.y = this.baseRotation.get(this.leftEye).y + this.eyeLookY;
    if (this.rightEye) this.rightEye.rotation.y = this.baseRotation.get(this.rightEye).y + this.eyeLookY;
    for (const [index, bone] of this.neck.entries()) {
      if (!bone) continue;
      const rest = this.baseRotation.get(bone);
      const share = [0.10, 0.13, 0.17][index];
      bone.rotation.set(rest.x + this.headLookX * share, rest.y, rest.z + this.headLookZ * share);
    }
    if (this.head) {
      const rest = this.baseRotation.get(this.head);
      // The exported clips keep Head neutral. Always compose gaze from the bind pose:
      // a clip without a Head track would otherwise add this offset every frame.
      this.head.rotation.set(rest.x + this.headLookX * .60, rest.y, rest.z + this.headLookZ * .60);
    }

    if (this.chest) {
      const breath = reducedMotion || travelling ? 0
        : Math.sin(now * .0017) * .65 + Math.sin(now * .00067 + .8) * .35;
      this.chest.scale.set(1 + breath * .002, 1 + breath * .006, 1 + breath * .002);
    }
    for (const [index, bone] of this.tail.entries()) {
      if (!bone) continue;
      const rest = this.baseRotation.get(bone);
      bone.rotation.set(rest.x + (travelling ? motion.flap * .045 : 0), rest.y,
        rest.z - (travelling ? motion.bank * (.22 + index * .05) : 0) + idlePose.tail);
    }
    for (const [index, bone] of this.legs.entries()) {
      if (!bone) continue;
      const rest = this.baseRotation.get(bone);
      const extension = travelling && routeProgress > .25 && routeProgress < .94
        ? Math.sin(Math.PI * motion.travel) * .065 : 0;
      bone.rotation.x = rest.x + (index < 2 ? -extension : index < 4 ? extension * .5 : 0);
    }

    // Explicit shoulder-driven strokes remain visible even while the GLB clips blend.
    const envelope = travelling && !reducedMotion ? motion.powered : 0;
    const flap = travelling && !reducedMotion ? motion.flap : idlePose.wings;
    for (const { sign, upper, tip } of this.wings) {
      if (upper) {
        const offset = sign * flap;
        upper.rotation.z += offset;
        this.proceduralOffsets.set(upper, offset);
      }
      if (tip) {
        const offset = sign * flap * .42;
        tip.rotation.z += offset;
        this.proceduralOffsets.set(tip, offset);
      }
    }
    for (const { sign, index, bone } of this.feathers) {
      if (bone) {
        const lag = Math.sin(motion.beatPhase - .35 - index * .12) * envelope * .075
          + idlePose.feathers * (1 - index * .12);
        const offset = sign * lag;
        bone.rotation.z += offset;
        this.proceduralOffsets.set(bone, offset);
      }
    }

    if (!reducedMotion) {
      const seconds = now / 1000;
      if (seconds > this.nextBlink) {
        this.blinkStarted = seconds;
        this.doubleBlinkAt = Math.random() < .15 ? seconds + .23 : -Infinity;
        this.nextBlink = seconds + (this.state === "analyze" ? 5.5 : 3.2) + Math.random() * 4.6;
      }
      const closureFor = (start, duration) => {
        const progress = (seconds - start) / duration;
        return progress >= 0 && progress <= 1 ? Math.sin(Math.PI * progress) ** 2 : 0;
      };
      const closure = Math.max(closureFor(this.blinkStarted, this.blinkDuration),
        closureFor(this.doubleBlinkAt, .14));
      for (const lid of this.lids) if (lid?.morphTargetInfluences) lid.morphTargetInfluences[0] = closure;
    } else {
      for (const lid of this.lids) if (lid?.morphTargetInfluences) lid.morphTargetInfluences[0] = 0;
    }
    this.model.traverse((object) => {
      if (object.isMesh && object.material) object.material.opacity = this.opacity;
    });
  }

  dispose() { this.mixer?.stopAllAction(); this.intents.clear(); }
}
