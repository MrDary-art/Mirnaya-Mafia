import { HOME_SECTIONS, clamp01, smoothstep } from "./homeWorldModel.js";

export function createHomeWorld(THREE, scene) {
  const groups = [];
  const charcoal = 0x202b2c;
  const emerald = 0x53d6aa;
  const gold = 0xd5ae69;
  const cyan = 0x73cfc7;
  const material = (color = charcoal, metalness = .55, emissive = 0x000000) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness: .32, emissive,
      emissiveIntensity: emissive ? .5 : 0, transparent: true, opacity: 0, depthWrite: false });
  const add = (group, geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material(color, .58, color === emerald || color === cyan ? color : 0));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };
  const ring = (group, radius, tube, color, position, rotation) =>
    add(group, new THREE.TorusGeometry(radius, tube, 12, 64), color, position, rotation);
  const sphere = (group, radius, color, position) =>
    add(group, new THREE.IcosahedronGeometry(radius, 2), color, position);
  const line = (group, points, color = emerald, width = .018) => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return add(group, new THREE.TubeGeometry(curve, 64, width, 5, false), color);
  };
  function world(index, builder) {
    const group = new THREE.Group();
    group.userData.index = index;
    builder(group);
    group.visible = false;
    scene.add(group);
    groups.push(group);
  }

  // AI: a small distant intelligence expands into concentric, imperfect orbits.
  world(1, (group) => {
    group.position.x = 2.2;
    sphere(group, .74, charcoal, [0, 0, -1.5]);
    sphere(group, .37, emerald, [0, 0, -.6]);
    ring(group, 1.28, .035, cyan, [0, 0, -1.2], [.36, .62, .25]);
    ring(group, 1.55, .018, gold, [0, 0, -1.5], [.8, -.28, -.38]);
  });
  // 1×1: the orb resolves into two participant cores connected by one ribbon.
  world(2, (group) => {
    for (const sign of [-1, 1]) {
      sphere(group, .72, charcoal, [sign * 1.75, -.2, -1]);
      ring(group, .92, .045, sign < 0 ? emerald : gold, [sign * 1.75, -.2, -.5], [.4, sign * .4, .2]);
      sphere(group, .19, sign < 0 ? emerald : gold, [sign * 1.75, -.2, .05]);
    }
    line(group, [[-1.75, -.3, -.5], [-.7, .22, .1], [0, -.12, .42], [.8, .25, .05], [1.75, -.2, -.5]], cyan, .026);
  });
  // Scenarios: tall sculptural totems emerge from the foreground.
  world(3, (group) => {
    group.position.x = -2.05;
    for (let index = 0; index < 3; index += 1) {
      const x = (index - 1) * 1.18;
      const height = 2.6 + index * .57;
      add(group, new THREE.CylinderGeometry(.34, .54, height, 8, 1), charcoal,
        [x, -1.6 + height / 2, -1.1 - index * .35], [0, index * .35, .07 * (index - 1)]);
      ring(group, .36, .025, index === 1 ? gold : emerald,
        [x, -.2 + index * .34, -.55 - index * .35], [.1, .35, .2]);
    }
  });
  // Learning: rings disclose a wide constellation of skill nodes.
  world(4, (group) => {
    group.position.x = 1.3;
    ring(group, 2.35, .065, charcoal, [0, 0, -2.6], [.35, .26, .18]);
    ring(group, 1.78, .022, emerald, [0, 0, -1.7], [.7, -.24, -.3]);
    const nodes = [[-1.7, .7, -1], [-1.05, -1, -.8], [-.28, 1.65, -1.8], [.55, -.1, .2], [1.45, 1, -1], [1.82, -1.1, -1.6]];
    nodes.forEach((point, index) => sphere(group, index === 3 ? .23 : .11, index === 3 ? gold : cyan, point));
    line(group, nodes, cyan, .013);
  });
  // History: the same luminous thread stretches into a continuous memory ribbon.
  world(5, (group) => {
    group.position.x = 2.3;
    line(group, [[-2.1, 2.9, -2], [-1.2, 1.5, -1.4], [.4, .7, -.7], [-.5, -.35, .2], [1.1, -1.2, -.6], [1.75, -2.5, -1.2]], emerald, .055);
    for (const point of [[-1.3, 1.55, -1.35], [.35, .72, -.68], [-.5, -.35, .2], [1.1, -1.2, -.6]]) {
      sphere(group, .18, gold, point);
      ring(group, .31, .018, cyan, point, [.4, .6, .2]);
    }
  });
  // Friends: the ribbon branches into a restrained social network.
  world(6, (group) => {
    group.position.x = -1.4;
    const nodes = [[-2, 1.3, -1.3], [-1.1, -.4, -.6], [-.2, 1.65, -1.9], [.9, .5, -.3], [1.8, -1.1, -1.5], [-1.65, -1.5, -2]];
    nodes.forEach((point, index) => sphere(group, index === 3 ? .32 : .16, index === 3 ? gold : cyan, point));
    [[0, 1, 3], [2, 3, 4], [5, 1, 4]].forEach((branch) => line(group, branch.map((index) => nodes[index]), emerald, .018));
  });
  // Profile: the network contracts into an asymmetric double helix.
  world(7, (group) => {
    group.position.x = 2.3;
    const left = [], right = [];
    for (let i = 0; i <= 32; i += 1) {
      const y = -2.35 + i * .15;
      const angle = i * .37;
      left.push([Math.sin(angle) * .83, y, Math.cos(angle) * .58 - 1]);
      right.push([Math.sin(angle + Math.PI) * .83, y, Math.cos(angle + Math.PI) * .58 - 1]);
    }
    line(group, left, emerald, .047);
    line(group, right, gold, .047);
    for (let i = 3; i < 32; i += 5) line(group, [left[i], right[i]], charcoal, .028);
  });
  world(8, (group) => {
    ring(group, 1.8, .055, emerald, [0, .25, -2], [.45, .4, .3]);
    ring(group, 2.45, .025, gold, [0, .25, -2.7], [.8, -.3, -.2]);
    sphere(group, .26, cyan, [0, .25, -1]);
  });

  // One spatial thread actually changes shape from intelligence to human
  // connection, knowledge, memory, community and identity. It remains mounted
  // while the chapter objects enter and leave around it.
  const spinePoints = new Float32Array(72 * 3);
  const spineGeometry = new THREE.BufferGeometry();
  spineGeometry.setAttribute("position", new THREE.BufferAttribute(spinePoints, 3).setUsage(THREE.DynamicDrawUsage));
  const spineMaterial = new THREE.LineBasicMaterial({ color: emerald, transparent: true, opacity: 0, depthWrite: false });
  const spine = new THREE.Line(spineGeometry, spineMaterial);
  spine.visible = false;
  spine.frustumCulled = false;
  scene.add(spine);
  const shape = (stage, t) => {
    const circle = Math.PI * 2 * t;
    switch (stage) {
      case 1: return [2.2 + Math.cos(circle) * 1.2, Math.sin(circle) * 1.05, -1.7];
      case 2: return [-2.2 + t * 4.4, Math.sin(t * Math.PI * 2) * .45, -.8];
      case 3: return [-2.1 + Math.sin(t * Math.PI * 3) * 1.1, -2 + t * 4, -1.3];
      case 4: return [1.3 + Math.cos(circle) * 1.8, Math.sin(circle) * 1.8, -1.8];
      case 5: return [2.3 + Math.sin(t * Math.PI * 3) * .8, 2.3 - t * 4.6, -1.2 + t * .7];
      case 6: return [-2.9 + t * 3.6, Math.sin(t * Math.PI * 5) * 1.25, -1.5];
      case 7: return [2.3 + Math.sin(t * Math.PI * 6) * .8, -2.3 + t * 4.6, -1 + Math.cos(t * Math.PI * 6) * .55];
      default: return [Math.cos(circle) * 1.7, Math.sin(circle) * 1.7, -2];
    }
  };

  function update(snapshot, now, reduced) {
    const stage = Math.max(1, Math.min(8, Math.floor(snapshot.position)));
    const nextStage = Math.min(8, stage + 1);
    const blend = smoothstep(snapshot.position - stage);
    for (let index = 0; index < 72; index += 1) {
      const t = index / 71;
      const before = shape(stage, t);
      const after = shape(nextStage, t);
      for (let axis = 0; axis < 3; axis += 1) {
        spinePoints[index * 3 + axis] = before[axis] + (after[axis] - before[axis]) * blend;
      }
    }
    spineGeometry.attributes.position.needsUpdate = true;
    spine.visible = snapshot.position > .55;
    spineMaterial.opacity = spine.visible ? Math.min(.38, (snapshot.position - .55) * .3) : 0;
    for (const group of groups) {
      if (!snapshot.loadedScenes?.includes(HOME_SECTIONS[group.userData.index].id)) {
        group.visible = false;
        continue;
      }
      const distance = Math.abs(snapshot.position - group.userData.index);
      const presence = 1 - smoothstep((distance - .08) / .95);
      group.visible = presence > .005;
      if (!group.visible) continue;
      const arriving = clamp01(group.userData.index - snapshot.position + .65);
      const emergence = 1 - arriving;
      group.position.y = (group.userData.index === 3 ? -.7 : -.22) * (1 - emergence);
      const scale = .3 + .7 * smoothstep(emergence + .35);
      group.scale.setScalar(reduced ? 1 : scale);
      group.rotation.y = reduced ? 0 : Math.sin(now * .00018 + group.userData.index) * .08;
      group.traverse((object) => {
        if (object.isMesh) object.material.opacity = presence * (object.material.color.getHex() === charcoal ? .74 : .9);
      });
    }
  }

  function dispose() {
    spineGeometry.dispose();
    spineMaterial.dispose();
    spine.removeFromParent();
    for (const group of groups) {
      group.traverse((object) => {
        if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); }
      });
      group.removeFromParent();
    }
  }

  return { update, dispose, groups, spine };
}
