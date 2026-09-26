import { OWL_CLIPS, OWL_SETTINGS } from './owlV4.js';
import { calibrateOwlFeet } from './owlPerch.js';

const LOOPS = new Set(['Idle', 'FlyLoop', 'Glide']);
const GESTURES = new Set(['Blink', 'LookAround', 'HeadTilt', 'Nod', 'WaveLeftFoot', 'WaveRightFoot', 'WingFlap', 'Hop', 'Celebrate']);

// Only the mixer writes bones and eyelids. The outer group owns the route;
// authored Root motion is preserved. Legacy procedural rig corrections are not used.
export class OwlV4Controller {
  constructor(THREE, root) {
    this.THREE = THREE; this.root = root; this.state = 'loading';
    this.actions = new Map(); this.homeSnapshot = null;
    this.homePose = { x: 0, y: 0, z: 0, scale: 1 }; this.flightPose = this.homePose;
    this.speed = 1; this.paused = false; this.reducedMotion = false; this.debug = false;
    this.lastGestureAt = -Infinity; this.stillFor = 0;
    this.velocity = new THREE.Vector3();
    this.onFinished = event => { if (event.action === this.activeAction) this.finishedAction = event.action; };
  }

  attach(model, clips) {
    const missing = OWL_CLIPS.filter(name => !clips.some(clip => clip.name === name));
    if (missing.length) throw new Error(`Owl v4: missing clips: ${missing.join(', ')}`);
    this.model = model;
    this.mixer = new this.THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', this.onFinished);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.enabled = false;
      this.actions.set(clip.name, action);
    }
    this.root.add(model);
    this.playClip('Idle', 'perched', { immediate: true }); this.mixer.update(0);
    model.updateMatrixWorld(true);
    // One calibration in Idle before reveal. Never re-centre moving wings.
    this.calibration = calibrateOwlFeet(this.THREE,model);
    model.position.sub(new this.THREE.Vector3(this.calibration.x,this.calibration.floor,this.calibration.z));
    model.updateMatrixWorld(true);
    if (this.wantsAir()) this.playClip('FlyLoop', 'flying', { immediate: true });
    this.mixer.update(0);
    this.snapToPose(this.wantsAir() ? this.flightPose : this.homePose);
    return this.calibration;
  }

  wantsAir() { return Boolean(this.homeSnapshot && this.homeSnapshot.heroProgress > .12); }
  setHomeSnapshot(snapshot) { this.homeSnapshot = snapshot; }
  setPlacement(home, flight) { this.homePose = home; this.flightPose = flight; }
  snapToPose(pose) {
    this.root.position.set(pose.x, pose.y, pose.z || 0);
    this.root.scale.setScalar(pose.scale); this.root.rotation.set(0, pose.yaw || 0, 0);
    this.velocity.set(0,0,0);
  }

  playClip(name, state, { immediate = false, loop = LOOPS.has(name) } = {}) {
    const next = this.actions.get(name);
    if (!next) return false;
    if (!immediate && this.activeClip === name) return true;
    // A single latest pending transition, never a queue of navigation gestures.
    if (this.blend && !immediate) { this.pending = { name, state, loop }; return true; }
    if (immediate) { this.mixer.stopAllAction(); this.blend = null; this.pending = null; }
    const previous = immediate ? null : this.activeAction;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(previous ? 0 : 1);
    next.setLoop(loop ? this.THREE.LoopRepeat : this.THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop; next.play();
    this.activeAction = next; this.activeClip = name; this.state = state; this.finishedAction = null;
    this.blend = previous ? { from: previous, to: next, elapsed: 0 } : null;
    return true;
  }

  gesture(name, now = performance.now()) {
    if (!GESTURES.has(name) || this.state !== 'perched' || this.wantsAir() || this.reducedMotion
      || this.paused || this.debug || now - this.lastGestureAt < 8000) return false;
    this.lastGestureAt = now;
    return this.playClip(name, 'groundedAction', { loop: false });
  }
  setPaused(value) { this.paused = Boolean(value); }
  setSpeed(value) { this.speed = value === .5 ? .5 : 1; }
  setReducedMotion(value) {
    if (this.reducedMotion === value) return;
    this.reducedMotion = value; this.debug = false;
    if (!this.mixer) return;
    this.playClip(value || !this.wantsAir() ? 'Idle' : 'FlyLoop', value ? 'reducedMotion' : this.wantsAir() ? 'flying' : 'perched', { immediate: true });
    this.mixer.update(0);
    if (value) this.snapToPose(this.homePose);
  }
  inspectClip(name) {
    if (!this.actions.has(name)) return false;
    this.debug = true; this.paused = false; this.debugYaw = 0;
    this.playClip(name, 'inspection', { immediate: true, loop: LOOPS.has(name) || name === 'LookAround' });
    this.snapToPose(['Takeoff', 'FlyLoop', 'Glide', 'Landing', 'WingFlap', 'Celebrate'].includes(name) ? this.flightPose : this.homePose);
    this.mixer.update(0); return true;
  }
  seek(time) {
    if (!this.debug || !this.activeAction) return;
    this.activeAction.paused = false; this.activeAction.enabled = true;
    this.activeAction.time = Math.max(0, Math.min(time, this.activeAction.getClip().duration));
    this.mixer.update(0); this.model.updateMatrixWorld(true);
  }
  resumeJourney() {
    this.debug = false; this.paused = false; this.stillFor = 0;
    this.playClip(this.wantsAir() ? 'FlyLoop' : 'Idle', this.wantsAir() ? 'flying' : 'perched', { immediate: true });
    this.mixer.update(0); this.model.updateMatrixWorld(true);
  }

  update(delta, now, reducedMotion = this.reducedMotion) {
    // Consume actual elapsed time in small integration steps. A slow frame must
    // not turn the wingbeat into slow motion, or make a landing teleport.
    let remaining = Math.min(Math.max(delta,0),.25);
    if (!remaining) { this.step(0,now,reducedMotion); return; }
    while (remaining > .000001) { const dt=Math.min(remaining,1/60); this.step(dt,now,reducedMotion); remaining-=dt; }
  }

  step(delta, now, reducedMotion = this.reducedMotion) {
    if (!this.mixer || this.disposed) return;
    this.setReducedMotion(reducedMotion);
    this.root.visible = !this.reducedMotion || !this.wantsAir();
    if (this.debug) this.root.rotation.y = this.debugYaw || 0;
    if (this.paused || this.reducedMotion) return;
    const dt = Math.min(Math.max(delta, 0), .05), animationDelta = dt * this.speed;
    const airborne = this.wantsAir();
    if (!this.debug) {
      if (airborne && ['perched', 'groundedAction'].includes(this.state)) this.playClip('Takeoff', 'takingOff');
      if (airborne && this.state === 'landing') this.playClip('FlyLoop', 'flying');
      const moving = (this.homeSnapshot?.velocity || 0) > 35 || this.homeSnapshot?.travelling;
      this.stillFor = moving ? 0 : this.stillFor + dt;
      if (airborne && this.state === 'flying' && this.stillFor > 5) this.playClip('Glide', 'gliding');
      if (moving && this.state === 'gliding') this.playClip('FlyLoop', 'flying');
      const liftingFromPerch = this.state === 'takingOff' && (this.model.getObjectByName('Root')?.position.y || 0) < .12;
      const target = airborne && !liftingFromPerch ? this.flightPose : this.homePose;
      const rate = 1 - Math.exp(-dt * OWL_SETTINGS.travelDamping);
      const displacement = new this.THREE.Vector3(target.x,target.y,target.z || 0).sub(this.root.position);
      // Critically damped acceleration: neither instantaneous sideways motion
      // nor overshooting the perch after a fast direction change.
      const acceleration = displacement.clone().multiplyScalar(25).addScaledVector(this.velocity,-10);
      this.velocity.addScaledVector(acceleration,dt).clampLength(0,OWL_SETTINGS.maxTravelSpeed);
      this.root.position.addScaledVector(this.velocity,dt);
      this.root.scale.setScalar(this.root.scale.x + (target.scale - this.root.scale.x) * rate);
      const inAir = ['takingOff','flying','gliding'].includes(this.state);
      const facing = Math.atan2(-this.root.position.x,OWL_SETTINGS.cameraZ);
      const yaw = inAir ? facing+Math.max(-1.0,Math.min(1.0,this.velocity.x*.34)) : (this.homePose.yaw || 0);
      this.root.rotation.y += (yaw - this.root.rotation.y) * (1 - Math.exp(-dt * 3));
      const bank = inAir ? Math.max(-.13,Math.min(.13,-this.velocity.x*.045)) : 0;
      this.root.rotation.z += (bank-this.root.rotation.z)*(1-Math.exp(-dt*4));
      const atPerch = this.root.position.distanceTo(new this.THREE.Vector3(this.homePose.x, this.homePose.y, this.homePose.z || 0)) < .035;
      if (!airborne && this.homeSnapshot?.heroProgress < .07 && atPerch && ['flying', 'gliding'].includes(this.state)) this.playClip('Landing', 'landing');
      if (this.state === 'perched') this.snapToPose(this.homePose);
    } else this.root.rotation.y = this.debugYaw || 0;
    if (this.blend) {
      this.blend.elapsed += animationDelta;
      const weight = Math.min(1, this.blend.elapsed / OWL_SETTINGS.crossfade);
      this.blend.from.setEffectiveWeight(1 - weight); this.blend.to.setEffectiveWeight(weight);
    }
    this.mixer.update(animationDelta);
    if (this.blend?.elapsed >= OWL_SETTINGS.crossfade) {
      this.blend.from.stop(); this.blend = null;
      const pending = this.pending; this.pending = null;
      if (pending) this.playClip(pending.name, pending.state, { loop: pending.loop });
    }
    if (!this.debug && this.finishedAction === this.activeAction) {
      this.finishedAction = null;
      if (this.state === 'takingOff') this.playClip('FlyLoop', 'flying');
      else if (this.state === 'landing' || this.state === 'groundedAction') this.playClip('Idle', 'perched');
    }
    this.model.updateMatrixWorld(true);
  }
  getDiagnostics() {
    return { revision: '4.1', state: this.paused ? 'paused' : this.state, clip: this.activeClip,
      time: this.activeAction?.time || 0, speed: this.speed, rootY: this.model?.getObjectByName('Root')?.position.y,
      position: this.root.position.toArray(), scale: this.root.scale.x,
      actions: [...this.actions].filter(([, action]) => action.isScheduled() && action.enabled && action.getEffectiveWeight() > 0)
        .map(([name, action]) => ({ name, time: action.time, weight: action.getEffectiveWeight() })),
      clips: [...this.actions].map(([name, action]) => ({ name, duration: action.getClip().duration })) };
  }
  dispose() {
    this.disposed = true; this.mixer?.removeEventListener('finished', this.onFinished);
    this.mixer?.stopAllAction(); if (this.model) this.mixer?.uncacheRoot(this.model);
    this.actions.clear(); this.pending = null; this.blend = null;
  }
}
