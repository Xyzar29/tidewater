// city.js — Port Serena itself: sky, sun, ground, instanced pastel buildings
// with lit windows, palms, streetlights, beach + sea, the marina, landmark
// buildings with signs, and the static collision set every mover queries.

import {
  ROADS_X, ROADS_Z, BEACH_ROAD_Z, ROAD_HALF, BOUNDS, BUILDING_TINTS, LANDMARKS,
} from './config.js';

const BLOCK_X = [-225, -135, -45, 45, 135, 225];
const BLOCK_Z = [-225, -135, -45, 45, 135];

// Which blocks hold a landmark instead of generic buildings.
const LANDMARK_BLOCKS = {
  '-225,-135': 'hospital',
  '45,-225': 'precinct',
  '135,45': 'garage',
  '45,206': 'hotel',
  '225,-45': 'casino',
  '225,135': 'warehouse',
  '-225,-225': 'safehouse',
};

export function districtAt(x, z) {
  if (z >= 196) return 'BEACHFRONT';
  if (x >= 182 && z >= -60) return 'DOCKSIDE';
  if (Math.abs(x) <= 140 && Math.abs(z) <= 140) return 'DOWNTOWN';
  if (z <= -196 || x <= -196) return 'SUBURBS';
  return 'MIDTOWN';
}

// --- canvas texture helpers -------------------------------------------------

function windowTexture(rng, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12, cw = 128 / cols, ch = 256 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const r = rng.float();
      g.fillStyle = r < litRatio ? '#ffb84d' : (r < litRatio + 0.45 ? '#39434e' : '#6b7885');
      g.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function signTexture(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#16324a';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#f2c14e';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#fdf6df';
  g.font = 'bold 52px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 48 : 64);
  if (sub) {
    g.font = '24px Georgia, serif';
    g.fillStyle = '#f2c14e';
    g.fillText(sub, 256, 94);
  }
  return new THREE.CanvasTexture(c);
}

// Ground: one big canvas painting roads, dashes, sidewalks, blocks and sand.
function groundTexture() {
  const S = 2048, world = 680, s = S / world;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (x) => (x + 340) * s;
  const py = (z) => (340 - z) * s;
  const rect = (x, z, w, d, fill) => {
    g.fillStyle = fill;
    g.fillRect(px(x - w / 2), py(z + d / 2), w * s, d * s);
  };
  rect(0, 0, world, world, '#ddd5bf'); // base block concrete
  // suburb greenery tint on the north/west blocks
  for (const bx of BLOCK_X) for (const bz of BLOCK_Z) {
    if (bz <= -196 || bx <= -196) rect(bx, bz, 82, 82, '#cfdfae');
    if (bx >= 182 && bz >= 45) rect(bx, bz, 82, 82, '#c8c8c2');
  }
  rect(0, 292, world, 96, '#eed9a4'); // beach sand south of the promenade
  rect(284, 218, 76, 48, '#b3a586'); // marina gravel lot
  // sidewalks: pale aprons around every block
  for (const bx of BLOCK_X) for (const bz of BLOCK_Z) rect(bx, bz, 82, 82, '#c9c0aa');
  for (const bx of BLOCK_X) rect(bx, 206, 82, 44, '#c9c0aa');
  // asphalt
  const roadFill = '#42474d';
  for (const rx of ROADS_X) rect(rx, -40, ROAD_HALF * 2, 560, roadFill);
  for (const rz of ROADS_Z) rect(0, rz, world, ROAD_HALF * 2, roadFill);
  rect(0, BEACH_ROAD_Z, world, ROAD_HALF * 2, roadFill);
  // block interiors back on top of the sidewalk aprons
  for (const bx of BLOCK_X) for (const bz of BLOCK_Z) {
    const fill = (bz <= -196 || bx <= -196) ? '#c3d69e' : '#d5cdb6';
    rect(bx, bz, 74, 74, bx >= 182 && bz >= 45 ? '#bcbcb4' : fill);
  }
  for (const bx of BLOCK_X) rect(bx, 206, 74, 36, '#d5cdb6');
  // centre dashes
  g.fillStyle = '#e8e6da';
  const dash = (x, z, w, d) => g.fillRect(px(x - w / 2), py(z + d / 2), w * s, d * s);
  for (const rx of ROADS_X) for (let z = -316; z < 224; z += 12) dash(rx, z, 0.35, 5.5);
  for (const rz of ROADS_Z) for (let x = -316; x < 316; x += 12) dash(x, rz, 5.5, 0.35);
  for (let x = -316; x < 316; x += 12) dash(x, BEACH_ROAD_Z, 5.5, 0.35);
  // crosswalks at intersections
  g.fillStyle = 'rgba(240,240,235,0.85)';
  const allZ = [...ROADS_Z, BEACH_ROAD_Z];
  for (const rx of ROADS_X) for (const rz of allZ) {
    for (let i = -2; i <= 2; i++) {
      g.fillRect(px(rx + i * 3 - 1), py(rz - ROAD_HALF - 2.4), 2 * s, 2.2 * s);
      g.fillRect(px(rx + i * 3 - 1), py(rz + ROAD_HALF + 0.2), 2 * s, 2.2 * s);
      g.fillRect(px(rx - ROAD_HALF - 2.4), py(rz + i * 3 + 1), 2.2 * s, 2 * s);
      g.fillRect(px(rx + ROAD_HALF + 0.2), py(rz + i * 3 + 1), 2.2 * s, 2 * s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function seaTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7fd4d9');
  grad.addColorStop(0.25, '#4fb8cf');
  grad.addColorStop(1, '#2f7fb8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(Math.random() * 200, y);
    g.lineTo(Math.random() * 200 + 40, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 5);
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#5fb2e5');
  grad.addColorStop(0.45, '#a8d8ee');
  grad.addColorStop(0.72, '#fdeecb');
  grad.addColorStop(0.85, '#ffd9a0');
  grad.addColorStop(1, '#ffca8a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 512);
  return new THREE.CanvasTexture(c);
}

// --- colliders ---------------------------------------------------------------

function addCollider(G, x, z, w, d) {
  const box = { x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2 };
  G.colliders.push(box);
  const key = (v) => Math.floor((v + 360) / 90);
  for (let i = key(box.x1); i <= key(box.x2); i++) {
    for (let j = key(box.z1); j <= key(box.z2); j++) {
      const k = i + ':' + j;
      if (!G.colliderGrid.has(k)) G.colliderGrid.set(k, []);
      G.colliderGrid.get(k).push(box);
    }
  }
}

// Push a circle (obj.x/obj.z, radius r) out of every building AABB and clamp
// it to the playable bounds. Returns true if it hit anything.
export function collideCircle(G, obj, r) {
  let hit = false;
  const key = (v) => Math.floor((v + 360) / 90);
  const ci = key(obj.x), cj = key(obj.z);
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      const cell = G.colliderGrid.get(i + ':' + j);
      if (!cell) continue;
      for (const b of cell) {
        const nx = Math.max(b.x1, Math.min(obj.x, b.x2));
        const nz = Math.max(b.z1, Math.min(obj.z, b.z2));
        let dx = obj.x - nx, dz = obj.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          obj.x = nx + (dx / d) * r;
          obj.z = nz + (dz / d) * r;
        } else {
          // centre inside the box: leave by the shallowest face
          const pl = obj.x - b.x1, pr = b.x2 - obj.x, pt = obj.z - b.z1, pb = b.z2 - obj.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) obj.x = b.x1 - r;
          else if (m === pr) obj.x = b.x2 + r;
          else if (m === pt) obj.z = b.z1 - r;
          else obj.z = b.z2 + r;
        }
      }
    }
  }
  if (obj.x < BOUNDS.minX) { obj.x = BOUNDS.minX; hit = true; }
  if (obj.x > BOUNDS.maxX) { obj.x = BOUNDS.maxX; hit = true; }
  if (obj.z < BOUNDS.minZ) { obj.z = BOUNDS.minZ; hit = true; }
  if (obj.z > BOUNDS.maxSandZ) { obj.z = BOUNDS.maxSandZ; hit = true; }
  return hit;
}

// --- main build ---------------------------------------------------------------

export function createCity(G) {
  const { scene, rng } = G;
  scene.fog = new THREE.Fog(0xf6ddba, 210, 980);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1150, 20, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // lights
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xe8d0a0, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfae, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  G.sun = sun;

  // apron + ground + sea
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshLambertMaterial({ color: 0xe3d3a8 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.08;
  scene.add(apron);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(680, 680),
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const seaTex = seaTexture();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 460),
    new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.94 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, 296 + 230);
  scene.add(sea);
  G.seaTex = seaTex;

  buildBlocks(G);
  buildMarina(G);
  buildPalms(G);
  buildStreetlights(G);
  buildBeachProps(G);

  return {
    update(dt, t) {
      // gentle sea shimmer + bobbing boats + sun shadow box follows the player
      seaTex.offset.y = (t * 0.008) % 1;
      for (const b of G.boats) {
        b.position.y = Math.sin(t * 0.9 + b.userData.phase) * 0.14;
        b.rotation.z = Math.sin(t * 0.7 + b.userData.phase) * 0.02;
      }
      const p = G.player;
      if (p && G.sun) {
        const sx = Math.round(p.x / 8) * 8, sz = Math.round(p.z / 8) * 8;
        G.sun.position.set(sx + 240, 300, sz + 130);
        G.sun.target.position.set(sx, 0, sz);
      }
    },
  };
}

function buildBlocks(G) {
  const { scene, rng } = G;
  const variants = [windowTexture(rng.fork('win0'), 0.34), windowTexture(rng.fork('win1'), 0.22), windowTexture(rng.fork('win2'), 0.45)];
  const placements = [[], [], []]; // per texture variant

  function place(x, z, w, d, h, tint) {
    placements[Math.floor(rng.float() * 3)].push({ x, z, w, d, h, tint });
    addCollider(G, x, z, w, d);
  }

  function genericBlock(bx, bz) {
    const brng = rng.fork('block' + bx + ',' + bz);
    const district = districtAt(bx, bz);
    const spots = [
      [-19, -19], [19, -19], [-19, 19], [19, 19],
    ];
    if (district === 'DOWNTOWN') {
      for (const [ox, oz] of spots) {
        if (brng.chance(0.12)) continue;
        place(bx + ox + brng.range(-3, 3), bz + oz + brng.range(-3, 3),
          brng.range(22, 30), brng.range(22, 30), brng.range(38, 80), brng.pick(BUILDING_TINTS));
      }
    } else if (district === 'SUBURBS') {
      const houses = [[-22, -20], [0, -21], [22, -20], [-22, 8], [0, 9], [22, 8], [-11, 26], [13, 26]];
      for (const [ox, oz] of houses) {
        place(bx + ox, bz + oz, brng.range(11, 14), brng.range(10, 13), brng.range(5.5, 8.5), brng.pick(BUILDING_TINTS));
      }
    } else if (district === 'DOCKSIDE') {
      place(bx - 8, bz - 10, brng.range(38, 48), brng.range(28, 36), brng.range(9, 13), 0xb9c0c4);
      if (brng.chance(0.7)) place(bx + 14, bz + 20, 22, 18, brng.range(7, 10), 0xaeb6ba);
    } else { // MIDTOWN
      for (const [ox, oz] of spots) {
        if (brng.chance(0.2)) continue;
        place(bx + ox + brng.range(-3, 3), bz + oz + brng.range(-3, 3),
          brng.range(20, 28), brng.range(20, 28), brng.range(15, 36), brng.pick(BUILDING_TINTS));
      }
    }
  }

  function landmarkBlock(kind, bx, bz) {
    const defs = {
      hospital: { w: 46, d: 32, h: 26, tint: 0xf4f6f6, sign: ['SERENA GENERAL', 'HOSPITAL'] },
      precinct: { w: 38, d: 28, h: 19, tint: 0xcfd8de, sign: ['PSPD', 'PRECINCT'] },
      garage: { w: 42, d: 26, h: 9, tint: 0xe8d9b8, sign: ["DARIO'S GARAGE", 'REPAIRS · TUNING'] },
      hotel: { w: 48, d: 18, h: 31, tint: 0xf6c9d4, sign: ['SERENA HOTEL', ''] },
      casino: { w: 46, d: 36, h: 22, tint: 0xd9c6f0, sign: ['CASINO SERENA', ''] },
      warehouse: { w: 58, d: 42, h: 13, tint: 0xb4bcc0, sign: ['PIER 9', 'FREIGHT & STORAGE'] },
      safehouse: { w: 13, d: 11, h: 6.5, tint: 0xf3e2b8, sign: null },
    };
    const def = defs[kind];
    const cz = kind === 'hotel' ? bz : bz - 4;
    place(bx, cz, def.w, def.d, def.h, def.tint);
    if (def.sign) {
      const tex = signTexture(def.sign[0], def.sign[1]);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(def.w * 0.72, def.w * 0.72 * 0.25),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      sign.position.set(bx, def.h * 0.62, cz + def.d / 2 + 0.15);
      G.scene.add(sign);
    }
    if (kind === 'warehouse') {
      // crate stacks on the apron in front of Pier 9
      const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9805a });
      const crateGeo = new THREE.BoxGeometry(2.6, 2.6, 2.6);
      const spots = [[204, 162], [207.5, 162], [204, 158.5], [244, 160], [248, 164], [228, 166]];
      for (const [cx, cz2] of spots) {
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.set(cx, 1.3, cz2);
        crate.castShadow = true;
        G.scene.add(crate);
        addCollider(G, cx, cz2, 2.6, 2.6);
      }
    }
  }

  for (const bx of BLOCK_X) {
    for (const bz of BLOCK_Z) {
      const kind = LANDMARK_BLOCKS[bx + ',' + bz];
      if (kind) landmarkBlock(kind, bx, bz);
      else genericBlock(bx, bz);
    }
    const hk = LANDMARK_BLOCKS[bx + ',206'];
    if (hk) landmarkBlock(hk, bx, 206);
    else {
      // beachfront row: two pastel hotels per block
      const brng = rng.fork('beach' + bx);
      place(bx - 18, 205, 26, 20, brng.range(18, 30), brng.pick(BUILDING_TINTS));
      place(bx + 18, 205, 26, 20, brng.range(18, 30), brng.pick(BUILDING_TINTS));
    }
  }

  // instanced meshes per window-texture variant + shared roof slabs
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.BoxGeometry(1, 0.5, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8d8172 });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let roofCount = 0;
  for (const list of placements) roofCount += list.length;
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, roofCount);
  roofs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(roofCount * 3), 3);
  let ri = 0;
  placements.forEach((list, vi) => {
    if (!list.length) return;
    const mat = new THREE.MeshLambertMaterial({ map: variants[vi] });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, list.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    list.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex(b.tint));
      dummy.position.set(b.x, b.h + 0.25, b.z);
      dummy.scale.set(b.w + 0.5, 1, b.d + 0.5);
      dummy.updateMatrix();
      roofs.setMatrixAt(ri, dummy.matrix);
      roofs.setColorAt(ri, color.setHex(0x9a8d7a).offsetHSL(0, 0, (i % 5) * 0.012));
      ri++;
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    G.scene.add(mesh);
  });
  roofs.count = ri;
  G.scene.add(roofs);
}

function buildMarina(G) {
  const { scene } = G;
  // pier deck reaching into the water
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7c58 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 64), deckMat);
  deck.position.set(282, 0.5, 268);
  deck.receiveShadow = true;
  scene.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e573c });
  for (let i = 0; i < 6; i++) {
    for (const sx of [-7, 7]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(282 + sx, 0, 244 + i * 10);
      scene.add(post);
    }
  }
  // simple boats: hull + cabin + mast
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f0eb });
  const accentMats = [0xd94f3d, 0x3d7bd9, 0xf2b13d, 0x53b06a].map(
    (c) => new THREE.MeshLambertMaterial({ color: c })
  );
  G.boats = [];
  const boatSpots = [
    [262, 306], [300, 312], [278, 322], [318, 300], [246, 318], [296, 288],
  ];
  boatSpots.forEach(([bx, bz], i) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 9), hullMat);
    hull.position.y = 0.5;
    boat.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.5, 9.1), accentMats[i % 4]);
    stripe.position.y = 1.05;
    boat.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3), hullMat);
    cabin.position.set(0, 1.8, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7, 5), postMat);
    mast.position.set(0, 4.4, 1.6);
    boat.add(mast);
    boat.position.set(bx, 0, bz);
    boat.rotation.y = (i % 3) * 0.35 - 0.3;
    boat.userData.phase = i * 1.7;
    scene.add(boat);
    G.boats.push(boat);
  });
  // the getaway boat moored at the pier (mission 6 target dressing)
  const escape = new THREE.Group();
  const eh = new THREE.Mesh(new THREE.BoxGeometry(3, 1.3, 8), accentMats[0]);
  eh.position.y = 0.5;
  escape.add(eh);
  const ec = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 2.6), hullMat);
  ec.position.set(0, 1.6, -0.5);
  escape.add(ec);
  escape.position.set(272, 0, 276);
  escape.userData.phase = 4.2;
  scene.add(escape);
  G.boats.push(escape);
}

function buildPalms(G) {
  const { scene, rng } = G;
  const spots = [];
  const prng = rng.fork('palms');
  for (let x = -315; x <= 315; x += 15) {
    if (prng.chance(0.8)) spots.push([x + prng.range(-3, 3), 246 + prng.range(0, 6)]);
    if (prng.chance(0.8)) spots.push([x + prng.range(-3, 3), 272 + prng.range(0, 10)]);
    if (prng.chance(0.55)) spots.push([x + prng.range(-3, 3), 219]);
  }
  for (const bx of BLOCK_X) for (const bz of [...BLOCK_Z, 206]) {
    if (prng.chance(0.6)) spots.push([bx + prng.range(-30, 30), bz + 34]);
    if (prng.chance(0.4)) spots.push([bx - 34, bz + prng.range(-28, 28)]);
  }
  const n = spots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 6, 6);
  trunkGeo.translate(0, 3, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7c58 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  trunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const canopyGeo = new THREE.ConeGeometry(3.4, 1.2, 7);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, n);
  canopies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const tilt = prng.range(-0.06, 0.06);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(tilt, prng.range(0, 6.28), tilt);
    dummy.scale.setScalar(prng.range(0.85, 1.2));
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    trunks.setColorAt(i, color.setHex(0x9a7c58));
    dummy.position.set(x + tilt * -18, 6.1 * dummy.scale.y, z + tilt * -18);
    dummy.rotation.set(0.12, prng.range(0, 6.28), 0.12);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
    canopies.setColorAt(i, color.setHex(0x3f9e4d).offsetHSL(prng.range(-0.02, 0.02), 0, prng.range(-0.05, 0.05)));
  });
  trunks.castShadow = true;
  canopies.castShadow = true;
  scene.add(trunks);
  scene.add(canopies);
}

function buildStreetlights(G) {
  const { scene } = G;
  const spots = [];
  for (const rx of ROADS_X) for (let z = -300; z <= 210; z += 45) spots.push([rx + 9.5, z]);
  for (const rz of ROADS_Z) for (let x = -300; x <= 300; x += 45) spots.push([x, rz + 9.5]);
  const n = spots.length;
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4247 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 1.1);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, n);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.6, z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);
}

function buildBeachProps(G) {
  const { scene, rng } = G;
  const prng = rng.fork('beachprops');
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5);
  poleGeo.translate(0, 1.2, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d2 });
  const coneGeo = new THREE.ConeGeometry(2.2, 0.8, 8);
  const colors = [0xef6461, 0xf2b13d, 0x3fc1c9, 0xe77fb0, 0x7bc47f];
  const n = 12;
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
  const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  cones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = prng.range(-300, 240), z = prng.range(252, 284);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2.5, z);
    dummy.updateMatrix();
    cones.setMatrixAt(i, dummy.matrix);
    cones.setColorAt(i, color.setHex(colors[i % colors.length]));
  }
  scene.add(poles);
  scene.add(cones);
}
