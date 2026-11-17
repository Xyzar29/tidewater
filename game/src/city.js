// city.js — Port Serena itself: the road grid, instanced pastel towers with lit
// windows, landmark buildings with signs, palms, streetlights, the beach, the
// marina and the sea. Also owns the AABB collision set every mover uses.
import { STREETS, ROAD_HALF, BLOCK_HALF, BEACH_Z, SEA_Z, districtAt } from './config.js';
import { randRange, pick } from './random.js';

const BLOCK_CENTERS = [-150, -90, -30, 30, 90, 150];
const PASTELS = [0xf2d5c4, 0xf5e6c8, 0xdfe8dd, 0xcfe0ea, 0xf3c6c6, 0xe6d7f0, 0xf7ead1, 0xd8ecdf, 0xfae3b2, 0xcfe3d8];
// Blocks (by centre) that hold a named landmark instead of random towers.
const LANDMARK_BLOCKS = { '-150,-150': 'garage', '-30,-150': 'casino', '90,-90': 'precinct', '-150,30': 'hospital', '-90,90': 'safehouse', '30,150': 'hotel', '150,150': 'warehouse' };

function facadeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4efe6'; x.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 14; r++) for (let col = 0; col < 6; col++) {
    const v = Math.random();
    x.fillStyle = v < 0.2 ? '#ffd98c' : (v < 0.82 ? '#46586c' : '#7d93a8');
    x.fillRect(10 + col * 19, 12 + r * 17, 12, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 96);
  x.fillStyle = fg; x.font = 'bold 52px Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function seaTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#2f9db4'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * 128, sx = Math.random() * 128;
    x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + 14 + Math.random() * 22, y); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 5);
  return t;
}

// Push a circle (pos.x/pos.z, radius r) out of every building AABB. Returns true on a hit.
export function collideCircle(pos, r, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const nx = Math.max(b.x1, Math.min(pos.x, b.x2));
    const nz = Math.max(b.z1, Math.min(pos.z, b.z2));
    let dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const pl = pos.x - b.x1, pr = b.x2 - pos.x, pt = pos.z - b.z1, pb = b.z2 - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.x1 - r; else if (m === pr) pos.x = b.x2 + r;
      else if (m === pt) pos.z = b.z1 - r; else pos.z = b.z2 + r;
    }
  }
  pos.x = Math.max(-256, Math.min(256, pos.x));
  pos.z = Math.max(-256, Math.min(258, pos.z));
  return hit;
}

export function isRoad(x, z) {
  for (const c of STREETS) if (Math.abs(x - c) <= ROAD_HALF || Math.abs(z - c) <= ROAD_HALF) return true;
  return false;
}

export function createCity(scene, rng) {
  const colliders = [];
  const addCollider = (x, z, w, d) => colliders.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2 });

  // — light: a permanent golden afternoon —
  scene.add(new THREE.HemisphereLight(0xffe3b8, 0x8a7a5f, 0.8));
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -115; sun.shadow.camera.right = 115;
  sun.shadow.camera.top = 115; sun.shadow.camera.bottom = -115;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 340;
  sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.Fog(0xf6cf9a, 190, 620);
  scene.background = new THREE.Color(0xf2cf9e);

  // — ground, roads, dashes, sidewalks —
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1150, 1150),
    new THREE.MeshLambertMaterial({ color: 0xa39a83 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x353c44 });
  for (const c of STREETS) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(16, 432), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.02, 0); v.receiveShadow = true; scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(432, 16), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, c); h.receiveShadow = true; scene.add(h);
  }
  { // centre dashes, one instanced mesh
    const mats = [];
    const dummy = new THREE.Object3D();
    for (const c of STREETS) for (let p = -207; p <= 207; p += 9) {
      if (STREETS.some(s => Math.abs(p - s) < 11)) continue;
      mats.push([c, p, 0]); mats.push([p, c, 1]);
    }
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.02, 3),
      new THREE.MeshLambertMaterial({ color: 0xd8d8ce }), mats.length);
    mats.forEach((m, i) => {
      dummy.position.set(m[0], 0.035, m[1]);
      dummy.rotation.set(0, m[2] ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix(); dashes.setMatrixAt(i, dummy.matrix);
    });
    scene.add(dashes);
  }
  { // sidewalk slabs under each block
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(49, 0.12, 49),
      new THREE.MeshLambertMaterial({ color: 0xcdc5b2 }), 36);
    const dummy = new THREE.Object3D(); let i = 0;
    for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
      dummy.position.set(bx, 0.06, bz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      slabs.setMatrixAt(i++, dummy.matrix);
    }
    slabs.receiveShadow = true;
    scene.add(slabs);
  }

  // — buildings: one instanced mesh, pastel tints, facade texture —
  const facade = facadeTexture();
  const boxes = [];
  const queueBox = (x, z, w, d, h, color) => { boxes.push({ x, z, w, d, h, color }); addCollider(x, z, w, d); };
  const heightFor = (district) => district === 'DOWNTOWN' ? randRange(rng, 26, 52)
    : district === 'MIDTOWN' ? randRange(rng, 15, 30)
    : district === 'BEACHFRONT' ? randRange(rng, 9, 18)
    : district === 'DOCKSIDE' ? randRange(rng, 9, 15) : randRange(rng, 6, 11);
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    if (LANDMARK_BLOCKS[bx + ',' + bz]) continue;
    const district = districtAt(bx, bz);
    const roll = rng();
    if (roll < 0.4) {
      queueBox(bx, bz, randRange(rng, 24, 33), randRange(rng, 24, 33), heightFor(district), pick(rng, PASTELS));
    } else if (roll < 0.78) {
      for (const ox of [-11, 11]) for (const oz of [-11, 11])
        queueBox(bx + ox, bz + oz, randRange(rng, 12, 16), randRange(rng, 12, 16), heightFor(district) * randRange(rng, 0.6, 1), pick(rng, PASTELS));
    } else {
      for (const ox of [-11.5, 11.5])
        queueBox(bx + ox, bz, randRange(rng, 15, 19), randRange(rng, 26, 32), heightFor(district) * 0.8, pick(rng, PASTELS));
    }
  }
  const buildingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ map: facade }), boxes.length);
  { const dummy = new THREE.Object3D(); const col = new THREE.Color();
    boxes.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2 + 0.12, b.z);
      dummy.scale.set(b.w, b.h, b.d); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      buildingMesh.setMatrixAt(i, dummy.matrix);
      buildingMesh.setColorAt(i, col.setHex(b.color));
    });
    buildingMesh.castShadow = true; buildingMesh.receiveShadow = true;
    scene.add(buildingMesh);
  }

  // — landmark buildings: solid colours + signs —
  const solid = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }));
  function landmark(x, z, w, h, d, color, signText, signBg, signFg, face) {
    const m = solid(w, h, d, color);
    m.position.set(x, h / 2 + 0.12, z); m.castShadow = true; m.receiveShadow = true;
    scene.add(m); addCollider(x, z, w, d);
    if (signText) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.86, 20), 2.6),
        new THREE.MeshBasicMaterial({ map: signTexture(signText, signBg, signFg) }));
      if (face === 'south') { s.position.set(x, h - 1.8, z + d / 2 + 0.07); }
      else { s.position.set(x, h - 1.8, z - d / 2 - 0.07); s.rotation.y = Math.PI; }
      scene.add(s);
    }
    return m;
  }
  landmark(-150, -156, 32, 9, 24, 0x7f8ea0, "DARIO'S GARAGE", '#31404f', '#ffc93c', 'south');
  landmark(-30, -152, 30, 17, 26, 0x6d4a7a, 'CASINO SERENA', '#2c1e38', '#ffd76a', 'south');
  landmark(90, -92, 26, 13, 22, 0x5a6a80, 'PSPD', '#22304a', '#ffffff', 'south');
  landmark(-150, 32, 26, 19, 26, 0xe8e6df, 'HOSPITAL', '#f4f4f4', '#c03030', 'north');
  landmark(-90, 92, 14, 7, 12, 0xd9b36a, null);
  landmark(30, 152, 24, 32, 24, 0xe8a0a8, 'SERENA HOTEL', '#7a3049', '#ffffff', 'north');
  landmark(150, 165, 38, 13, 26, 0x77828e, 'PIER 9', '#37424c', '#ffc93c', 'north');
  // crates in the warehouse yard — cover for the Cold Trail fight
  for (const [cx, cz] of [[138, 138], [160, 136], [146, 146], [156, 147], [134, 146]]) {
    const crate = solid(2.4, 2.4, 2.4, 0x9a7d55);
    crate.position.set(cx, 1.32, cz); crate.castShadow = true; scene.add(crate);
    addCollider(cx, cz, 2.4, 2.4);
  }

  // — palms: instanced trunks + crowns (instance colour pre-allocated in full) —
  const palmSpots = [];
  for (let x = -200; x <= 200; x += 15) { if (x < 92 || x > 178) palmSpots.push([x + randRange(rng, -2, 2), 202]); }
  for (let x = -190; x <= 200; x += 23) palmSpots.push([x + 6, 219]);
  for (let x = -195; x <= 195; x += 30) palmSpots.push([x, 106]);
  for (let x = -195; x <= 195; x += 34) palmSpots.push([x + 8, -106]);
  {
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.24, 5.6, 5),
      new THREE.MeshLambertMaterial({ color: 0x8a6b4a }), palmSpots.length);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.05, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff }), palmSpots.length);
    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    palmSpots.forEach((p, i) => {
      const tilt = randRange(rng, -0.07, 0.07);
      dummy.position.set(p[0], 2.8, p[1]); dummy.rotation.set(tilt, 0, tilt * 0.7); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p[0] + tilt * 5, 5.9, p[1]); dummy.scale.set(1, 0.42, 1); dummy.rotation.set(0, rng() * 3, 0);
      dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, col.setHSL(0.29 + rng() * 0.05, 0.5, 0.32 + rng() * 0.12));
    });
    trunks.castShadow = true; crowns.castShadow = true;
    scene.add(trunks); scene.add(crowns);
  }

  // — streetlights at intersection corners —
  {
    const spots = [];
    for (const sx of STREETS) for (const sz of STREETS) { spots.push([sx + 10.4, sz - 10.4]); spots.push([sx - 10.4, sz + 10.4]); }
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x3c4148 }), spots.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.14, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((p, i) => {
      dummy.rotation.set(0, 0, 0); dummy.position.set(p[0], 2.7, p[1]); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p[0], 5.45, p[1]); dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    scene.add(poles); scene.add(heads);
  }

  // — beach, sea, marina —
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1150, 40),
    new THREE.MeshLambertMaterial({ color: 0xe9d189 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, 227); sand.receiveShadow = true; scene.add(sand);
  const seaTex = seaTexture();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1150, 480),
    new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.94 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.1, SEA_Z + 240); scene.add(sea);

  const boats = [];
  for (const dx of [105, 130, 155]) {
    const dock = solid(4, 0.35, 30, 0x8a6f4d);
    dock.position.set(dx, 0.28, 258); scene.add(dock);
  }
  const boatColors = [0xf2f2f2, 0x7fc4d8, 0xf0b26b, 0xe88a8a, 0xbfe3c0, 0xf7ead1];
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Group();
    const hull = solid(2.6, 1.0, 7, boatColors[i]); hull.position.y = 0.4; boat.add(hull);
    const cab = solid(1.8, 0.9, 2.4, 0xffffff); cab.position.set(0, 1.2, -0.4); boat.add(cab);
    boat.position.set(96 + i * 13 + randRange(rng, -2, 2), 0.15, 252 + (i % 3) * 13);
    boat.rotation.y = randRange(rng, -0.2, 0.2);
    scene.add(boat); boats.push({ mesh: boat, phase: rng() * 6 });
  }
  // beach umbrellas
  for (let i = 0; i < 14; i++) {
    const ux = randRange(rng, -200, 200), uz = randRange(rng, 214, 240);
    if (ux > 92 && ux < 178 && uz > 230) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    pole.position.set(ux, 1.3, uz); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.8, 7),
      new THREE.MeshLambertMaterial({ color: pick(rng, [0xff6b6b, 0xffc93c, 0x4ecdc4, 0xff9ff3]) }));
    top.position.set(ux, 2.7, uz); top.castShadow = true; scene.add(top);
  }

  return {
    colliders,
    followSun(px, pz) {
      sun.position.set(px + 70, 95, pz + 35);
      sun.target.position.set(px, 0, pz);
      sun.target.updateMatrixWorld();
    },
    update(dt, t) {
      seaTex.offset.x = t * 0.014; seaTex.offset.y = Math.sin(t * 0.24) * 0.012;
      for (const b of boats) {
        b.mesh.position.y = 0.15 + Math.sin(t * 0.9 + b.phase) * 0.11;
        b.mesh.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
      }
    },
  };
}
