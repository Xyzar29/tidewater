// city.js — Port Serena itself.
//
// Builds the whole static world into the scene: the road lattice with
// sidewalks, instanced pastel towers with lit windows, landmark buildings
// with signs, palm trees, streetlights, the beach, the sea and the marina.
// Everything procedural — canvas textures drawn at boot, no external assets.
//
// Also answers the questions other systems ask all day: what district is
// this, is that point on a road, and which boxes are solid.

import {
  PITCH, ROAD_W, BLOCK, AVENUES, STREETS, BEACH_ROAD_X, SAND_X, WATER_X,
  BLOCK_CENTRES, LANDMARKS,
} from './config.js';

const PASTELS = [0xf6d8a8, 0xf3b8c6, 0xa8d8d0, 0xf9e7b2, 0xd9c7ec, 0xf5c39a, 0xbfe3f0, 0xf8f0dc];

// Canvas texture helpers -----------------------------------------------------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// One building facade variant: a colour map (walls + window grid) and an
// emissive map (only the lit windows glow). Buildings tint the colour map
// with a pastel instance colour.
function facadeVariant(rng) {
  const cols = 6, rows = 10;
  const lit = [];
  for (let i = 0; i < cols * rows; i++) lit.push(rng.chance(0.42));
  const map = canvasTex(128, 256, (g) => {
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = lit[y * cols + x];
      g.fillStyle = on ? '#ffd98c' : '#5a6a78';
      g.fillRect(8 + x * 20, 10 + y * 24, 12, 15);
    }
  });
  const emissive = canvasTex(128, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!lit[y * cols + x]) continue;
      g.fillStyle = '#ffb85c';
      g.fillRect(8 + x * 20, 10 + y * 24, 12, 15);
    }
  });
  return { map, emissive };
}

function signTexture(text) {
  return canvasTex(512, 112, (g, w, h) => {
    g.fillStyle = '#17324a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd166'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffe9b0';
    g.font = 'bold 52px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// Which landmark (if any) owns the block centred at cx,cz.
function landmarkAt(cx, cz) {
  for (const key of Object.keys(LANDMARKS)) {
    const L = LANDMARKS[key];
    if (L.x === cx && L.z === cz) return key;
  }
  return null;
}

export function districtAt(x, z) {
  if (x >= SAND_X) return 'THE MARINA';
  if (x > 168) return z > 150 ? 'DOCKSIDE' : 'BEACHFRONT';
  if (Math.abs(x) <= 130 && Math.abs(z) <= 130) return 'DOWNTOWN';
  if (x < -150) return 'SUBURBS';
  if (z > 150) return 'SOUTHSIDE';
  return 'MIDTOWN';
}

export function buildCity(G) {
  const { scene, rng } = G;
  const city = {
    colliders: [],        // solid AABBs: {minX,maxX,minZ,maxZ}
    boats: [],            // meshes bobbed by updateCity
    waterMat: null,
    beaconMats: [],
  };
  G.city = city;

  // --- light and sky -------------------------------------------------------
  scene.background = canvasTex(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#7ec8e3');
    grad.addColorStop(0.55, '#bfe6f2');
    grad.addColorStop(0.78, '#ffe3b3');
    grad.addColorStop(1, '#ffd9a0');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xf2ddba, 180, 620);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5f, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a3, 1.25);
  sun.position.set(-140, 170, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  G.sun = sun;

  // --- ground, sand, sea ---------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshLambertMaterial({ color: 0x979d88 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WATER_X - SAND_X + 30, 900),
    new THREE.MeshLambertMaterial({ color: 0xf0dcb0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((SAND_X + WATER_X) / 2 + 8, 0.0, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterTex = canvasTex(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#5fc7c0');
    grad.addColorStop(1, '#2a7ab0');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) {
      const y = rng.range(0, h);
      g.beginPath(); g.moveTo(rng.range(0, w * 0.7), y); g.lineTo(rng.range(w * 0.3, w), y); g.stroke();
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(6, 18);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 1200),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_X + 372, 0.12, 0);
  scene.add(water);
  city.waterMat = waterTex;

  // --- roads ---------------------------------------------------------------
  const asphaltTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#43484d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#565d63';
    for (let i = 0; i < 260; i++) g.fillRect(rng.range(0, w), rng.range(0, h), 2, 2);
    g.fillStyle = '#e8e4da';
    g.fillRect(3, 0, 3, h); g.fillRect(w - 6, 0, 3, h);      // edge lines
    g.fillRect(w / 2 - 2, 6, 4, 44); g.fillRect(w / 2 - 2, 78, 4, 44); // dashes
  });
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;

  const roadMatV = new THREE.MeshLambertMaterial({ map: asphaltTex.clone() });
  roadMatV.map.repeat.set(1, 40);
  const roadMatH = new THREE.MeshLambertMaterial({ map: asphaltTex.clone() });
  roadMatH.map.rotation = Math.PI / 2;
  roadMatH.map.center.set(0.5, 0.5);
  roadMatH.map.repeat.set(1, 40);
  const roadGeoV = new THREE.PlaneGeometry(ROAD_W, 640);
  const roadGeoH = new THREE.PlaneGeometry(640, ROAD_W);
  for (const x of AVENUES) {
    const m = new THREE.Mesh(roadGeoV, roadMatV);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, 0);
    m.receiveShadow = true; scene.add(m);
  }
  for (const z of STREETS) {
    const m = new THREE.Mesh(roadGeoH, roadMatH);
    m.rotation.x = -Math.PI / 2; m.position.set(6, 0.02, z);
    m.receiveShadow = true; scene.add(m);
  }
  // The coast road: plain asphalt, no markings.
  const coast = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 640),
    new THREE.MeshLambertMaterial({ color: 0x4a4f54 })
  );
  coast.rotation.x = -Math.PI / 2;
  coast.position.set(BEACH_ROAD_X, 0.02, 0);
  coast.receiveShadow = true;
  scene.add(coast);

  // --- sidewalks / block slabs ----------------------------------------------
  const slabGeo = new THREE.BoxGeometry(BLOCK + 7, 0.24, BLOCK + 7);
  const slabMats = {
    city: new THREE.MeshLambertMaterial({ color: 0xcfc8ba }),
    suburb: new THREE.MeshLambertMaterial({ color: 0xa9bd8d }),
    beach: new THREE.MeshLambertMaterial({ color: 0xe6d7b4 }),
  };
  for (const cx of BLOCK_CENTRES) for (const cz of BLOCK_CENTRES) {
    const d = districtAt(cx, cz);
    const mat = d === 'SUBURBS' ? slabMats.suburb : (d === 'BEACHFRONT' || d === 'DOCKSIDE') ? slabMats.beach : slabMats.city;
    const slab = new THREE.Mesh(slabGeo, mat);
    slab.position.set(cx, 0.0, cz);
    slab.receiveShadow = true;
    scene.add(slab);
  }

  // --- buildings -------------------------------------------------------------
  const variants = [facadeVariant(rng), facadeVariant(rng), facadeVariant(rng)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // scale from the ground up
  const instanced = variants.map((v) => {
    const mat = new THREE.MeshLambertMaterial({
      map: v.map, emissive: 0xffb85c, emissiveMap: v.emissive, emissiveIntensity: 0.5,
    });
    const im = new THREE.InstancedMesh(boxGeo, mat, 160);
    im.castShadow = true; im.receiveShadow = true;
    im.count = 0;
    // Allocate the instance colours up front at full capacity: setColorAt
    // sizes its buffer from the mesh's *current* count, which is 0 right
    // now — left to itself every tint would be lost and the towers would
    // render black.
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
    scene.add(im);
    return im;
  });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const addBuilding = (x, z, w, d, h, pastel) => {
    const im = instanced[rng.int(0, 2)];
    if (im.count >= 160) return;
    dummy.position.set(x, 0.1, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    im.setMatrixAt(im.count, dummy.matrix);
    im.setColorAt(im.count, tint.setHex(pastel));
    im.count++;
    city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };

  const landmarkHeights = { hospital: 26, casino: 20, hotel: 36, garage: 9, precinct: 17, warehouse: 13, safehouse: 8 };

  for (const cx of BLOCK_CENTRES) for (const cz of BLOCK_CENTRES) {
    const lm = landmarkAt(cx, cz);
    const district = districtAt(cx, cz);
    if (lm) {
      const big = lm === 'warehouse';
      addBuilding(cx, cz, big ? 54 : 40, big ? 44 : 38, landmarkHeights[lm], lm === 'casino' ? 0xf3b8c6 : 0xf8f0dc);
      continue;
    }
    if (district === 'SUBURBS') {
      // Four little houses per block.
      for (const ox of [-17, 17]) for (const oz of [-17, 17]) {
        addBuilding(cx + ox, cz + oz, rng.range(13, 17), rng.range(12, 16), rng.range(6, 9.5), rng.pick(PASTELS));
      }
    } else if (district === 'DOWNTOWN') {
      if (rng.chance(0.55)) {
        addBuilding(cx, cz, rng.range(32, 44), rng.range(32, 44), rng.range(34, 68), rng.pick(PASTELS));
      } else {
        addBuilding(cx - 16, cz, rng.range(22, 28), rng.range(30, 40), rng.range(24, 44), rng.pick(PASTELS));
        addBuilding(cx + 17, cz + 4, rng.range(20, 26), rng.range(28, 36), rng.range(20, 38), rng.pick(PASTELS));
      }
    } else {
      const n = rng.int(1, 2);
      if (n === 1) {
        addBuilding(cx, cz, rng.range(28, 40), rng.range(28, 40), rng.range(13, 30), rng.pick(PASTELS));
      } else {
        addBuilding(cx - 16, cz - 8, rng.range(20, 26), rng.range(24, 32), rng.range(11, 24), rng.pick(PASTELS));
        addBuilding(cx + 16, cz + 8, rng.range(20, 26), rng.range(24, 32), rng.range(11, 24), rng.pick(PASTELS));
      }
    }
  }
  for (const im of instanced) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  // Landmark signs on the south face of each landmark building.
  for (const key of Object.keys(LANDMARKS)) {
    const L = LANDMARKS[key];
    if (key === 'marina') continue;
    const h = landmarkHeights[key] || 12;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 4.4),
      new THREE.MeshBasicMaterial({ map: signTexture(L.sign) })
    );
    sign.position.set(L.x, Math.min(h - 2.5, 9), L.z + (key === 'warehouse' ? 22.3 : 19.3));
    scene.add(sign);
  }

  // --- warehouse yard dressing ----------------------------------------------
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const crateMat2 = new THREE.MeshLambertMaterial({ color: 0x5f7f8c });
  const crateGeo = new THREE.BoxGeometry(3, 3, 3);
  const W = LANDMARKS.warehouse;
  for (let i = 0; i < 9; i++) {
    const cx = W.x + rng.range(-26, 26), cz = W.z + rng.range(26, 34);
    const crate = new THREE.Mesh(crateGeo, rng.chance(0.5) ? crateMat : crateMat2);
    crate.position.set(cx, 1.6, cz);
    crate.rotation.y = rng.range(0, Math.PI);
    crate.castShadow = true;
    scene.add(crate);
    city.colliders.push({ minX: cx - 1.6, maxX: cx + 1.6, minZ: cz - 1.6, maxZ: cz + 1.6 });
  }

  // --- palms ------------------------------------------------------------------
  const palmSpots = [];
  for (let z = -288; z <= 288; z += 26) {
    palmSpots.push([BEACH_ROAD_X - 11, z + rng.range(-4, 4)]);
    if (rng.chance(0.6)) palmSpots.push([BEACH_ROAD_X + 12, z + rng.range(-6, 6)]);
  }
  for (let i = 0; i < 26; i++) {
    palmSpots.push([rng.range(150, 285), rng.range(-290, 290)]);
  }
  palmSpots.push([322, 268], [322, 304], [338, 268], [338, 304]);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 5);
  trunkGeo.translate(0, 3.5, 0);
  const frondGeo = new THREE.ConeGeometry(3.4, 1.5, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x9a7b52 }), palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: 0x3f9e4d }), palmSpots.length);
  trunks.castShadow = true;
  palmSpots.forEach(([x, z], i) => {
    const lean = rng.range(-0.09, 0.09);
    dummy.position.set(x, 0, z);
    dummy.scale.set(1, rng.range(0.85, 1.25), 1);
    dummy.rotation.set(lean, rng.range(0, 3), lean);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 7 * dummy.scale.y - 0.4;
    dummy.rotation.set(Math.PI, 0, 0); // cone flipped: a drooping canopy
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fronds.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trunks); scene.add(fronds);

  // --- streetlights -------------------------------------------------------------
  const poleSpots = [];
  for (const x of AVENUES) for (let z = -294; z <= 294; z += 58) poleSpots.push([x + 8.4, z]);
  for (const z of STREETS) for (let x = -294; x <= 294; x += 58) poleSpots.push([x, z - 8.4]);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  poleGeo.translate(0, 2.7, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x5a6068 }), poleSpots.length);
  const lampGeo = new THREE.BoxGeometry(0.5, 0.18, 0.5);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), poleSpots.length);
  poleSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 5.45; dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles); scene.add(lamps);

  // --- beach umbrellas -----------------------------------------------------------
  const umbGeo = new THREE.ConeGeometry(2.4, 0.9, 6);
  const umbMats = [0xef6461, 0xffd166, 0x4ecdc4].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 16; i++) {
    const u = new THREE.Mesh(umbGeo, umbMats[i % 3]);
    u.position.set(rng.range(312, 340), 1.9, rng.range(-280, 240));
    u.castShadow = true;
    scene.add(u);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 4), poles.material);
    pole.position.set(u.position.x, 0.9, u.position.z);
    scene.add(pole);
  }

  // --- marina: pier, boats, the getaway boat --------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(64, 0.7, 7), pierMat);
  pier.position.set(362, 0.55, LANDMARKS.marina.z);
  pier.castShadow = true;
  scene.add(pier);
  const postGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.4, 5);
  for (let px = 336; px <= 390; px += 9) for (const pz of [283, 289]) {
    const post = new THREE.Mesh(postGeo, pierMat);
    post.position.set(px, 0.2, pz);
    scene.add(post);
  }
  const marinaSign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 2.4),
    new THREE.MeshBasicMaterial({ map: signTexture('MARINA'), side: THREE.DoubleSide })
  );
  marinaSign.position.set(326, 3.4, LANDMARKS.marina.z);
  scene.add(marinaSign);

  function boat(x, z, hullColor, isGetaway) {
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 1.5, 2.6),
      new THREE.MeshLambertMaterial({ color: hullColor })
    );
    hull.position.y = 0.6; hull.castShadow = true;
    grp.add(hull);
    const bow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 1.5, 3, 1),
      hull.material
    );
    bow.rotation.y = Math.PI / 2;
    bow.position.set(4.3, 0.6, 0);
    grp.add(bow);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.2, 1.9),
      new THREE.MeshLambertMaterial({ color: 0xf4f1e8 })
    );
    cabin.position.set(-0.6, 1.9, 0);
    grp.add(cabin);
    grp.position.set(x, 0.1, z);
    grp.rotation.y = rng.range(-0.2, 0.2);
    scene.add(grp);
    city.boats.push({ mesh: grp, baseY: 0.1, phase: rng.range(0, 6) });
    if (isGetaway) city.getawayBoat = grp;
    return grp;
  }
  boat(372, 268, 0xe8e4da); boat(384, 300, 0x7fb3d5); boat(366, 306, 0xf3b8c6);
  boat(392, 276, 0xa8d8d0); boat(378, 322, 0xf6d8a8);
  boat(358, LANDMARKS.marina.z, 0xd64545, true); // the red getaway boat, tied to the pier

  return city;
}

// A glowing objective beacon: a soft cylinder of light plus a ground ring.
// missions.js moves one of these around; combat reuses the ring for pickups.
export function makeBeacon(G, colorHex) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 42, 18, 1, true), mat);
  beam.position.y = 21;
  grp.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.1, 28),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  grp.add(ring);
  grp.visible = false;
  G.scene.add(grp);
  G.city.beaconMats.push(mat);
  return grp;
}

// Per-frame dressing: water drift, bobbing boats, the sun shadow box follows
// the player so shadows stay crisp wherever Mari goes.
export function updateCity(G, dt) {
  const city = G.city;
  if (city.waterMat) city.waterMat.offset.x = (G.time * 0.008) % 1;
  for (const b of city.boats) {
    b.mesh.position.y = b.baseY + Math.sin(G.time * 0.9 + b.phase) * 0.12;
    b.mesh.rotation.z = Math.sin(G.time * 0.7 + b.phase) * 0.02;
  }
  const p = G.playerPos;
  if (G.sun && p) {
    G.sun.position.set(p.x - 140, 170, p.z + 90);
    G.sun.target.position.set(p.x, 0, p.z);
  }
  const pulse = 0.15 + Math.sin(G.time * 3.2) * 0.04;
  for (const m of city.beaconMats) m.opacity = pulse;
}

// Is this point on asphalt (road, coast road, or a junction square)?
export function isOnRoad(x, z) {
  if (Math.abs(x) > 316 || Math.abs(z) > 316) return false;
  if (Math.abs(x - BEACH_ROAD_X) <= 7) return true;
  for (const a of AVENUES) if (Math.abs(x - a) <= ROAD_W / 2) return true;
  for (const s of STREETS) if (Math.abs(z - s) <= ROAD_W / 2) return true;
  return false;
}

// Circle-vs-AABB resolution against every solid box: returns a corrected
// position. Used by the player on foot, cars, and pedestrians alike.
const _hit = { x: 0, z: 0, hit: false };
export function collideCircle(city, x, z, r) {
  _hit.x = x; _hit.z = z; _hit.hit = false;
  for (const b of city.colliders) {
    if (x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r) continue;
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    let dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    _hit.hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      _hit.x = cx + (dx / d) * r;
      _hit.z = cz + (dz / d) * r;
      x = _hit.x; z = _hit.z;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) _hit.x = b.minX - r;
      else if (m === pr) _hit.x = b.maxX + r;
      else if (m === pt) _hit.z = b.minZ - r;
      else _hit.z = b.maxZ + r;
      x = _hit.x; z = _hit.z;
    }
  }
  return _hit;
}
