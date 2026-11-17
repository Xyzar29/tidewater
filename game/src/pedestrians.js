// Pedestrians: low-poly people who stroll the sidewalks and beachfront,
// cross at corners, and scatter when a car bears down on them or a shot
// rings out nearby. They share the same little articulated figure builder
// as Mari and the rival crew.

import { WORLD, TUNE } from './config.js';
import { collideCircle } from './city.js';
import { clamp, angDiff } from './random.js';

const { lines, roadHalf } = WORLD;
const SHIRT_COLORS = [0xf2f0eb, 0xffd23e, 0x37b8b2, 0xe77fb0, 0x53b06a, 0xff7847, 0x9b59c9, 0xf6a8b8];
const SKIN = [0xf2c79b, 0xc98d5e, 0x8a5a34, 0x6e4226, 0xffdbac];

// A person ~1.75 m tall: legs, torso, arms, head. The torso mesh is handed
// back so callers can tint the hero / the rivals apart from the crowd.
export function buildFigure(shirt, pants, skin) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), mat(pants));
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.26), mat(shirt));
  torso.position.y = 1.11;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.15), mat(shirt));
  armL.position.set(-0.34, 1.12, 0);
  const armR = armL.clone(); armR.position.x = 0.34;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), mat(skin));
  head.position.y = 1.62;
  for (const part of [legL, legR, torso, armL, armR, head]) {
    part.castShadow = true;
    g.add(part);
  }
  g.userData.parts = { legL, legR, armL, armR, torso, head };
  return g;
}

export function animateFigure(fig, phase, runAmount) {
  const p = fig.userData.parts;
  const swing = Math.sin(phase) * (0.35 + runAmount * 0.4);
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.8;
  p.armR.rotation.x = swing * 0.8;
}

// Sidewalk lines run along block edges: offset just outside the road.
function sidewalkTarget(G, ped) {
  const alongRoad = ped.axis === 'x' ? ped.fixed : ped.fixed;
  void alongRoad;
  const t = G.rng.range(-252, 236);
  if (ped.axis === 'x') return { x: t, z: ped.fixed };
  return { x: ped.fixed, z: t };
}

export function createPeds(G) {
  const rng = G.rng;
  for (let i = 0; i < TUNE.pedCount; i++) {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.pick(lines) + rng.sign() * (roadHalf + 2.2);
    const along = rng.range(-250, 230);
    const mesh = buildFigure(rng.pick(SHIRT_COLORS), 0x2e3a4a, rng.pick(SKIN));
    const ped = {
      mesh, x: axis === 'x' ? along : line, z: axis === 'x' ? line : along,
      heading: rng.range(0, Math.PI * 2), speed: 0,
      axis, fixed: line, target: null, phase: rng.range(0, 6),
      state: 'walk', fleeT: 0, health: 30, dead: false, fallT: 0,
    };
    ped.target = sidewalkTarget(G, ped);
    mesh.position.set(ped.x, G.city.groundY(ped.x, ped.z), ped.z);
    G.scene.add(mesh);
    G.peds.push(ped);
  }
}

export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const dx = ped.x - x, dz = ped.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      ped.state = 'flee';
      ped.fleeT = 2.4;
      ped.fleeFrom = { x, z };
    }
  }
}

export function hurtPed(G, ped, dmg) {
  if (ped.dead) return;
  ped.health -= dmg;
  if (ped.health <= 0) {
    ped.dead = true;
    ped.fallT = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  } else {
    ped.state = 'flee';
    ped.fleeT = 3;
    ped.fleeFrom = { x: G.player.x, z: G.player.z };
  }
}

export function updatePeds(G, dt) {
  const player = G.player;
  for (const ped of G.peds) {
    if (ped.dead) {
      ped.fallT -= dt;
      if (ped.fallT <= 0) { // quietly clear the pavement, respawn elsewhere later
        ped.mesh.visible = false;
        ped.x = 9999; ped.z = 9999;
      }
      continue;
    }
    let tx, tz, speed;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const from = ped.fleeFrom || { x: player.x, z: player.z };
      const dx = ped.x - from.x, dz = ped.z - from.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 12; tz = ped.z + (dz / d) * 12;
      speed = 6.4;
      if (ped.fleeT <= 0) { ped.state = 'walk'; ped.target = sidewalkTarget(G, ped); }
    } else {
      // A fast car coming close is reason enough to run.
      if (player && player.driving && Math.abs(player.car.speed) > 9) {
        const dx = ped.x - player.car.x, dz = ped.z - player.car.z;
        if (dx * dx + dz * dz < 30) {
          ped.state = 'flee'; ped.fleeT = 1.6;
          ped.fleeFrom = { x: player.car.x, z: player.car.z };
        }
      }
      if (!ped.target) ped.target = sidewalkTarget(G, ped);
      tx = ped.target.x; tz = ped.target.z;
      speed = 1.7;
      if (Math.hypot(tx - ped.x, tz - ped.z) < 2.5) {
        // At the end of a stretch: maybe cross the street, maybe turn back.
        if (G.rng.chance(0.4)) {
          ped.fixed += G.rng.sign() * (roadHalf * 2 + 4.4);
          ped.fixed = clamp(ped.fixed, -252, 246);
        }
        ped.target = sidewalkTarget(G, ped);
      }
    }
    const want = Math.atan2(tx - ped.x, tz - ped.z);
    ped.heading += clamp(angDiff(want, ped.heading), -3.4 * dt, 3.4 * dt);
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    const [nx, nz] = collideCircle(G.city, ped.x, ped.z, 0.45);
    ped.x = nx; ped.z = nz;
    ped.x = clamp(ped.x, -266, 266);
    ped.z = clamp(ped.z, -266, 258);
    ped.phase += dt * speed * 3.4;
    ped.mesh.position.set(ped.x, G.city.groundY(ped.x, ped.z), ped.z);
    ped.mesh.rotation.y = ped.heading;
    animateFigure(ped.mesh, ped.phase, ped.state === 'flee' ? 1 : 0);
  }
}
