export function createFeatherSystem(THREE, scene) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.16);
  shape.bezierCurveTo(-.13, -.07, -.12, .1, 0, .2);
  shape.bezierCurveTo(.11, .08, .12, -.07, 0, -.16);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const material = new THREE.MeshStandardMaterial({ color: 0x8d9a83, roughness: .82,
    metalness: .06, side: THREE.DoubleSide, transparent: true, opacity: .9, depthWrite: false });
  const feathers = [];
  let emitted = 0;
  let nextAt = performance.now() + 12000;

  function update(delta, now, owl, onHome) {
    if (onHome && owl.homeAirborne && owl.root.visible && emitted < 3 && now >= nextAt) {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.copy(owl.root.position);
      mesh.position.x += (Math.random() - .5) * .6;
      mesh.position.y -= owl.root.scale.y * .28;
      mesh.position.z += .3;
      mesh.scale.setScalar(.7 + Math.random() * .55);
      mesh.userData = { age: 0, life: 2.6 + Math.random() * .8,
        velocity: new THREE.Vector3((Math.random() - .5) * .4, -.12, .04),
        spin: (Math.random() - .5) * 2.4 };
      scene.add(mesh);
      feathers.push(mesh);
      emitted += 1;
      nextAt = now + 22000 + Math.random() * 15000;
    }
    for (let index = feathers.length - 1; index >= 0; index -= 1) {
      const feather = feathers[index];
      const life = feather.userData;
      life.age += delta;
      life.velocity.y -= delta * .31;
      feather.position.addScaledVector(life.velocity, delta);
      feather.position.x += Math.sin(now * .0015 + index) * delta * .08;
      feather.rotation.z += life.spin * delta;
      feather.rotation.y += delta * .9;
      feather.material.opacity = Math.max(0, .9 * (1 - Math.max(0, life.age - life.life + 1)));
      if (life.age >= life.life) {
        feather.removeFromParent();
        feather.material.dispose();
        feathers.splice(index, 1);
      }
    }
  }

  function dispose() {
    for (const feather of feathers) { feather.removeFromParent(); feather.material.dispose(); }
    geometry.dispose();
    material.dispose();
  }

  return { update, dispose };
}
