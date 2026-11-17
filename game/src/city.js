// city.js — builds Port Serena itself: the street grid with sidewalks, an
// instanced forest of pastel buildings with lit windows, palm trees,
// streetlights, named landmark buildings with signs, the beach, the marina
// and the animated sea. Also hands back the building colliders every other
// system collides against.

import {
  PITCH, ROAD_W, GRID, BEACH_Z, SEA_Z, LANDMARKS, FACADE_COLORS, districtAt,
} from './config.js';

const STREET_LINES = [];
for (let k = -GRID; k <= GRID; k++) STREET_LINES.push(k * PITCH);
const BLOCK_CENTERS = [];
for (let k = -GRID; k < GRID; k++) BLOCK_CENTERS.push(k * PITCH + PITCH / 2);

// A canvas facade: pale plaster with a grid of windows, a quarter of them
// lit warm. One texture serves every building; the instance colour tints it.
function facadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f5efe4';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const lit = ((row * 7 + col * 13) % 9) < 2;
      g.fillStyle = lit ? '#ffd98a' : '#5a6a7a';
      g.fillRect(10 + col * 23, 12 + row * 20, 14, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Asphalt with a dashed centre line, drawn along the canvas's vertical axis.
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3d4149';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#4a4f58';
  for (let i = 0; i < 300; i++) g.fillRect((i * 37) % 128, (i * 53) % 128, 2, 2);
  g.fillStyle = '#e8e4d2';
  g.fillRect(61, 6, 6, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A floating name sign for a landmark building.
function signSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,26,34,0.82)';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(4, 4, 504, 88);
  g.fillStyle = '#ffffff';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(22, 4.1, 1);
  return sprite;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- ground layers -------------------------------------------------
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x8f9a6b }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.06;
  group.add(grass);

  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0xaaa496 }),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = 0;
  slab.receiveShadow = true;
  group.add(slab);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(760, SEA_Z - BEACH_Z + 26),
    new THREE.MeshLambertMaterial({ color: 0xeccf9d }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (BEACH_Z + SEA_Z) / 2 + 6);
  sand.receiveShadow = true;
  group.add(sand);

  // ---- the sea (texture offset animated in update) -------------------
  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = 128; seaCanvas.height = 128;
  const sg = seaCanvas.getContext('2d');
  sg.fillStyle = '#2f8fb8';
  sg.fillRect(0, 0, 128, 128);
  sg.strokeStyle = 'rgba(255,255,255,0.25)';
  sg.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    sg.beginPath();
    sg.moveTo(0, 12 + i * 22);
    sg.bezierCurveTo(40, 4 + i * 22, 90, 20 + i * 22, 128, 12 + i * 22);
    sg.stroke();
  }
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(18, 6);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 320),
    new THREE.MeshPhongMaterial({ map: seaTex, color: 0x9fd4e8, shininess: 90, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, SEA_Z + 150);
  group.add(sea);

  // ---- roads ----------------------------------------------------------
  const roadTexNS = roadTexture();
  const totalLen = (GRID * 2 + 1) * PITCH + ROAD_W;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexNS });
  for (const x of STREET_LINES) {
    const t = roadTexNS.clone();
    t.needsUpdate = true;
    t.repeat.set(1, totalLen / 16);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, totalLen), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, 0);
    m.receiveShadow = true;
    group.add(m);
  }
  for (const z of STREET_LINES) {
    const t = roadTexNS.clone();
    t.needsUpdate = true;
    t.repeat.set(1, totalLen / 16);
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, totalLen), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 2;
    m.position.set(0, 0.03, z);
    m.receiveShadow = true;
    group.add(m);
  }
  void roadMat;

  // ---- sidewalks (one instanced mesh of kerb slabs) -------------------
  const walkGeo = new THREE.BoxGeometry(1, 0.18, 1);
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc9ba });
  const walks = [];
  for (const s of STREET_LINES) {
    for (let k = -GRID; k < GRID; k++) {
      const mid = k * PITCH + PITCH / 2;
      const len = PITCH - ROAD_W;
      walks.push({ x: s - ROAD_W / 2 - 1.6, z: mid, w: 3.2, d: len });
      walks.push({ x: s + ROAD_W / 2 + 1.6, z: mid, w: 3.2, d: len });
      walks.push({ x: mid, z: s - ROAD_W / 2 - 1.6, w: len, d: 3.2 });
      walks.push({ x: mid, z: s + ROAD_W / 2 + 1.6, w: len, d: 3.2 });
    }
  }
  const walkMesh = new THREE.InstancedMesh(walkGeo, walkMat, walks.length);
  {
    const m4 = new THREE.Matrix4();
    walks.forEach((w, i) => {
      m4.makeScale(w.w, 1, w.d);
      m4.setPosition(w.x, 0.09, w.z);
      walkMesh.setMatrixAt(i, m4);
    });
  }
  walkMesh.receiveShadow = true;
  group.add(walkMesh);

  // ---- buildings --------------------------------------------------------
  // Decide every building first, then instance them in one mesh. Instance
  // colours are written for every slot up front (the colour buffer is sized
  // from the mesh count, so it must never be grown after first render).
  const landmarkSpots = [
    { x: -146, z: 26, w: 26, d: 16, h: 7, color: 0xe8845a, sign: "DARIO'S GARAGE", signColor: '#ffb35c' },
    { x: 62, z: 150, w: 30, d: 18, h: 17, color: 0xfdf3c9, sign: 'SERENA HOTEL', signColor: '#ffd94d' },
    { x: 172, z: -64, w: 20, d: 34, h: 11, color: 0x7d8ea3, sign: 'PIER 9 WAREHOUSE', signColor: '#9fd4ff' },
    { x: 84, z: -140, w: 30, d: 20, h: 15, color: 0x8e6cc9, sign: 'CASINO SERENA', signColor: '#e0aaff' },
    { x: -84, z: -140, w: 30, d: 18, h: 13, color: 0xf5f7fa, sign: 'SERENA GENERAL', signColor: '#ff7b7b' },
    { x: 30, z: -128, w: 26, d: 16, h: 12, color: 0x4a6fa5, sign: 'PSPD PRECINCT', signColor: '#7fb2ff' },
    { x: -146, z: 132, w: 16, d: 14, h: 7, color: 0xf3c6c6, sign: 'SAFEHOUSE', signColor: '#ffb3c1' },
  ];
  const buildings = [];
  const nearLandmark = (x, z) => landmarkSpots.some((s) => Math.abs(s.x - x) < 30 && Math.abs(s.z - z) < 30);

  for (const cx of BLOCK_CENTERS) {
    for (const cz of BLOCK_CENTERS) {
      const district = districtAt(cx, cz);
      if (district === 'DOCKSIDE') {
        // One broad warehouse per dockside block.
        if (nearLandmark(cx, cz)) continue;
        buildings.push({
          x: cx, z: cz, w: 30, d: 30, h: rng.range(8, 12),
          color: rng.pick([0x8fa3b8, 0x7d8ea3, 0x9db4a0, 0xa89a86]),
        });
        continue;
      }
      // 2x2 plots per block, most of them built on.
      for (const ox of [-10.5, 10.5]) {
        for (const oz of [-10.5, 10.5]) {
          const x = cx + ox + rng.range(-1.5, 1.5);
          const z = cz + oz + rng.range(-1.5, 1.5);
          if (nearLandmark(x, z)) continue;
          if (rng.chance(0.14)) continue; // the odd empty lot / car park
          let h;
          if (district === 'DOWNTOWN') h = rng.range(26, 54);
          else if (district === 'MIDTOWN') h = rng.range(13, 28);
          else if (district === 'BEACHFRONT') h = rng.range(9, 20);
          else h = rng.range(6, 11); // suburbs stay low
          buildings.push({
            x, z,
            w: rng.range(13, 18), d: rng.range(13, 18), h,
            color: rng.pick(FACADE_COLORS),
          });
        }
      }
    }
  }
  for (const s of landmarkSpots) {
    buildings.push({ x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, color: s.color });
  }

  const facade = facadeTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const boxMat = new THREE.MeshLambertMaterial({ map: facade });
  const boxMesh = new THREE.InstancedMesh(boxGeo, boxMat, buildings.length);
  {
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    buildings.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d);
      m4.setPosition(b.x, 0, b.z);
      boxMesh.setMatrixAt(i, m4);
      boxMesh.setColorAt(i, col.setHex(b.color));
      colliders.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 });
    });
    boxMesh.instanceColor.needsUpdate = true;
  }
  boxMesh.castShadow = true;
  boxMesh.receiveShadow = true;
  group.add(boxMesh);

  for (const s of landmarkSpots) {
    const sign = signSprite(s.sign, s.signColor);
    sign.position.set(s.x, s.h + 3.4, s.z);
    group.add(sign);
  }

  // ---- palms and shade trees (instanced trunks + crowns) ---------------
  const palmSpots = [];
  for (let x = -186; x <= 186; x += 15) {
    palmSpots.push({ x: x + rng.range(-2, 2), z: 181 + rng.range(-2, 2) });
    if (rng.chance(0.6)) palmSpots.push({ x: x + rng.range(-3, 3), z: 200 + rng.range(0, 8) });
  }
  palmSpots.push({ x: -136, z: 22 }, { x: -164, z: 22 }, { x: 48, z: 160 }, { x: 76, z: 160 });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.6, 6);
  trunkGeo.translate(0, 2.8, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7b58 });
  const crownGeo = new THREE.ConeGeometry(3.1, 1.9, 8);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x4da653 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    palmSpots.forEach((p, i) => {
      e.set(rng.range(-0.09, 0.09), rng.range(0, 6.28), rng.range(-0.09, 0.09));
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, one);
      trunks.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(p.x + e.z * -4, 5.9, p.z + e.x * 4), q, one);
      crowns.setMatrixAt(i, m4);
    });
  }
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // ---- streetlights ------------------------------------------------------
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x5a6068 });
  const lampGeo = new THREE.BoxGeometry(0.5, 0.22, 1.4);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lightSpots = [];
  for (const x of STREET_LINES) {
    for (const z of STREET_LINES) {
      lightSpots.push({ x: x + 8.6, z: z + 8.6 });
      lightSpots.push({ x: x - 8.6, z: z - 8.6 });
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightSpots.length);
  {
    const m4 = new THREE.Matrix4();
    lightSpots.forEach((p, i) => {
      m4.identity();
      m4.setPosition(p.x, 0, p.z);
      poles.setMatrixAt(i, m4);
      m4.setPosition(p.x, 5.6, p.z);
      lamps.setMatrixAt(i, m4);
    });
  }
  group.add(poles);
  group.add(lamps);

  // ---- marina: pier and bobbing boats ------------------------------------
  const boats = [];
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.7, 52),
    new THREE.MeshLambertMaterial({ color: 0xa0825f }),
  );
  pier.position.set(148, 0.25, 232);
  group.add(pier);
  colliders.push({ x0: 140, z0: 206, x1: 156, z1: 258 });
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e6 });
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x3d7bd9 });
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 8), hullMat);
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 3), cabinMat);
    cabin.position.set(0, 1.4, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 5), poleMat);
    mast.position.set(0, 3.6, 1.6);
    boat.add(mast);
    const side = i % 2 === 0 ? -1 : 1;
    boat.position.set(148 + side * 13, -0.2, 216 + Math.floor(i / 2) * 15);
    boat.rotation.y = rng.range(-0.15, 0.15);
    group.add(boat);
    boats.push({ mesh: boat, phase: rng.range(0, 6.28), baseY: -0.2 });
  }

  // ---- beach umbrellas -----------------------------------------------------
  const umbGeo = new THREE.ConeGeometry(2.2, 0.9, 8);
  const umbMats = [0xff8fa3, 0xffd94d, 0x6ce0d4, 0xff9d5c].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  for (let i = 0; i < 12; i++) {
    const x = -170 + i * 30 + rng.range(-6, 6);
    const z = 204 + rng.range(-4, 10);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), poleMat);
    pole.position.set(x, 1.3, z);
    group.add(pole);
    const top = new THREE.Mesh(umbGeo, umbMats[i % umbMats.length]);
    top.position.set(x, 2.7, z);
    top.castShadow = true;
    group.add(top);
  }

  let elapsed = 0;
  return {
    colliders,
    districtAt,
    update(dt) {
      elapsed += dt;
      seaTex.offset.y = (elapsed * 0.014) % 1;
      seaTex.offset.x = Math.sin(elapsed * 0.11) * 0.02;
      for (const b of boats) {
        b.mesh.position.y = b.baseY + Math.sin(elapsed * 1.3 + b.phase) * 0.16;
        b.mesh.rotation.z = Math.sin(elapsed * 0.9 + b.phase) * 0.03;
      }
    },
  };
}
