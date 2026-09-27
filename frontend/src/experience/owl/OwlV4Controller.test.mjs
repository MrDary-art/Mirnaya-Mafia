import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { OwlV4Controller } from './OwlV4Controller.js';
import { OWL_CLIPS, owlPlacement } from './owlV4.js';

function fixture(snapshot = { heroProgress: 0 }) {
  const root = new THREE.Group(), model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
  const bone = new THREE.Bone(); bone.name = 'Root'; model.add(bone);
  const head = new THREE.Bone(); head.name = 'Head'; bone.add(head);
  const clips = OWL_CLIPS.map(name => {
    const duration = name === 'Takeoff' ? 2.4 : name === 'Landing' ? 2.6 : 4;
    const air = ['FlyLoop', 'Glide'].includes(name);
    const first = air || name === 'Landing' ? 1.08 : 0;
    const last = air || name === 'Takeoff' ? 1.08 : 0;
    return new THREE.AnimationClip(name, duration, [new THREE.VectorKeyframeTrack('Root.position', [0, duration], [0,first,0,0,last,0]),
      new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, duration], [0,0,0,1,0,0,0,1])]);
  });
  const owl = new OwlV4Controller(THREE, root);
  owl.setHomeSnapshot(snapshot); owl.attach(model, clips);
  const tick = (seconds, reduced = false) => { for (let i = 0; i < Math.ceil(seconds / .02); i++) owl.update(.02, i * 20, reduced); };
  return { owl, root, model, clips, tick };
}

test('v4 validates all clips and samples Idle before first reveal', () => {
  const { owl } = fixture();
  assert.equal(owl.activeClip, 'Idle');
  assert.deepEqual(owl.getDiagnostics().actions.map(a => a.name), ['Idle']);
  assert.throws(() => new OwlV4Controller(THREE, new THREE.Group()).attach(new THREE.Group(), []), /missing clips/);
  owl.dispose();
});
test('starting below Hero samples flight without an off-screen takeoff', () => {
  const { owl, model } = fixture({ heroProgress: 1 });
  assert.equal(owl.activeClip, 'FlyLoop');
  assert.ok(model.getObjectByName('Root').position.y > 1);
  owl.dispose();
});
test('Takeoff completion uses mixer time, then loops continuously across sections', () => {
  const { owl, tick } = fixture();
  owl.setHomeSnapshot({ heroProgress: .8, velocity: 300 }); tick(1);
  assert.equal(owl.activeClip, 'Takeoff');
  tick(1.5); assert.equal(owl.activeClip, 'FlyLoop');
  const time = owl.activeAction.time;
  owl.setHomeSnapshot({ heroProgress: 1, activeSection: 'friends', velocity: 200 }); tick(.3);
  assert.ok(owl.activeAction.time > time);
  assert.equal(owl.getDiagnostics().actions.length, 1);
  owl.dispose();
});
test('only Hero permits landing; return finishes in Idle', () => {
  const { owl, tick } = fixture({ heroProgress: 1 });
  tick(6); assert.equal(owl.activeClip, 'Glide');
  owl.setHomeSnapshot({ heroProgress: 0, velocity: 0 }); tick(3.1);
  assert.equal(owl.activeClip, 'Idle');
  assert.equal(owl.state, 'perched');
  owl.dispose();
});
test('flight preempts a gesture; stale finished events cannot reset it', () => {
  const { owl, tick } = fixture();
  assert.equal(owl.gesture('WaveLeftFoot', 10000), true);
  const gesture = owl.activeAction;
  owl.setHomeSnapshot({ heroProgress: 1, velocity: 200 }); tick(.4);
  owl.onFinished({ action: gesture }); tick(.02);
  assert.equal(owl.activeClip, 'Takeoff');
  assert.equal(owl.gesture('Blink', 20000), false);
  assert.ok(owl.getDiagnostics().actions.length <= 2);
  owl.dispose();
});
test('departing during landing cancels it and latest request remains airborne', () => {
  const { owl, tick } = fixture({ heroProgress: 1 });
  owl.setHomeSnapshot({ heroProgress: 0 }); tick(.4);
  assert.equal(owl.activeClip, 'Landing');
  owl.setHomeSnapshot({ heroProgress: 1, velocity: 300 }); tick(.4);
  assert.equal(owl.activeClip, 'FlyLoop');
  tick(3); assert.equal(owl.activeClip, 'FlyLoop');
  owl.dispose();
});
test('pause and reduced motion freeze animation without changing navigation', () => {
  const { owl, tick } = fixture({ heroProgress: 1 });
  tick(.2); const time = owl.activeAction.time;
  owl.setPaused(true); tick(3); assert.equal(owl.activeAction.time, time);
  owl.setPaused(false); tick(.2); assert.ok(owl.activeAction.time > time);
  tick(.1, true); assert.equal(owl.activeClip, 'Idle'); assert.equal(owl.root.visible, false);
  owl.setHomeSnapshot({ heroProgress: 0 }); tick(.1, true); assert.equal(owl.root.visible, true);
  assert.equal(owl.activeAction.time, 0);
  owl.dispose(); assert.equal(owl.actions.size, 0);
});
test('head is authored by the clip, and route scaling is always uniform', () => {
  const { owl, root, model, tick } = fixture({ heroProgress: 1 });
  owl.setPlacement({ x: 0,y: 0,z: 0,scale: 1 }, { x: 2,y: 0,z: 0,scale: .5 }); tick(3);
  assert.equal(model.getObjectByName('Head').rotation.y, 0);
  assert.equal(root.scale.x, root.scale.y); assert.equal(root.scale.y, root.scale.z);
  assert.ok(root.position.x > 1.9); assert.equal(root.position.y, 0);
  owl.dispose();
});
test('responsive placements reserve space for the complete wingspan', () => {
  for (const width of [360,390,768,1024,1440,1920]) {
    const { flight } = owlPlacement(width, 900, { height: 1.88 }, { target: { x: 20, y: 0 } });
    const halfView = Math.tan(42 * Math.PI / 360) * 10 * width / 900;
    assert.ok(flight.x + flight.scale * 1.7 < halfView);
  }
});

test('small reverse scroll does not interrupt flight or retrigger takeoff', () => {
  const { owl, tick } = fixture();
  owl.setHomeSnapshot({ heroProgress: .14, velocity: 150 }); tick(3);
  owl.setHomeSnapshot({ heroProgress: .1, velocity: 100 }); tick(.5);
  assert.equal(owl.activeClip, 'FlyLoop');
  owl.setHomeSnapshot({ heroProgress: .04, velocity: 0 }); tick(4);
  assert.equal(owl.activeClip, 'Idle');
  owl.dispose();
});

test('flight stays inside the top and bottom edges even for distant targets', () => {
  for (const [width, height] of [[390,844], [844,390], [1280,720], [1920,1080]]) {
    const halfHeight = Math.tan(42 * Math.PI / 360) * 10;
    for (const y of [-30,30]) {
      const { flight } = owlPlacement(width, height, {height:1.88}, {target:{x:0,y}});
      assert.ok(flight.y + 3.2 * flight.scale < halfHeight);
      assert.ok(flight.y - .9 * flight.scale > -halfHeight);
    }
  }
});

test('inspecting every clip leaves exactly one scheduled action when returning to the page', () => {
  const { owl, tick } = fixture();
  for (const name of OWL_CLIPS) { owl.inspectClip(name); owl.seek(.2); }
  owl.resumeJourney(); tick(.1);
  assert.deepEqual(owl.getDiagnostics().actions.map(action => action.name), ['Idle']);
  owl.setHomeSnapshot({ heroProgress: 1, velocity: 300 }); tick(3);
  assert.deepEqual(owl.getDiagnostics().actions.map(action => action.name), ['FlyLoop']);
  owl.dispose();
});

test('slow frames preserve wingbeat timing and integrate a smooth route',()=>{
  const fast=fixture({heroProgress:1,velocity:200}), slow=fixture({heroProgress:1,velocity:200});
  for(const sample of [fast,slow]) sample.owl.setPlacement({x:0,y:0,z:0,scale:1},{x:2,y:.5,z:0,scale:.7});
  for(let i=0;i<120;i++) fast.owl.update(1/60,i*1000/60);
  for(let i=0;i<8;i++) slow.owl.update(.25,i*250);
  assert.ok(Math.abs(fast.owl.activeAction.time-slow.owl.activeAction.time)<1e-6);
  assert.ok(fast.root.position.distanceTo(slow.root.position)<1e-6);
  assert.ok(Math.abs(slow.root.rotation.z)<.14);
  fast.owl.dispose();slow.owl.dispose();
});
