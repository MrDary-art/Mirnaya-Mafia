import { motifForRoute } from "./productWorldState.js";

// All geometry and light here belong to a separate Scene. The existing owl scene,
// camera, materials and animation timeline are never passed into this module.
export function createProductWorld(THREE, options = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-7, 7, 4, -4, .1, 40);
  camera.position.set(0, 0, 12);
  scene.add(new THREE.AmbientLight(0xe1ede8, 1.45));
  const key = new THREE.DirectionalLight(0xf5e9ca, 2.3);
  key.position.set(-3, 5, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x72c9c5, 1.9);
  rim.position.set(4, -2, 2);
  scene.add(rim);

  const colors = { ceramic: 0x202b2e, ceramicLight: 0x344448, edge: 0xdbe7dc,
    brass: 0xcba967, mint: 0x82d2c7, paper: 0xc9d4ca, smoke: 0x586c70 };
  const materials = new Set();
  const makeMaterial = (color, metalness = .2, roughness = .5) => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide });
    materials.add(material);
    return material;
  };
  const mat = {
    ceramic: makeMaterial(colors.ceramic, .25, .43),
    light: makeMaterial(colors.ceramicLight, .25, .4),
    edge: makeMaterial(colors.edge, .08, .59),
    brass: makeMaterial(colors.brass, .65, .3),
    mint: makeMaterial(colors.mint, .33, .39),
    paper: makeMaterial(colors.paper, .06, .72),
    smoke: makeMaterial(colors.smoke, .15, .5),
  };
  const mesh = (parent, geometry, material, x = 0, y = 0, z = 0, rz = 0) => {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.rotation.z = rz;
    parent.add(item);
    return item;
  };
  const roundedShape = (width, height, radius = .1) => {
    const x = -width / 2; const y = -height / 2; const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y); shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  };
  const slab = (parent, width, height, depth, material, x, y, z, angle = 0) =>
    mesh(parent, new THREE.ExtrudeGeometry(roundedShape(width, height), {
      depth, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 3, curveSegments: 8,
    }), material, x, y, z, angle);
  const line = (parent, coordinates, radius, material) => {
    const points = coordinates.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(points);
    return mesh(parent, new THREE.TubeGeometry(curve, Math.max(24, points.length * 9), radius, 6, false), material);
  };
  const band = (parent, coordinates, width, material, depth = .1) => {
    const curve = new THREE.CatmullRomCurve3(coordinates.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const left = []; const right = [];
    for (let index = 0; index <= 48; index += 1) {
      const t = index / 48;
      const p = curve.getPoint(t); const tangent = curve.getTangent(t).normalize();
      const nx = -tangent.y * width / 2; const ny = tangent.x * width / 2;
      left.push([p.x + nx, p.y + ny]); right.push([p.x - nx, p.y - ny]);
    }
    const shape = new THREE.Shape(); shape.moveTo(...left[0]);
    left.slice(1).forEach((p) => shape.lineTo(...p));
    right.reverse().forEach((p) => shape.lineTo(...p));
    shape.closePath();
    return mesh(parent, new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 2,
    }), material);
  };
  const disc = (parent, radius, depth, material, x, y, z = 0) =>
    mesh(parent, new THREE.CylinderGeometry(radius, radius, depth, 32), material, x, y, z);

  function build(id) {
    const group = new THREE.Group();
    switch (id) {
      case "M01": {
        band(group, [[-2, -.85], [-1.7, .65], [-.72, 1.05], [.28, .35], [1.1, -.52]], .48, mat.ceramic, .18);
        band(group, [[-1.28, -1.05], [-.35, -.36], [.42, .83], [1.38, 1.05], [2.04, .34]], .33, mat.light, .16);
        line(group, [[-.8, -.6, .2], [-.42, -.2, .23], [.03, .02, .21]], .028, mat.brass);
        line(group, [[.65, -.42, .2], [.8, -.12, .26], [1.07, .18, .2]], .024, mat.mint);
        break;
      }
      case "M02": {
        for (let i = 0; i < 5; i += 1) {
          const plate = slab(group, 1.18 + i * .13, 2.55 - i * .13, .09, i === 2 ? mat.smoke : i === 4 ? mat.edge : mat.ceramic, (i - 2) * .53, .02 + i * .06, -i * .15, (i - 2) * .095);
          plate.rotation.y = (i - 2) * .12;
        }
        line(group, [[-1.65, -1.18, .36], [.12, -1.23, .38], [1.63, -1.05, .16]], .018, mat.brass);
        break;
      }
      case "M03": {
        band(group, [[-2.3, -.8], [-2.05, .45], [-1.35, 1.24], [-.48, 1.36]], .18, mat.edge, .12);
        band(group, [[.34, -1.36], [1.13, -1.06], [1.9, -.18], [2.14, 1.08]], .24, mat.ceramicLight || mat.light, .12);
        line(group, [[-.48, .27, .1], [.12, .16, .1], [.7, .38, .1]], .023, mat.brass);
        disc(group, .1, .12, mat.mint, -.47, .27, .18);
        disc(group, .1, .12, mat.mint, .71, .38, .18);
        break;
      }
      case "M04": {
        slab(group, 3.0, 2.3, .28, mat.ceramic, 0, 0, -.3, -.06);
        slab(group, 2.56, 1.96, .035, mat.paper, .05, .08, .04, .045);
        slab(group, 2.2, 1.73, .035, mat.edge, .27, .15, .14, .115);
        band(group, [[-.73, -.38], [-.14, .23], [.53, -.2], [.8, .38]], .16, mat.brass, .08).position.z = .26;
        line(group, [[-1.23, .83, .28], [-.5, .86, .28], [.19, .82, .28]], .016, mat.ceramic);
        break;
      }
      case "M05": {
        band(group, [[-2.3, .98], [-1.14, .5], [-.47, -.55], [.39, -.24], [1.1, .55], [2.24, -.42]], .25, mat.ceramic, .13);
        line(group, [[-2.3, 1.16, .14], [-1.14, .68, .15], [-.47, -.37, .15], [.39, -.06, .15], [1.1, .73, .15], [2.24, -.24, .15]], .018, mat.brass);
        break;
      }
      case "M06": {
        for (const [radius, start, arc, material, z] of [[1.86, .16, 3.95, mat.ceramic, -.3], [1.34, 1.12, 4.0, mat.edge, 0], [.82, -.84, 4.2, mat.brass, .23]]) {
          const item = mesh(group, new THREE.TorusGeometry(radius, .055, 8, 80, arc), material, 0, 0, z);
          item.rotation.z = start;
        }
        slab(group, .3, .3, .15, mat.mint, -1.36, .75, .25, .25);
        slab(group, .23, .23, .15, mat.brass, 1.2, -.38, .24, .25);
        break;
      }
      case "M07": {
        const cover = slab(group, 2.9, 2.14, .18, mat.ceramic, -.02, -.06, -.2, -.1);
        cover.rotation.y = -.16;
        for (let i = 0; i < 4; i += 1) {
          const page = slab(group, 2.52 - i * .13, 1.85 - i * .06, .018, i % 2 ? mat.edge : mat.paper, .17 + i * .12, .1 + i * .09, .02 + i * .08, .07 + i * .06);
          page.rotation.y = .05 + i * .07;
        }
        line(group, [[-.96, -.58, .44], [-.5, -.59, .45], [.12, -.53, .45]], .015, mat.brass);
        break;
      }
      case "M08": {
        band(group, [[-1.53, -1.28], [-1.37, .12], [-.65, 1.23], [.18, 1.36]], .21, mat.ceramic, .14);
        band(group, [[-.71, -1.45], [.08, -.6], [.68, .52], [1.4, 1.1]], .16, mat.edge, .11);
        band(group, [[.24, -1.23], [1.17, -.94], [1.65, -.03], [1.38, .74]], .13, mat.brass, .09);
        break;
      }
      case "M09": {
        slab(group, .76, .72, .28, mat.edge, -1.43, .68, .13, -.18);
        slab(group, .95, .82, .29, mat.ceramic, .13, -.62, .1, .1);
        slab(group, .71, .76, .27, mat.light, 1.52, .72, .05, .22);
        line(group, [[-1.04, .35, .1], [-.48, -.02, .12], [-.32, -.27, .12]], .035, mat.brass);
        line(group, [[.63, -.27, .1], [1.05, .25, .12], [1.17, .43, .12]], .027, mat.mint);
        break;
      }
      case "M10": {
        const body = mesh(group, new THREE.CylinderGeometry(1.05, 1.05, 2.7, 9, 1, false), mat.ceramic, 0, 0, 0, Math.PI / 2);
        body.rotation.x = .18;
        for (let i = 0; i < 9; i += 1) {
          const angle = i * Math.PI * 2 / 9;
          slab(group, .09, .42, .045, i % 3 ? mat.edge : mat.brass, Math.cos(angle) * 1.04, Math.sin(angle) * 1.04, .66, angle);
        }
        slab(group, 1.46, 1.46, .17, mat.light, .16, 0, .78, .08);
        slab(group, .42, .72, .08, mat.brass, .38, 0, .96, -.16);
        break;
      }
      case "M11": {
        band(group, [[-2.0, -.88], [-1.44, -.35], [-.85, .55], [-.31, .84]], .52, mat.ceramic, .22);
        band(group, [[.28, .84], [.82, .54], [1.37, -.42], [1.94, -.88]], .48, mat.edge, .21);
        line(group, [[-.31, .8, .25], [0, .86, .28], [.28, .8, .25]], .024, mat.brass);
        break;
      }
      default: {
        const back = slab(group, 1.92, 1.92, .22, mat.ceramic, -.29, .16, -.12, -.12);
        back.rotation.y = -.12;
        const front = slab(group, 1.92, 1.92, .18, mat.edge, .31, -.11, .12, .1);
        front.rotation.y = .15;
        slab(group, .72, .72, .07, mat.brass, .38, -.06, .37, .1);
      }
    }
    return group;
  }

  let activeId = null;
  let active = null;
  let outgoing = null;
  let changedAt = 0;
  let width = 1440;
  let height = 900;
  let visible = true;
  const disposeGroup = (group) => {
    if (!group) return;
    scene.remove(group);
    group.traverse((item) => item.geometry?.dispose());
  };
  function resize(nextWidth, nextHeight) {
    width = nextWidth; height = nextHeight;
    const halfHeight = 4;
    const halfWidth = halfHeight * width / height;
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }
  function update(pathname, sectionId, now, reduced, motionMode = "full") {
    const completeTeamRecord = /^\/room\//.test(pathname) && document.querySelector('[data-room-team-complete="true"]');
    const confirmedBooking = pathname === "/rooms" && document.querySelector('[data-room-created="true"]');
    const nextId = completeTeamRecord ? "M11" : confirmedBooking ? "M10" : motifForRoute(pathname, sectionId);
    if (nextId !== activeId) {
      disposeGroup(outgoing);
      outgoing = active;
      active = nextId ? build(nextId) : null;
      if (active) scene.add(active);
      activeId = nextId;
      changedAt = now;
    }
    const mobile = width < 768;
    const home = pathname === "/app";
    const work = /^\/(play|practice|room\/|training\/path\/attempt\/)/.test(pathname);
    const targetX = options.placement === "export" ? 0 : options.placement === "auth" ? mobile ? 0 : -2.6 : mobile ? 1.15 : completeTeamRecord ? 2.85 : home && ["scenarios", "friends"].includes(sectionId) ? -2.7 : home ? 3.1 : work ? 3.35 : 2.45;
    const targetY = options.placement === "export" ? 0 : options.placement === "auth" ? mobile ? 2.75 : 1.52 : mobile ? 2.85 : completeTeamRecord ? 2.85 : work ? 2.15 : 1.28;
    const size = options.placement === "export" ? 1.5 : options.placement === "auth" ? mobile ? .32 : .97 : mobile ? .31 : completeTeamRecord ? .65 : work ? .38 : home ? .84 : .86;
    const duration = reduced || motionMode === "off" ? 0 : motionMode === "calm" ? 300 : 620;
    const progress = duration ? Math.min(1, (now - changedAt) / duration) : 1;
    const ease = 1 - Math.pow(1 - progress, 3);
    if (active) {
      active.position.set(targetX + (1 - ease) * (targetX < 0 ? -1.35 : 1.35), targetY - (1 - ease) * .18, -1.1);
      active.rotation.y = (1 - ease) * .3;
      active.scale.setScalar(size * (.86 + ease * .14));
    }
    if (outgoing) {
      const exit = duration ? Math.min(1, (now - changedAt) / Math.min(duration, 320)) : 1;
      outgoing.position.x += (targetX < 0 ? -1 : 1) * .035;
      outgoing.scale.setScalar(size * (1 - exit * .3));
      if (exit >= 1) { disposeGroup(outgoing); outgoing = null; }
    }
    visible = Boolean(active || outgoing) && !reduced && motionMode !== "off";
  }
  function render(renderer) {
    if (visible) renderer.render(scene, camera);
  }
  function dispose() {
    disposeGroup(active); disposeGroup(outgoing);
    materials.forEach((material) => material.dispose());
  }
  function stats() {
    let meshes = 0; let triangles = 0;
    active?.traverse((item) => {
      if (!item.isMesh) return;
      meshes += 1;
      const geometry = item.geometry;
      triangles += Math.floor((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3);
    });
    return { id: activeId, meshes, triangles, materialVariants: Object.keys(mat).length };
  }
  return { resize, update, render, dispose, stats, get activeId() { return activeId; } };
}
