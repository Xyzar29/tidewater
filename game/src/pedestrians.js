// pedestrians.js — the people of Port Serena, and the low-poly person
// factory the player character and rival gunmen are also built from.
//
// Pedestrians stroll the sidewalk ring around their block, sometimes cross
// the street to the next block, and run when something scares them: a
// gunshot, a nearby crash, or a car bearing down on them. If a car does
// catch one, they go down and the game is told (someone may have been
// driving).

import { BLOCK_CENTRES, MAX_PEDS } from './config.js';
import { collideCircle } from './city.js';

const SKIN = [0xf2c79b, 0xc68863, 0x8a5a3b, 0xffe0bd];
const SHIRTS = [0xef6461, 0xffd166, 0x4ecdc4, 0xf6f6f6, 0x8e6cc8, 0x3f9e4d, 0xef8fb5, 0x5a7fbc];
const PANTS = [0x33415c, 0x5a6068, 0x8a6f4d, 0x2e2e33, 0xd9d2c4];

// One articulated-enough person: legs, torso, arms, head. Arms and legs are
// in userData so the walk cycle can swing them.
export function makePerson(shirt, pants, skin, hair) {
  const grp = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.19), mat(pants));
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), mat(shirt));
  torso.position.y = 1.09;
  torso.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.15), mat(shirt));
  armL.geometry.translate(0, -0.22, 0);
  armL.position.set(-0.31, 1.34, 0);
  const armR = armL.clone(); armR.position.x = 0.31;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), mat(skin));
  head.position.y = 1.58;
  head.castShadow = true;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.32), mat(hair));
  hairM.position.y = 1.78;
  grp.add(legL, legR, torso, armL, armR, head, hairM);
  grp.userData.swing = { legL, legR, armL, armR };
  return grp;
}

// Swing limbs + bob, shared by peds, the player and enemies.
export function animatePerson(mesh, phase, amount) {
  const s = mesh.userData.swing;
  if (!s) return;
  const w = Math.sin(phase) * 0.55 * amount;
  s.legL.rotation.x = w;
  s.legR.rotation.x = -w;
  s.armL.rotation.x = -w * 0.8;
  s.armR.rotation.x = w * 0.8;
  mesh.position.y = Math.abs(Math.sin(phase)) * 0.05 * amount;
}

// A point on the sidewalk ring around a block (the ring sits just inside
// the slab edge). t goes 0..1 around the ring.
function ringPoint(cx, cz, t) {
  const R = 34;
  const side = Math.floor(t * 4) % 4;
  const f = (t * 4) - Math.floor(t * 4);
  const a = -R + f * R * 2;
  if (side === 0) return { x: cx + a, z: cz - R };
  if (side === 1) return { x: cx + R, z: cz + a };
  if (side === 2) return { x: cx - a, z: cz + R };
  return { x: cx - R, z: cz - a };
}

export function initPeds(G) {
  const rng = G.rng;
  G.peds = [];
  for (let i = 0; i < MAX_PEDS; i++) {
    const cx = rng.pick(BLOCK_CENTRES), cz = rng.pick(BLOCK_CENTRES);
    const t = rng.next();
    const pt = ringPoint(cx, cz, t);
    const mesh = makePerson(rng.pick(SHIRTS), rng.pick(PANTS), rng.pick(SKIN), rng.pick([0x2e2018, 0x4a3220, 0x111111, 0xb08954]));
    mesh.position.set(pt.x, 0.1, pt.z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, x: pt.x, z: pt.z, heading: rng.range(0, 6.28),
      cx, cz, ringT: t, speed: rng.range(1.1, 1.7),
      mode: 'walk', fleeUntil: 0, fleeFrom: { x: 0, z: 0 },
      phase: rng.range(0, 6), dead: false, hitCooldown: 0,
    });
  }
}

export function updatePeds(G, dt) {
  const p = G.playerPos;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (ped.hitCooldown > 0) ped.hitCooldown -= dt;

    // Recycle distant peds to a block near the player.
    if (Math.hypot(ped.x - p.x, ped.z - p.z) > 260) {
      ped.cx = BLOCK_CENTRES.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
      ped.cz = BLOCK_CENTRES.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a);
      const pt = ringPoint(ped.cx, ped.cz, G.rng.next());
      ped.x = pt.x; ped.z = pt.z;
    }

    // Fear: a fresh threat, or a fast car very close.
    let threat = null;
    if (G.threat && G.time < G.threat.until) threat = G.threat;
    else {
      for (const car of G.cars) {
        if (Math.abs(car.speed) > 7 && Math.hypot(car.x - ped.x, car.z - ped.z) < 8) { threat = car; break; }
      }
    }
    if (threat) { ped.mode = 'flee'; ped.fleeFrom = threat; ped.fleeUntil = G.time + 2.6; }
    if (ped.mode === 'flee' && G.time > ped.fleeUntil) ped.mode = 'walk';

    let tx, tz, spd;
    if (ped.mode === 'flee') {
      const dx = ped.x - ped.fleeFrom.x, dz = ped.z - ped.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 10; tz = ped.z + (dz / d) * 10;
      spd = 4.6;
    } else {
      const target = ringPoint(ped.cx, ped.cz, ped.ringT);
      tx = target.x; tz = target.z;
      spd = ped.speed;
      if (Math.hypot(tx - ped.x, tz - ped.z) < 1.2) {
        // Next stretch of ring, or cross to the neighbouring block.
        if (G.rng.chance(0.22)) {
          const dir = G.rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
          const ncx = ped.cx + dir[0] * 84, ncz = ped.cz + dir[1] * 84;
          if (BLOCK_CENTRES.includes(ncx) && BLOCK_CENTRES.includes(ncz)) { ped.cx = ncx; ped.cz = ncz; }
        }
        ped.ringT = (ped.ringT + 0.25 + G.rng.range(-0.04, 0.04) + 1) % 1;
      }
    }

    const dx = tx - ped.x, dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      const want = Math.atan2(dx, dz);
      let diff = want - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += Math.max(-6 * dt, Math.min(6 * dt, diff));
      ped.x += Math.sin(ped.heading) * spd * dt;
      ped.z += Math.cos(ped.heading) * spd * dt;
      ped.phase += dt * spd * 3.4;
    }
    const res = collideCircle(G.city, ped.x, ped.z, 0.45);
    ped.x = res.x; ped.z = res.z;

    // Cars are lethal to stand in front of.
    if (ped.hitCooldown <= 0) {
      for (const car of G.cars) {
        if (Math.abs(car.speed) < 2.5) continue;
        if (Math.hypot(car.x - ped.x, car.z - ped.z) < 1.9) {
          ped.dead = true;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.25;
          if (G.onPedHit) G.onPedHit(ped, car);
          break;
        }
      }
    }

    ped.mesh.position.x = ped.x;
    ped.mesh.position.z = ped.z;
    ped.mesh.rotation.y = ped.heading;
    if (!ped.dead) animatePerson(ped.mesh, ped.phase, ped.mode === 'flee' ? 1.3 : 0.8);
  }
}

// Scare everyone near a point (gunfire, explosions, a crash).
export function scarePeds(G, x, z, radius) {
  G.threat = { x, z, until: G.time + 2.2 };
  for (const ped of G.peds) {
    if (!ped.dead && Math.hypot(ped.x - x, ped.z - z) < radius) {
      ped.mode = 'flee';
      ped.fleeFrom = { x, z };
      ped.fleeUntil = G.time + 2.6;
    }
  }
}
