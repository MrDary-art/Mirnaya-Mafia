import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadGeometryGlb, writeGlb } from './lib/owl-glb.mjs';

// Reproducible derivative. Never overwrite the supplied source model.
const source = new URL('../public/assets/owl/owl-v4.glb', import.meta.url);
const target = new URL('../public/assets/owl/owl-v4-repaired.glb', import.meta.url);
const { json, bin, accessor, scene, animations } = await loadGeometryGlb(source);
const smooth = (a,b,x) => { const t = THREE.MathUtils.clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const joint = name => json.skins[0].joints.findIndex(index => json.nodes[index].name === name);
const neckChain = ['Chest','NeckBase','NeckMid','NeckUpper','Head'];
const levels = [1.06,1.20,1.285,1.375,1.46];
const neckWeights = y => {
  if (y <= levels[0]) return [[joint('Chest'), 1]];
  for (let k=1;k<levels.length;k++) if (y<levels[k]) {
    const w = smooth(levels[k-1],levels[k],y);
    return [[joint(neckChain[k-1]),1-w],[joint(neckChain[k]),w]];
  }
  return [[joint('Head'),1]];
};
let repairedVertices = 0;
for (const mesh of json.meshes) {
  if (!['LayeredNeckPlumage','ForwardFacingHead','TorsoFeatherCoat'].includes(mesh.name)) continue;
  for (const primitive of mesh.primitives) {
    const pos = accessor(primitive.attributes.POSITION), weights = accessor(primitive.attributes.WEIGHTS_0), joints = accessor(primitive.attributes.JOINTS_0);
    for (let i=0;i<pos.length/3;i++) {
      const y = pos[i*3+1], z = pos[i*3+2];
      if (mesh.name === 'TorsoFeatherCoat' && y <= 1.06) continue;
      if (mesh.name === 'ForwardFacingHead' && y >= 1.46) continue; // Preserve ears and face detail.
      let influences = neckWeights(y);
      if (mesh.name === 'ForwardFacingHead') {
        // Keep beak/face rigid, smoothly join only the underside and nape.
        const face = smooth(.24,.43,z);
        influences = influences.map(([j,w]) => [j,w*(1-face)]);
        influences.push([joint('Head'),face]);
      }
      const merged = new Map(); for (const [j,w] of influences) merged.set(j,(merged.get(j)||0)+w);
      influences = [...merged].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4);
      const total = influences.reduce((sum,[,w])=>sum+w,0);
      for (let k=0;k<4;k++) { joints[i*4+k]=influences[k]?.[0]||0; weights[i*4+k]=(influences[k]?.[1]||0)/total; }
      repairedVertices++;
    }
  }
}

const mixer = new THREE.AnimationMixer(scene);
mixer.clipAction(animations.find(clip=>clip.name==='Idle')).play(); mixer.update(0);
const idle = new Map(); scene.traverse(node => { if (node.isBone) idle.set(node.name,node.quaternion.clone()); });
const q = (x=0,y=0,z=0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ'));
const period = .8;
function flightPose(time, glide = false) {
  const phase = ((time/period)%1+1)%1;
  // Faster power stroke, slower folded recovery. C1-continuous at both reversals.
  const down = phase<.44;
  const progress = down ? phase/.44 : (phase-.44)/.56;
  const ease = .5-.5*Math.cos(Math.PI*progress);
  const stroke = glide ? .10+.025*Math.sin(time*Math.PI/2) : down ? 1.02-1.78*ease : -.76+1.78*ease;
  const recovery = glide ? .18 : down ? .025 : .44*Math.sin(Math.PI*progress)**2;
  const pitch = .72 + (glide ? 0 : .018*Math.sin(phase*2*Math.PI));
  const pose = new Map(); pose.set('Body',q(pitch)); pose.set('Chest',q());
  // One connected neck bend, head stabilised relative to the torso, not translated away.
  for (const [name,share] of [['NeckBase',.24],['NeckMid',.32],['NeckUpper',.28],['Head',.16]]) pose.set(name,q(-pitch*share));
  const bodyInverse = q(-pitch);
  for (const [side,sign] of [['L',1],['R',-1]]) {
    const attack = glide ? .26 : .45 + .12*Math.sin(phase*2*Math.PI);
    pose.set(`Wing_${side}_Upper`,bodyInverse.clone().multiply(q(0,0,sign*stroke)).multiply(q(attack)));
    pose.set(`Wing_${side}_Forearm`,q(0,sign*recovery));
    const wristLag = glide ? -.025 : -.11*Math.sin(phase*2*Math.PI-.35);
    pose.set(`Wing_${side}_Wrist`,q(0,-sign*recovery*.55,sign*wristLag));
    pose.set(`Wing_${side}_Hand`,q(0,sign*recovery*.10,sign*wristLag*.4));
    for (let i=1;i<=10;i++) pose.set(`Primary_${side}_${String(i).padStart(2,'0')}`,q(0,sign*.025*(i/10)*Math.sin(phase*2*Math.PI-.3),0));
    for (let i=1;i<=8;i++) pose.set(`Secondary_${side}_${String(i).padStart(2,'0')}`,q());
    pose.set(`Hip_${side}`,q(1.05)); pose.set(`Shin_${side}`,q(-.4)); pose.set(`Foot_${side}`,q(-.75));
    for (let i=1;i<=4;i++) { pose.set(`Toe_${side}_${i}`,q(.55)); pose.set(`Claw_${side}_${i}`,q(.35)); }
  }
  pose.set('Tail',q(-.12)); pose.set('TailTip',q(.06));
  return pose;
}
const repairedClips = new Set(['FlyLoop','Glide','Takeoff','Landing','WingFlap']);
for (const animation of json.animations) {
  if (!repairedClips.has(animation.name)) continue;
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler], times = accessor(sampler.input), values = accessor(sampler.output);
    const name = json.nodes[channel.target.node].name, path = channel.target.path;
    const duration = times[times.length-1];
    for (let i=0;i<times.length;i++) {
      const t = times[i], clip = animation.name;
      const flightTime = clip === 'Takeoff' ? t-duration : t;
      const pose = flightPose(flightTime,clip==='Glide');
      let amount = 1;
      const wing = /Wing_|Primary_|Secondary_/.test(name);
      if (clip==='Takeoff') amount = wing ? smooth(.12,.72,t) : smooth(.3,1.15,t);
      if (clip==='Landing') amount = 1-smooth(wing ? 1.85 : .55,wing ? duration : 1.90,t);
      if (clip==='WingFlap') amount = wing ? smooth(0,.45,t)*(1-smooth(duration-.5,duration,t)) : 0;
      if (path==='rotation' && pose.has(name)) {
        const rotation = (idle.get(name)||q()).clone().slerp(pose.get(name),amount);
        rotation.toArray(values,i*4);
      }
      if (path==='translation' && name==='Root') {
        const lift = clip==='Takeoff' ? smooth(.38,2.1,t) : clip==='Landing' ? 1-smooth(.20,1.9,t) : clip==='WingFlap' ? 0 : 1;
        const bob = (clip==='FlyLoop' || clip==='Glide') ? .012*Math.sin(2*Math.PI*t/period) : 0;
        values[i*3]=0; values[i*3+1]=1.08*lift+bob; values[i*3+2]=0;
      }
      if (path==='translation' && name==='Body') {
        // Stable pelvis; no lateral drift at touchdown. Tiny crouch before lift.
        values[i*3]=0; values[i*3+1]=.77-(clip==='Takeoff' ? .04*Math.sin(Math.PI*Math.min(t/.5,1))**2 : 0); values[i*3+2]=-.055;
      }
    }
  }
}
json.asset.generator = `${json.asset.generator || 'glTF'}; Arena connected-neck and articulated-flight repair 1`;
json.asset.extras = { ...json.asset.extras, arenaRepair: { revision: 1, source: 'owl-v4.glb', neck: 'continuous normalised skin weights', flightPeriod: period, clips: [...repairedClips] } };
await writeGlb(target,json,bin);
const bytes = await readFile(target);
console.log(JSON.stringify({ repairedVertices, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), clips: [...repairedClips] },null,2));
