import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadGeometryGlb, readGlb } from '../../../scripts/lib/owl-glb.mjs';
import { OWL_ASSET, OWL_SHA256, OWL_SOURCE_SHA256 } from './owlV4.js';
import { calibrateOwlFeet, prepareOwlPerch } from './owlPerch.js';

const original = await readGlb(new URL('../../../public/assets/owl/owl-v4.glb',import.meta.url));
const repaired = await loadGeometryGlb(new URL(`../../../public/assets/owl/${OWL_ASSET}`,import.meta.url));
const { scene, animations } = repaired;
const mixer = new THREE.AnimationMixer(scene);
const sample = (name,time) => { mixer.stopAllAction(); const action=mixer.clipAction(animations.find(c=>c.name===name)).reset().setEffectiveWeight(1).play(); action.time=time; mixer.update(0); scene.updateMatrixWorld(true); return action; };
const point = (mesh,index) => mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);

// Pairs of physically adjacent vertices at the torso/collar and collar/head
// boundaries, not just the distance between abstract bone pivots.
const neck = scene.getObjectByName('LayeredNeckPlumage');
const buckets=new Map(), cell=.04;
const key = (x,y,z) => `${x},${y},${z}`;
const positions=neck.geometry.attributes.position;
for(let i=0;i<positions.count;i++) {
  const p=new THREE.Vector3().fromBufferAttribute(positions,i);
  const k=key(Math.floor(p.x/cell),Math.floor(p.y/cell),Math.floor(p.z/cell));
  if(!buckets.has(k)) buckets.set(k,[]); buckets.get(k).push([i,p]);
}
const seams=[];
for(const name of ['TorsoFeatherCoat','ForwardFacingHead']) {
  const mesh=scene.getObjectByName(name), pos=mesh.geometry.attributes.position, pairs=[];
  for(let i=0;i<pos.count;i+=17) {
    const p=new THREE.Vector3().fromBufferAttribute(pos,i); if(p.y<1.08 || p.y>1.46) continue;
    const x=Math.floor(p.x/cell),y=Math.floor(p.y/cell),z=Math.floor(p.z/cell);
    let nearest=null,distance=.028;
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(let dz=-1;dz<=1;dz++) {
      for(const [j,q] of buckets.get(key(x+dx,y+dy,z+dz))||[]) { const d=p.distanceTo(q); if(d<distance) { distance=d;nearest=j; } }
    }
    if(nearest!==null) pairs.push({mesh,i,j:nearest,bind:distance});
  }
  const step=Math.max(1,Math.floor(pairs.length/100));
  seams.push(...pairs.filter((_,i)=>i%step===0));
}

test('repaired GLB is reproducible; source, texture bytes and sculpted geometry are preserved',()=>{
  assert.equal(createHash('sha256').update(original.bytes).digest('hex'),OWL_SOURCE_SHA256);
  assert.equal(createHash('sha256').update(repaired.bytes).digest('hex'),OWL_SHA256);
  assert.equal(repaired.json.asset.extras.arenaRepair.revision,1);
  for(let i=0;i<original.json.meshes.length;i++) {
    const primitive=original.json.meshes[i].primitives[0];
    assert.deepEqual(repaired.accessor(primitive.attributes.POSITION),original.accessor(primitive.attributes.POSITION));
  }
  for(const image of original.json.images) {
    const view=original.json.bufferViews[image.bufferView];
    assert.deepEqual(repaired.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength),original.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength));
  }
});

test('neck skin weights form a continuous, normalised deformation instead of rigid rings',()=>{
  const weights=neck.geometry.attributes.skinWeight; let blended=0;
  for(let i=0;i<weights.count;i++) {
    const values=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
    assert.ok(Math.abs(values.reduce((a,b)=>a+b,0)-1)<1e-6);
    if(values.filter(v=>v>.01).length>1) blended++;
  }
  assert.ok(blended>weights.count*.75,`${blended}/${weights.count} blended vertices`);
});

test('actual neck surface stays joined to head and chest through flight, takeoff and landing',async()=>{
  assert.ok(seams.length>100);
  let maxOpening=0;
  for(const name of ['FlyLoop','Glide','Takeoff','Landing','HeadTilt']) {
    const duration=animations.find(c=>c.name===name).duration;
    for(let i=0;i<=30;i++) {
      sample(name,duration*i/31);
      for(const seam of seams) {
        const opening=point(seam.mesh,seam.i).distanceTo(point(neck,seam.j))-seam.bind;
        maxOpening=Math.max(maxOpening,opening);
        assert.ok(opening<.012,`${name} ${i}: neck seam opened by ${opening}`);
      }
    }
  }
  const before=await loadGeometryGlb(new URL('../../../public/assets/owl/owl-v4.glb',import.meta.url));
  const oldMixer=new THREE.AnimationMixer(before.scene),oldNeck=before.scene.getObjectByName('LayeredNeckPlumage');
  let oldMax=0;
  for(const name of ['FlyLoop','Glide','Takeoff','Landing','HeadTilt']) {
    oldMixer.stopAllAction(); const clip=before.animations.find(c=>c.name===name),action=oldMixer.clipAction(clip).play();
    for(let i=0;i<=30;i++) {
      action.time=clip.duration*i/31;oldMixer.update(0);before.scene.updateMatrixWorld(true);
      for(const seam of seams) oldMax=Math.max(oldMax,point(before.scene.getObjectByName(seam.mesh.name),seam.i).distanceTo(point(oldNeck,seam.j))-seam.bind);
    }
  }
  console.log(`Maximum sampled neck-seam expansion: ${oldMax.toFixed(4)} before → ${maxOpening.toFixed(4)} after (model units)`);
  assert.ok(maxOpening<oldMax*.5,'seam movement must be substantially reduced');
});

test('neck surfaces remain attached during blended takeoff/flight/landing poses',()=>{
  for(const [from,to,time] of [['Idle','Takeoff',0],['Takeoff','FlyLoop',2.3],['FlyLoop','Landing',.4],['Landing','Idle',2.4]]) {
    const a=sample(from,time),b=mixer.clipAction(animations.find(c=>c.name===to)).reset().play();
    for(let i=1;i<10;i++) {
      a.setEffectiveWeight(1-i/10);b.setEffectiveWeight(i/10);b.time=.25*i/10;mixer.update(0);scene.updateMatrixWorld(true);
      for(const seam of seams) assert.ok(point(seam.mesh,seam.i).distanceTo(point(neck,seam.j))-seam.bind<.012,`${from} → ${to}: open seam`);
    }
  }
});

test('wingbeat has a real upstroke/downstroke, mirrored wings and a seamless loop',()=>{
  const states=[];
  for(const time of [0,.352,.8]) {
    sample('FlyLoop',time);
    const left=scene.getObjectByName('Wing_L_Hand').getWorldPosition(new THREE.Vector3());
    const right=scene.getObjectByName('Wing_R_Hand').getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(left.y-right.y)<1e-6); assert.ok(Math.abs(left.x+right.x)<1e-6);
    states.push(left);
    const head=scene.getObjectByName('Head').getWorldQuaternion(new THREE.Quaternion());
    assert.ok(head.angleTo(new THREE.Quaternion())<.002,'head follows a stable forward direction');
  }
  assert.ok(states[0].y-states[1].y>1,'wrist must travel through a full wingbeat');
  assert.ok(states[0].distanceTo(states[2])<.008,'no jump between wing cycles');
});

test('both feet share a centred, level perch; roots do not define the seating point',async()=>{
  sample('Idle',0); const feet=calibrateOwlFeet(THREE,scene);
  assert.ok(Math.abs(feet.x)<.025); assert.ok(feet.z>.1 && feet.z<.25);
  const {scene:stump}=await loadGeometryGlb(new URL('../../../public/assets/owl/hero-stump.glb',import.meta.url));
  const perch=prepareOwlPerch(THREE,stump); stump.updateMatrixWorld(true);
  const top=stump.getObjectByName('PerchCutSurface').getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(top.x)<1e-6 && Math.abs(top.z)<1e-6);
  assert.ok(Math.abs(top.y)<.003);
  assert.ok(perch.diameter*2<perch.rootWidth,'support diameter differs from root-system width');
  sample('Landing',animations.find(c=>c.name==='Landing').duration-.00001);
  for(const side of ['L','R']) {
    const mesh=scene.getObjectByName(`IndependentLeg_${side}`);
    const bounds=new THREE.Box3().setFromObject(mesh,true);
    assert.ok(Math.abs(bounds.min.y)<.003,`${side} foot is not on the support plane`);
  }
});
