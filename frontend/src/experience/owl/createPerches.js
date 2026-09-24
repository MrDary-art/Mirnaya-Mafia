// Lightweight scene architecture. Perches live in world space, never under the
// bird rig, so takeoff cannot pull the support along with the feet.
export function createPerches(THREE, contactY) {
  const perches = new Map();
  const base = () => new THREE.MeshStandardMaterial({
    color: 0x273230, metalness: .42, roughness: .58, transparent: true, opacity: 0,
  });
  const trim = (color) => new THREE.MeshStandardMaterial({
    color, metalness: .58, roughness: .42, transparent: true, opacity: 0,
  });
  const add = (group, geometry, material, x, y, z, rotationX = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotationX;
    group.add(mesh);
    return mesh;
  };
  const make = (name, compose) => {
    const group = new THREE.Group();
    group.name = `Perch.${name}`;
    compose(group);
    perches.set(name, {
      group,
      materials: [...new Set(group.children.map((object) => object.material))],
      opacity: 0,
    });
  };

  make("ai", (group) => {
    add(group, new THREE.CylinderGeometry(.47, .52, .09, 40), base(), 0, contactY - .09, 0);
    add(group, new THREE.TorusGeometry(.49, .018, 8, 56), trim(0x3bd49a), 0, contactY - .035, 0, Math.PI / 2 - .18);
  });
  make("bridge", (group) => {
    add(group, new THREE.BoxGeometry(1.58, .12, .45), base(), 0, contactY - .1, 0);
    add(group, new THREE.BoxGeometry(1.7, .028, .045), trim(0x8c968d), 0, contactY - .025, .22);
    for (const x of [-.69, .69]) {
      add(group, new THREE.BoxGeometry(.035, .19, .04), trim(0x59786e), x, contactY - .18, .24);
    }
  });
  make("archive", (group) => {
    add(group, new THREE.BoxGeometry(1.52, .14, .55), base(), 0, contactY - .12, 0);
    add(group, new THREE.BoxGeometry(1.44, .022, .04), trim(0xc5a979), 0, contactY - .04, .275);
    add(group, new THREE.BoxGeometry(1.3, .055, .42), trim(0x3b4c44), 0, contactY - .235, 0);
  });
  make("observatory", (group) => {
    const branch = add(group, new THREE.CylinderGeometry(.075, .095, 1.7, 16), base(), 0, contactY - .055, 0);
    branch.rotation.z = Math.PI / 2;
    for (const x of [-.71, .71]) {
      const cap = add(group, new THREE.TorusGeometry(.082, .012, 8, 24), trim(0x55b9a0), x, contactY - .055, 0);
      cap.rotation.y = Math.PI / 2;
    }
  });
  make("reflection", (group) => {
    const disc = add(group, new THREE.CylinderGeometry(.64, .57, .075, 48), base(), 0, contactY - .075, 0);
    disc.scale.z = .72;
    const rim = add(group, new THREE.TorusGeometry(.62, .012, 8, 60), trim(0xb8a47b), 0, contactY - .028, 0, Math.PI / 2 - .15);
    rim.scale.y = .72;
  });
  make("vault", (group) => {
    add(group, new THREE.BoxGeometry(1.23, .11, .48), base(), 0, contactY - .1, 0);
    add(group, new THREE.BoxGeometry(1.43, .075, .59), trim(0x2d554c), 0, contactY - .19, 0);
    add(group, new THREE.BoxGeometry(1.57, .045, .65), trim(0x8b7150), 0, contactY - .255, 0);
  });

  return perches;
}

export function disposePerches(perches) {
  for (const { group } of perches?.values() || []) {
    group.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    group.removeFromParent();
  }
}
