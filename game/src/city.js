// Port Serena: the road grid, instanced pastel buildings with lit windows,
// palms, beach and animated sea, the marina, streetlights, landmark lots
// with signed buildings, dockside containers and the cash pickups scattered
// for free-roam money. Building footprints are exported as AABB colliders
// that every other system collides against.

import { WORLD, LANDMARKS, PASTELS, DISTRICTS } from './config.js';

const { lines, roadHalf, blockHalf } = WORLD;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Window grid: warm lit panes and dark glass on a transparent base, so the
// instance colour tints the wall and the windows read at any height.
function makeFacadeTexture(rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cols = 6, rows = 14, cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng.next();
        g.fillStyle = lit < 0.42 ? 'rgba(255,214,130,0.95)' : 'rgba(38,52,66,0.9)';
        g.fillRect(x * cw + 2.5, y * ch + 3, cw - 5, ch - 6);
      }
    }
  });
}

function makeSignTexture(text, bg, fg) {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 52px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function makeWaterTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2e7fa8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 380; i++) {
      g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.07})`;
      const y = Math.random() * h;
      g.fillRect(Math.random() * w, y, 12 + Math.random() * 30, 1.6);
    }
  });
}

export function buildCity(G) {
  const { scene, rng } = G;
  const colliders = [];

  // --- sky, light, air -------------------------------------------------
  const skyTex = canvasTexture(4, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#7ec8e3');
    grad.addColorStop(0.55, '#f7c98a');
    grad.addColorStop(0.8, '#ffb27d');
    grad.addColorStop(1, '#ff9e7d');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xf7bd84, 190, 620);

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0xffe0b3, 0.75));
  const sun = new THREE.DirectionalLight(0xffdfae, 1.25);
  sun.position.set(-140, 190, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  G.sun = sun;

  // --- ground: asphalt base, raised block pads, sand, sea --------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x43464c })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 60);
  ground.receiveShadow = true;
  scene.add(ground);

  const padGeo = new THREE.BoxGeometry(blockHalf * 2, 0.5, blockHalf * 2);
  const padMats = [0xd8c9a3, 0xcfd8b0, 0xe3d3ae, 0xd5c6d8].map(
    (c) => new THREE.MeshLambertMaterial({ color: c })
  );
  const centers = [];
  for (let i = 0; i < lines.length - 1; i++) centers.push((lines[i] + lines[i + 1]) / 2);
  for (const cx of centers) {
    for (const cz of centers) {
      if (cz > 200) continue; // southern row gives way to the beachfront lots
      const pad = new THREE.Mesh(padGeo, padMats[rng.int(0, padMats.length - 1)]);
      pad.position.set(cx, 0.25, cz);
      pad.receiveShadow = true;
      scene.add(pad);
    }
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(900, WORLD.seaZ - WORLD.beachZ + 30),
    new THREE.MeshLambertMaterial({ color: 0xf2ddab })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.08, (WORLD.beachZ + WORLD.seaZ) / 2 + 8);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterTex = makeWaterTexture();
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(10, 4);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, WORLD.seaFar - WORLD.seaZ),
    new THREE.MeshLambertMaterial({ color: 0x9fd4e8, map: waterTex, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.32, (WORLD.seaZ + WORLD.seaFar) / 2);
  scene.add(water);

  // Road centre dashes, instanced.
  {
    const dashGeo = new THREE.PlaneGeometry(0.35, 3.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c9 });
    const spots = [];
    for (const l of lines) {
      for (let t = -268; t <= 232; t += 11) {
        spots.push([l, t, 0]); spots.push([t, l, 1]);
      }
    }
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const flat = new THREE.Euler(-Math.PI / 2, 0, 0);
    spots.forEach(([x, z, rot], i) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot ? Math.PI / 2 : 0));
      m.compose(new THREE.Vector3(x, 0.06, z), q, s);
      dashes.setMatrixAt(i, m);
    });
    void flat;
    scene.add(dashes);
  }

  // --- buildings ---------------------------------------------------------
  const facade = makeFacadeTexture(rng);
  const blockSkip = new Set([
    '28,-28', '84,-196', '-196,-84', '-28,196', '-196,-196', '140,28', '196,140', '-84,196',
  ]);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial({ map: facade });
  const placements = [];
  for (const cx of centers) {
    for (const cz of centers) {
      if (cz > 200) continue;
      if (blockSkip.has(cx + ',' + cz)) continue;
      const downtown = Math.abs(cx) <= 84 && cz >= -140 && cz < 60;
      const beachRow = cz === 196;
      const suburb = Math.abs(cx) >= 140 && cz < 60 && !downtown;
      const n = downtown ? rng.int(2, 3) : 1;
      for (let k = 0; k < n; k++) {
        const w = rng.range(13, 19), d = rng.range(13, 19);
        const h = downtown ? rng.range(20, 44) : beachRow ? rng.range(13, 24)
          : suburb ? rng.range(6, 10) : rng.range(10, 22);
        const ox = n === 1 ? rng.range(-3, 3) : (k % 2 === 0 ? -9.5 : 9.5);
        const oz = n === 1 ? rng.range(-3, 3) : (k < 2 ? -9.5 : 9.5);
        placements.push({ x: cx + ox, z: cz + oz, w, d, h, color: rng.pick(PASTELS) });
      }
    }
  }
  const buildings = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    placements.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, p.h / 2 + 0.5, p.z),
        q,
        new THREE.Vector3(p.w, p.h, p.d)
      );
      buildings.setMatrixAt(i, m);
      buildings.setColorAt(i, col.setHex(p.color));
      colliders.push({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
    });
  }
  scene.add(buildings);

  // --- landmark buildings with signs -------------------------------------
  function landmarkBuilding(x, z, w, h, d, color, signText, signBg, signFg) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, map: facade })
    );
    mesh.position.set(x, h / 2 + 0.5, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (signText) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.92, 22), 2.6),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(signText, signBg, signFg) })
      );
      sign.position.set(x, h - 1.2, z - d / 2 - 0.06);
      sign.rotation.y = Math.PI;
      scene.add(sign);
      const sign2 = sign.clone();
      sign2.position.z = z + d / 2 + 0.06;
      sign2.rotation.y = 0;
      scene.add(sign2);
    }
    return mesh;
  }
  landmarkBuilding(28, -28, 26, 15, 22, 0xf4f6f8, 'HOSPITAL', '#f4f6f8', '#c9332e');
  landmarkBuilding(84, -196, 30, 19, 24, 0x3a2b4f, 'CASINO SERENA', '#241736', '#ffd75e');
  landmarkBuilding(-196, -84, 24, 8, 18, 0xb08968, "DARIO'S GARAGE", '#5b4632', '#ffe1a8');
  landmarkBuilding(-28, 196, 30, 22, 22, 0xffd9a0, 'SERENA HOTEL', '#8a5a2b', '#fff3d6');
  landmarkBuilding(-196, -196, 15, 7, 13, 0xa8d8ea, '', '', '');
  landmarkBuilding(140, 28, 24, 12, 20, 0x54677f, 'PSPD', '#22354f', '#cfe4ff');
  // Warehouse: one long dockside shed, no sign, plus containers below.
  landmarkBuilding(248, 56, 30, 13, 64, 0x9aa3ab, 'PIER 9 STORAGE', '#4c565e', '#e8eef2');

  // Dockside containers — colourful boxes that double as cover in a fight.
  {
    const contGeo = new THREE.BoxGeometry(6, 2.6, 2.4);
    const contCols = [0xc94f42, 0x3d7bd9, 0x53b06a, 0xf2b13d, 0x7a5ea8];
    const spots = [
      [186, 104], [194, 104], [190, 112], [210, 128], [204, 138], [186, 138],
      [216, 96], [176, 122], [222, 118], [198, 96],
    ];
    for (const [x, z] of spots) {
      const c = new THREE.Mesh(contGeo, new THREE.MeshLambertMaterial({ color: rng.pick(contCols) }));
      c.position.set(x, 1.8, z);
      c.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
      c.castShadow = true; c.receiveShadow = true;
      scene.add(c);
      const hw = c.rotation.y === 0 ? 3 : 1.2, hd = c.rotation.y === 0 ? 1.2 : 3;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    }
  }

  // --- palms ---------------------------------------------------------------
  const palmSpots = [];
  for (let x = -258; x <= 258; x += 15) palmSpots.push([x + rng.range(-3, 3), 231 + rng.range(-2, 2)]);
  for (let i = 0; i < 26; i++) palmSpots.push([rng.range(-250, 250), rng.range(-240, 210)]);
  palmSpots.push([176, 224], [216, 224], [150, 210], [-70, 210], [-30, 214]);
  {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 5);
    trunkGeo.translate(0, 2.7, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
    const crownGeo = new THREE.ConeGeometry(2.9, 1.5, 7);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
    trunks.castShadow = true;
    const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    palmSpots.forEach(([x, z], i) => {
      const tilt = rng.range(0.02, 0.12), dir = rng.range(0, Math.PI * 2);
      e.set(Math.cos(dir) * tilt, 0, Math.sin(dir) * tilt);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0.2, z), q, one);
      trunks.setMatrixAt(i, m);
      const top = new THREE.Vector3(Math.sin(dir) * tilt * -5.2, 5.5, Math.cos(dir) * tilt * 5.2);
      m.compose(new THREE.Vector3(x + top.x * 0.4, 5.6, z + top.z * 0.4), q, one);
      crowns.setMatrixAt(i, m);
    });
    scene.add(trunks); scene.add(crowns);
  }

  // --- streetlights ---------------------------------------------------------
  {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
    poleGeo.translate(0, 2.8, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
    const headGeo = new THREE.BoxGeometry(0.5, 0.18, 1.1);
    headGeo.translate(0, 5.6, 0);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const spots = [];
    for (const lx of lines) for (const lz of lines) {
      spots.push([lx + 9.5, lz + 9.5]); spots.push([lx - 9.5, lz - 9.5]);
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, m); heads.setMatrixAt(i, m);
    });
    scene.add(poles); scene.add(heads);
  }

  // --- marina: pier, boats, kiosk -------------------------------------------
  const boats = [];
  {
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.7, 52),
      new THREE.MeshLambertMaterial({ color: 0x9a7a56 })
    );
    pier.position.set(196, 0.55, 262);
    scene.add(pier);
    const hullGeo = new THREE.BoxGeometry(3, 1.1, 7.5);
    const cabinGeo = new THREE.BoxGeometry(1.8, 1, 2.6);
    const mastGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 5);
    const boatCols = [0xf2f0eb, 0xd94f3d, 0x3d7bd9, 0xf2b13d, 0x37b8b2];
    for (let i = 0; i < 5; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, new THREE.MeshLambertMaterial({ color: boatCols[i] }));
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(cabinGeo, new THREE.MeshLambertMaterial({ color: 0xf7f3e8 }));
      cabin.position.set(0, 1.3, -0.6);
      const mast = new THREE.Mesh(mastGeo, new THREE.MeshLambertMaterial({ color: 0x8a6844 }));
      mast.position.set(0, 3.4, 1.2);
      boat.add(hull, cabin, mast);
      boat.position.set(188 + (i % 2) * 16, 0.25, 246 + i * 9);
      boat.userData.phase = i * 1.3;
      scene.add(boat);
      boats.push(boat);
    }
    const kiosk = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3.4, 5),
      new THREE.MeshLambertMaterial({ color: 0xe77fb0, map: facade })
    );
    kiosk.position.set(178, 2.2, 226);
    kiosk.castShadow = true;
    scene.add(kiosk);
    colliders.push({ minX: 175, maxX: 181, minZ: 223.5, maxZ: 228.5 });
  }

  // --- free-roam cash pickups -------------------------------------------------
  const pickups = [];
  {
    const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.22, 14);
    const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
    const spots = [
      [-52, -52], [60, 4], [-4, 116], [116, -60], [-116, 60], [4, -116],
      [-60, -172], [172, 172], [-172, -116], [60, 172], [-116, -4], [228, 200],
    ];
    for (const [x, z] of spots) {
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.rotation.x = Math.PI / 2;
      coin.position.set(x, 1.15, z);
      scene.add(coin);
      pickups.push({ x, z, mesh: coin, taken: false });
    }
  }

  function districtAt(x, z) {
    for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
    return 'Port Serena';
  }

  // Actors stand on the raised block pads (0.5) or on the road / lots (0).
  function groundY(x, z) {
    if (z >= WORLD.beachZ) return 0.1;
    if (z > 216 || x > 216) return 0.02; // marina and dockside lots are flat
    const mx = ((x + 224) % 56 + 56) % 56, mz = ((z + 224) % 56 + 56) % 56;
    const dx = Math.min(mx, 56 - mx), dz = Math.min(mz, 56 - mz);
    return dx > roadHalf && dz > roadHalf ? 0.5 : 0.02;
  }

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    waterTex.offset.y = (elapsed * 0.008) % 1;
    waterTex.offset.x = Math.sin(elapsed * 0.05) * 0.02;
    for (const b of boats) b.position.y = 0.25 + Math.sin(elapsed * 0.9 + b.userData.phase) * 0.09;
    for (const p of pickups) {
      if (!p.taken) p.mesh.rotation.z = elapsed * 2.2;
    }
    // Shadow frustum follows the player so shadows stay crisp nearby.
    const px = G.player ? G.player.x : 0, pz = G.player ? G.player.z : 0;
    sun.position.set(px - 140, 190, pz - 90);
    sun.target.position.set(px, 0, pz);
  }

  G.city = { colliders, pickups, districtAt, groundY, update, landmarks: LANDMARKS };
  return G.city;
}

// Circle vs building AABBs: push the circle out along the shallowest axis.
// Shared by the player, pedestrians and every car.
export function collideCircle(city, x, z, r) {
  for (const c of city.colliders) {
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
      const pushL = (x + r) - c.minX, pushR = c.maxX - (x - r);
      const pushU = (z + r) - c.minZ, pushD = c.maxZ - (z - r);
      const min = Math.min(pushL, pushR, pushU, pushD);
      if (min === pushL) x = c.minX - r;
      else if (min === pushR) x = c.maxX + r;
      else if (min === pushU) z = c.minZ - r;
      else z = c.maxZ + r;
    }
  }
  return [x, z];
}

export function isOnRoad(x, z) {
  for (const l of lines) {
    if (Math.abs(x - l) < roadHalf + 1.5 || Math.abs(z - l) < roadHalf + 1.5) return true;
  }
  return false;
}
