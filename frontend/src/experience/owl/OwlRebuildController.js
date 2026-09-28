import { OwlV4Controller } from './OwlV4Controller.js';

const REQUIRED_CLIPS = ['FlightLoop', 'TEST_Perch'];

function calibrateFeet(THREE, model) {
  const bird = new THREE.Box3().setFromObject(model, true);
  const feet = new THREE.Box3();
  model.traverse(object => {
    if (object.isMesh && /^(OwlFoot_Pad|OwlToe_Skinned_|OwlClaw_)/.test(object.name)) {
      feet.expandByObject(object, true);
    }
  });
  if (feet.isEmpty()) throw new Error('Rebuilt owl has no foot geometry');
  const centre = feet.getCenter(new THREE.Vector3());
  return { floor: feet.min.y, x: centre.x, z: centre.z,
    footWidth: feet.max.x - feet.min.x,
    height: bird.max.y - feet.min.y, width: bird.max.x - bird.min.x };
}

// The rebuild has a finished flight cycle and a perch pose, but no authored
// takeoff/landing transitions. Keep the existing scroll path and crossfade
// directly between those two clips.
export class OwlRebuildController extends OwlV4Controller {
  attach(model, clips) {
    const missing = REQUIRED_CLIPS.filter(name => !clips.some(clip => clip.name === name));
    if (missing.length) throw new Error(`Rebuilt owl: missing clips: ${missing.join(', ')}`);
    this.model = model;
    this.mixer = new this.THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', this.onFinished);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.enabled = false;
      this.actions.set(clip.name, action);
    }
    this.root.add(model);
    this.playClip('TEST_Perch', 'perched', { immediate: true, loop: false });
    // The perch action has a moving foot curl. Sample the middle of the pose
    // before establishing the support plane and revealing the model.
    this.activeAction.time = this.activeAction.getClip().duration / 2;
    this.mixer.update(0);
    model.updateMatrixWorld(true);
    this.calibration = calibrateFeet(this.THREE, model);
    model.position.sub(new this.THREE.Vector3(this.calibration.x, this.calibration.floor, this.calibration.z));
    model.updateMatrixWorld(true);
    if (this.wantsAir()) this.playClip('FlightLoop', 'flying', { immediate: true, loop: true });
    this.mixer.update(0);
    this.snapToPose(this.wantsAir() ? this.flightPose : this.homePose);
    return this.calibration;
  }

  setReducedMotion(value) {
    if (this.reducedMotion === Boolean(value)) return;
    this.reducedMotion = Boolean(value); this.debug = false;
    if (!this.mixer) return;
    const air = this.wantsAir();
    this.playClip(this.reducedMotion || !air ? 'TEST_Perch' : 'FlightLoop',
      this.reducedMotion ? 'reducedMotion' : air ? 'flying' : 'perched', { immediate: true, loop: air && !this.reducedMotion });
    if (this.reducedMotion) this.activeAction.time = this.activeAction.getClip().duration - .001;
    this.mixer.update(0);
    if (this.reducedMotion) this.snapToPose(this.homePose);
  }

  gesture() { return false; }

  resumeJourney() {
    this.debug = false; this.paused = false;
    const air = this.wantsAir();
    this.playClip(air ? 'FlightLoop' : 'TEST_Perch', air ? 'flying' : 'perched', { immediate: true, loop: air });
    if (!air) this.activeAction.time = this.activeAction.getClip().duration - .001;
    this.mixer.update(0); this.model.updateMatrixWorld(true);
  }

  step(delta, now, reducedMotion = this.reducedMotion) {
    if (!this.mixer || this.disposed) return;
    this.setReducedMotion(reducedMotion);
    this.root.visible = !this.reducedMotion || !this.wantsAir();
    if (this.debug) this.root.rotation.y = this.debugYaw || 0;
    if (this.paused || this.reducedMotion) return;
    const dt = Math.min(Math.max(delta, 0), .05), animationDelta = dt * this.speed;
    const air = this.wantsAir();
    if (!this.debug) {
      if (air && this.state !== 'flying') this.playClip('FlightLoop', 'flying', { loop: true });
      if (!air && this.state !== 'perched' && this.state !== 'groundedAction')
        this.playClip('TEST_Perch', 'perched', { loop: false });
      const target = air ? this.flightPose : this.homePose;
      const rate = 1 - Math.exp(-dt * 3.2);
      const displacement = new this.THREE.Vector3(target.x, target.y, target.z || 0).sub(this.root.position);
      const acceleration = displacement.multiplyScalar(25).addScaledVector(this.velocity, -10);
      this.velocity.addScaledVector(acceleration, dt).clampLength(0, 4);
      this.root.position.addScaledVector(this.velocity, dt);
      this.root.scale.setScalar(this.root.scale.x + (target.scale - this.root.scale.x) * rate);
      const facing = Math.atan2(-this.root.position.x, 10);
      const yaw = air ? facing + Math.max(-1, Math.min(1, this.velocity.x * .34)) : (this.homePose.yaw || 0);
      this.root.rotation.y += (yaw - this.root.rotation.y) * (1 - Math.exp(-dt * 3));
      const bank = air ? Math.max(-.13, Math.min(.13, -this.velocity.x * .045)) : 0;
      this.root.rotation.z += (bank - this.root.rotation.z) * (1 - Math.exp(-dt * 4));
      if (!air && this.state === 'perched' && this.root.position.distanceTo(
        new this.THREE.Vector3(target.x, target.y, target.z || 0)) < .035) this.snapToPose(target);
    }
    if (this.blend) {
      this.blend.elapsed += animationDelta;
      const weight = Math.min(1, this.blend.elapsed / .25);
      this.blend.from.setEffectiveWeight(1 - weight);
      this.blend.to.setEffectiveWeight(weight);
    }
    this.mixer.update(animationDelta);
    if (this.blend?.elapsed >= .25) {
      this.blend.from.stop(); this.blend = null;
      const pending = this.pending; this.pending = null;
      if (pending) this.playClip(pending.name, pending.state, { loop: pending.loop });
    }
    if (!this.debug && this.finishedAction === this.activeAction) {
      this.finishedAction = null;
      if (this.state === 'groundedAction') this.playClip('TEST_Perch', 'perched', { loop: false });
    }
    this.model.updateMatrixWorld(true);
  }

  getDiagnostics() { return { ...super.getDiagnostics(), revision: 'rebuild-v10' }; }
}
