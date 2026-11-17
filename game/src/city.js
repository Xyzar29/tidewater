// TIDEWATER — Port Serena: road grid, pastel towers, palms, beach, marina.
// Geometry is instanced / merged wherever counts are high (buildings, palms,
// streetlights) so the city stays cheap to render.

import { CITY } from './config.js';

function canvasTexture(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w || 128; c.height = h || 128;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); return t;
}

export function roadX(i) { return (i - (CITY.gridX - 1) / 2) * CITY.blockSize; }
export function roadZ(j) { return (j - (CITY.gridZ - 1) / 2) * CITY.blockSize; }

export function buildCity(scene, rng) {
  const colliders = []; // {x,z,hw,hd}
  const halfX = CITY.gridX * CITY.blockSize / 2 + 20;
  const halfZ = CITY.gridZ * CITY.blockSize / 2 + 20;

  // --- ground ---
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x9aa578 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2 + 300, halfZ * 2 + 300), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);

  // roads (dark planes slightly above ground)
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3d4148 });
  const sideMat = new THREE.MeshLambertMaterial({ color: 0xcfc4a8 });
  for (let i = 0; i < CITY.gridX; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, halfZ * 2), roadMat);
    m.rotation.x = -Math.PI / 2; m.position.set(roadX(i), 0.01, 0); scene.add(m);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth + 5, halfZ * 2), sideMat);
    s.rotation.x = -Math.PI / 2; s.position.set(roadX(i), 0.005, 0); scene.add(s);
  }
  for (let j = 0; j < CITY.gridZ; j++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, CITY.roadWidth), roadMat);
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.012, roadZ(j)); scene.add(m);
  }

  // --- buildings: instanced boxes with a lit-window canvas texture ---
  const winTex = canvasTexture((g, w, h) => {
    g.fillStyle = '#f7e8d0'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 6; y += 12) for (let x = 6; x < w - 6; x += 10) {
      g.fillStyle = rng.chance(0.35) ? '#ffd76e' : '#5b7d94';
      g.fillRect(x, y, 6, 7);
    }
  });
  const pastels = [0xf6c6a5, 0xf9e2ae, 0xbfe3dd, 0xf4b8c1, 0xc9d6f2, 0xfdf3d8, 0xd8ecc8];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const spots = [];
  for (let i = 0; i < CITY.gridX - 1; i++) for (let j = 0; j < CITY.gridZ - 1; j++) {
    const cx = (roadX(i) + roadX(i + 1)) / 2, cz = (roadZ(j) + roadZ(j + 1)) / 2;
    // skip landmark plots: marina (SE), warehouse (W), casino (NE), hospital (centre)
    if ((i === 5 && j === 4) || (i === 0 && j === 2) || (i === 5 && j === 0) || (i === 3 && j === 2)) continue;
    spots.push({ cx, cz });
  }
  const inst = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ map: winTex }), spots.length);
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  spots.forEach((s, k) => {
    const w = rng.range(11, 15), d = rng.range(11, 15), h = rng.range(10, 42);
    dummy.position.set(s.cx + rng.range(-2, 2), h / 2, s.cz + rng.range(-2, 2));
    dummy.scale.set(w, h, d); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    inst.setMatrixAt(k, dummy.matrix);
    inst.setColorAt(k, col.setHex(rng.pick(pastels)));
    colliders.push({ x: dummy.position.x, z: dummy.position.z, hw: w / 2, hd: d / 2 });
  });
  scene.add(inst);

  // landmark helper
  function landmark(x, z, w, h, d, color, label) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, h / 2, z); scene.add(m);
    colliders.push({ x, z, hw: w / 2, hd: d / 2 });
    if (label) scene.add(makeSign(label, x, h + 3, z));
    return m;
  }
  const marina = { x: roadX(5) + 17, z: roadZ(4) + 17 };
  const warehouse = { x: roadX(0) - 17, z: roadZ(2) };
  const casino = { x: roadX(5) + 17, z: roadZ(0) - 17 };
  const hospital = { x: roadX(3) + 17, z: roadZ(2) + 17 };
  const garage = { x: roadX(2) + 17, z: roadZ(4) + 17 };
  const hotel = { x: roadX(4) + 17, z: roadZ(5) - 6 };
  const safehouse = { x: roadX(1) + 17, z: roadZ(0) - 17 };
  landmark(marina.x, marina.z, 16, 7, 12, 0x7fb6c9, 'MARINA');
  landmark(warehouse.x, warehouse.z, 20, 9, 16, 0x8d99ae, 'WAREHOUSE');
  landmark(casino.x, casino.z, 18, 16, 14, 0xd9a441, 'CASINO');
  landmark(hospital.x, hospital.z, 16, 12, 12, 0xf2f2f2, 'HOSPITAL');
  landmark(garage.x, garage.z, 14, 6, 12, 0xe07a5f, "DARIO'S GARAGE");
  landmark(hotel.x, hotel.z, 16, 20, 12, 0xf4b8c1, 'SERENA HOTEL');
  landmark(safehouse.x, safehouse.z, 12, 8, 10, 0xbfe3dd, 'SAFEHOUSE');

  // --- palms: instanced trunks + frond cones ---
  const palmSpots = [];
  for (let n = 0; n < 90; n++) {
    const alongBeach = n < 40;
    const x = rng.range(-halfX + 6, halfX - 6);
    const z = alongBeach ? CITY.beachZ - rng.range(2, 14) : rng.range(-halfZ + 6, CITY.beachZ - 10);
    palmSpots.push({ x, z });
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 5), new THREE.MeshLambertMaterial({ color: 0x8a6d4b }), palmSpots.length);
  const frond = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0x3f9e4d }), palmSpots.length);
  palmSpots.forEach((p, k) => {
    dummy.position.set(p.x, 2.5, p.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(rng.range(-0.08, 0.08), 0, 0); dummy.updateMatrix(); trunk.setMatrixAt(k, dummy.matrix);
    dummy.position.set(p.x, 5.4, p.z); dummy.updateMatrix(); frond.setMatrixAt(k, dummy.matrix);
    colliders.push({ x: p.x, z: p.z, hw: 0.4, hd: 0.4 });
  });
  scene.add(trunk); scene.add(frond);

  // --- beach + animated water ---
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2 + 300, 60), new THREE.MeshLambertMaterial({ color: 0xf2ddae }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, CITY.beachZ + 22); scene.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2e86ab, transparent: true, opacity: 0.9 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2 + 300, 120), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.25, CITY.seaZ + 55); scene.add(water);

  // marina boats (simple hulls)
  for (let b = 0; b < 6; b++) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), new THREE.MeshLambertMaterial({ color: rng.pick([0xffffff, 0xe07a5f, 0x7fb6c9]) }));
    hull.position.set(marina.x - 20 + b * 7, 0.5, CITY.seaZ + 8); scene.add(hull);
  }

  // --- streetlights: instanced poles ---
  const lights = [];
  for (let i = 0; i < CITY.gridX; i++) for (let j = 0; j < CITY.gridZ; j++) lights.push({ x: roadX(i) + 7, z: roadZ(j) + 7 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 4), new THREE.MeshLambertMaterial({ color: 0x555f6e }), lights.length);
  lights.forEach((p, k) => { dummy.position.set(p.x, 3, p.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pole.setMatrixAt(k, dummy.matrix); });
  scene.add(pole);

  function makeSign(text, x, y, z) {
    const tex = canvasTexture((g, w, h) => {
      g.fillStyle = '#173f5f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe9a8'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
      g.fillText(text, w / 2, h / 2 + 8);
    }, 256, 64);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.set(x, y, z); return m;
  }

  return {
    colliders, water, halfX, halfZ,
    landmarks: { marina, warehouse, casino, hospital, garage, hotel, safehouse },
    update(dt, t) { water.position.y = 0.25 + Math.sin(t * 0.8) * 0.12; waterMat.opacity = 0.85 + Math.sin(t * 1.7) * 0.05; },
  };
}

export function collide(pos, radius, colliders) {
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const px = c.hw + radius - Math.abs(dx), pz = c.hd + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) pos.x += dx > 0 ? px : -px; else pos.z += dz > 0 ? pz : -pz;
    }
  }
}
