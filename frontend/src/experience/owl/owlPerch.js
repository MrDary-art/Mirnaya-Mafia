// Physical support is the cut surface, never the root system's bounding box.
export function prepareOwlPerch(THREE, stump) {
  stump.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(stump, true);
  const height = bounds.max.y - bounds.min.y;
  const rim = new THREE.Box3(), point = new THREE.Vector3();
  stump.traverse(mesh => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    for (let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      if (point.y > bounds.min.y + height * .8) rim.expandByPoint(point);
    }
  });
  const centre = rim.getCenter(new THREE.Vector3());
  const radius = Math.min(rim.max.x-rim.min.x,rim.max.z-rim.min.z) * .48;
  const seatY = bounds.min.y + height * .9;
  // Level only the jagged top. Keep the old bark, taper and roots intact.
  stump.traverse(mesh => {
    if (!mesh.isMesh) return;
    const inverse = mesh.matrixWorld.clone().invert(), positions = mesh.geometry.attributes.position;
    for (let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      const level=THREE.MathUtils.clamp((point.y-bounds.min.y)/height/.7,0,1);
      const taper=.78+.22*level*level*(3-2*level);
      point.x=centre.x+(point.x-centre.x)*taper; point.z=centre.z+(point.z-centre.z)*taper;
      point.y=Math.min(point.y,seatY); point.applyMatrix4(inverse); positions.setXYZ(i,point.x,point.y,point.z);
    }
    positions.needsUpdate=true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(radius,64),new THREE.MeshStandardMaterial({ color: 0x3e2d1c, roughness: .94, metalness: 0 }));
  top.name='PerchCutSurface'; top.rotation.x=-Math.PI/2; top.position.set(centre.x,seatY+.001,centre.z);
  stump.add(top);
  // Fine concentric growth lines are geometry, so the support needs no image request.
  for (let i=1;i<=8;i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius*i/9,radius*i/9+.003,64),
      new THREE.MeshStandardMaterial({ color: 0x493b28, roughness: 1, transparent: true, opacity: .35 }));
    const positions=ring.geometry.attributes.position;
    for (let j=0;j<positions.count;j++) {
      const x=positions.getX(j),y=positions.getY(j),angle=Math.atan2(y,x),r=1+.025*Math.sin(angle*3+i*.37);
      positions.setXY(j,x*r,y*r);
    }
    ring.rotation.x=-Math.PI/2; ring.position.set(centre.x,seatY+.0015,centre.z); stump.add(ring);
  }
  const anchor = new THREE.Vector3(centre.x,seatY+.002,centre.z);
  stump.position.sub(anchor);
  return { anchor, diameter: radius*2, rootWidth: bounds.max.x-bounds.min.x };
}

export function calibrateOwlFeet(THREE, model) {
  const feet = new THREE.Box3();
  const legs = ['IndependentLeg_L','IndependentLeg_R'].map(name=>model.getObjectByName(name)).filter(Boolean);
  for (const leg of legs) feet.expandByObject(leg,true);
  const bounds = new THREE.Box3().setFromObject(model,true);
  if (!legs.length) return { floor: bounds.min.y, x: 0, z: 0, footWidth: .6, height: bounds.max.y-bounds.min.y, width: bounds.max.x-bounds.min.x };
  const soles = new THREE.Box3(), point = new THREE.Vector3();
  for (const leg of legs) for (let i=0;i<leg.geometry.attributes.position.count;i++) {
    leg.getVertexPosition(i,point).applyMatrix4(leg.matrixWorld);
    if (point.y<feet.min.y+.045) soles.expandByPoint(point);
  }
  const centre = soles.getCenter(new THREE.Vector3());
  return { floor: feet.min.y, x: centre.x, z: centre.z, footWidth: feet.max.x-feet.min.x,
    height: bounds.max.y-feet.min.y, width: bounds.max.x-bounds.min.x };
}
