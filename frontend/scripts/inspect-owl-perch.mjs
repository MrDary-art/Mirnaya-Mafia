import * as THREE from 'three';
import { loadGeometryGlb } from './lib/owl-glb.mjs';
const { scene } = await loadGeometryGlb(new URL('../public/assets/owl/hero-stump.glb', import.meta.url));
const bounds = new THREE.Box3().setFromObject(scene,true), h=bounds.max.y-bounds.min.y;
const bins = [0,.5,.7,.8,.9,.95,.98].map(fraction=>({ fraction, box: new THREE.Box3(), count:0 }));
scene.traverse(mesh=>{ if (!mesh.isMesh) return; const a=mesh.geometry.attributes.position; for(let i=0;i<a.count;i++) {
  const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);
  for(const bin of bins) if(p.y>=bounds.min.y+h*bin.fraction) {bin.box.expandByPoint(p);bin.count++;}
} });
console.log(JSON.stringify({bounds,bins},null,2));
