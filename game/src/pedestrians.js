// pedestrians.js — Port Serena's walkers: they loop the block sidewalks,
// cross streets at corners, scatter from gunfire and fast cars, and go down
// when a car actually hits them (which the wanted system hears about).
import { S, CFG, BLOCK_HALF } from './config.js';
import { collideCircle } from './city.js';
import { makeFigure } from './player.js';
import { randRange, pick } from './random.js';

const SHIRTS = [0x7fc46a, 0xf2c14e, 0x4a90d8, 0xef8fb5, 0xe8e4da, 0x5fc4b5, 0xd97b3f, 0xb565d8, 0x64b6ac, 0xfaf3e0];
const PANTS = [0x3a4a5f, 0x6b4a2f, 0x2e2e2e, 0x7a8a99, 0x54423a];
const SKINS = [0xc98a64, 0x8a5a3b, 0xe8b48c, 0x6e4226, 0xa06a42];
const HAIRS = [0x2a1a10, 0x4a2f1a, 0x111111, 0x8a6a3a, 0xb0b0b0];
const CENTERS = [-150, -90, -30, 30, 90, 150];
const HALF = BLOCK_HALF + 3.2;         // sidewalk line around each block
const SIDE = HALF * 2, PER = SIDE * 4;

function perimeterPos(bx, bz, s, out) {
  s = ((s % PER) + PER) % PER;
  const side = Math.floor(s / SIDE), t = (s - side * SIDE) - HALF;
  if (side === 0) { out.x = bx + t; out.z = bz - HALF; out.dx = 1; out.dz = 0; }
  else if (side === 1) { out.x = bx + HALF; out.z = bz + t; out.dx = 0; out.dz = 1; }
  else if (side === 2) { out.x = bx - t; out.z = bz + HALF; out.dx = -1; out.dz = 0; }
  else { out.x = bx - HALF; out.z = bz - t; out.dx = 0; out.dz = -1; }
  return out;
}

export function createPedestrians(g) {
  const rng = g.rng;
  const peds = [];
  const tmp = { x: 0, z: 0, dx: 0, dz: 0 };

  function spawnPed(x, z) {
    const mesh = makeFigure({
      shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS),
      skin: pick(rng, SKINS), hair: pick(rng, HAIRS),
    });
    g.scene.add(mesh);
    // home block = nearest block centre
    let bx = CENTERS[0], bz = CENTERS[0], bd = 1e9;
    for (const cx of CENTERS) for (const cz of CENTERS) {
      const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
      if (d < bd) { bd = d; bx = cx; bz = cz; }
    }
    const ped = {
      mesh, bx, bz, s: rng() * PER, dir: rng() < 0.5 ? 1 : -1,
      speed: randRange(rng, 1.1, 1.9), mode: 'walk',
      fleeT: 0, downT: 0, threat: { x: 0, z: 0 }, reported: false,
      cross: null,
    };
    perimeterPos(bx, bz, ped.s, tmp);
    mesh.position.set(tmp.x, 0.12, tmp.z);
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < CFG.pedCount; i++) {
    const bx = pick(rng, CENTERS), bz = pick(rng, CENTERS);
    perimeterPos(bx, bz, rng() * PER, tmp);
    spawnPed(tmp.x, tmp.z);
  }

  function downPed(ped, byCrime) {
    if (ped.mode === 'down') return;
    ped.mode = 'down'; ped.downT = 5;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
    if (byCrime && !ped.reported) { ped.reported = true; g.reportCrime('hitped', ped.mesh.position); }
  }

  return {
    peds,
    downPed,
    spawnNear(x, z, n) {
      // relocate the n farthest walkers onto blocks near a point (shot staging)
      const sorted = [...peds].sort((a, b) =>
        (Math.hypot(b.mesh.position.x - x, b.mesh.position.z - z)) -
        (Math.hypot(a.mesh.position.x - x, a.mesh.position.z - z)));
      for (let i = 0; i < Math.min(n, sorted.length); i++) {
        const ped = sorted[i];
        let bx = CENTERS[0], bz = CENTERS[0], bd = 1e9;
        for (const cx of CENTERS) for (const cz of CENTERS) {
          const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
          if (d < bd) { bd = d; bx = cx; bz = cz; }
        }
        ped.bx = bx; ped.bz = bz; ped.s = rng() * PER; ped.mode = 'walk';
        ped.mesh.rotation.x = 0; ped.mesh.position.y = 0.12;
        perimeterPos(bx, bz, ped.s, tmp);
        ped.mesh.position.set(tmp.x + randRange(rng, -6, 6), 0.12, tmp.z + randRange(rng, -6, 6));
      }
    },
    update(dt) {
      const pp = g.player.pos();
      for (const ped of peds) {
        const m = ped.mesh;
        if (ped.mode === 'down') {
          ped.downT -= dt;
          if (ped.downT <= 0) { ped.mode = 'walk'; m.rotation.x = 0; m.position.y = 0.12; ped.reported = false; }
          continue;
        }
        // run over?
        let hit = false;
        for (const c of g.cars) {
          if (Math.abs(c.speed) < 3.5) continue;
          const dx = m.position.x - c.mesh.position.x, dz = m.position.z - c.mesh.position.z;
          if (dx * dx + dz * dz < 1.5) { downPed(ped, true); hit = true; break; }
        }
        if (hit) continue;
        // flee gunfire / fast nearby cars
        if (ped.mode !== 'flee') {
          let threat = null;
          if (g.lastShot && S.time - g.lastShot.t < 2.5 &&
              Math.hypot(m.position.x - g.lastShot.x, m.position.z - g.lastShot.z) < 12) threat = g.lastShot;
          if (!threat) for (const c of g.cars) {
            if (Math.abs(c.speed) > 6 && Math.hypot(m.position.x - c.mesh.position.x, m.position.z - c.mesh.position.z) < 5.5) { threat = c.mesh.position; break; }
          }
          if (threat) { ped.mode = 'flee'; ped.fleeT = randRange(rng, 1.6, 2.6); ped.threat = { x: threat.x, z: threat.z }; }
        }
        if (ped.mode === 'flee') {
          ped.fleeT -= dt;
          const dx = m.position.x - ped.threat.x, dz = m.position.z - ped.threat.z;
          const d = Math.hypot(dx, dz) || 1;
          m.position.x += (dx / d) * 4.6 * dt;
          m.position.z += (dz / d) * 4.6 * dt;
          m.rotation.y = Math.atan2(dx, dz);
          collideCircle(m.position, 0.4, g.city.colliders);
          if (ped.fleeT <= 0) {
            ped.mode = 'walk';
            let bx = CENTERS[0], bz = CENTERS[0], bd = 1e9;
            for (const cx of CENTERS) for (const cz of CENTERS) {
              const dd = (cx - m.position.x) ** 2 + (cz - m.position.z) ** 2;
              if (dd < bd) { bd = dd; bx = cx; bz = cz; }
            }
            ped.bx = bx; ped.bz = bz; ped.s = rng() * PER;
          }
          continue;
        }
        if (ped.cross) {
          const dx = ped.cross.x - m.position.x, dz = ped.cross.z - m.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.5) { ped.cross = null; }
          else {
            m.position.x += (dx / d) * ped.speed * 1.25 * dt;
            m.position.z += (dz / d) * ped.speed * 1.25 * dt;
            m.rotation.y = Math.atan2(dx, dz);
          }
          continue;
        }
        // ordinary sidewalk loop
        ped.s += ped.speed * ped.dir * dt;
        perimeterPos(ped.bx, ped.bz, ped.s, tmp);
        m.position.x = tmp.x; m.position.z = tmp.z;
        m.rotation.y = Math.atan2(tmp.dx * ped.dir, tmp.dz * ped.dir);
        // at a corner, sometimes cross to the neighbouring block
        const nearCorner = Math.abs(((ped.s % SIDE) + SIDE) % SIDE) < 0.4;
        if (nearCorner && rng() < 0.003) {
          const opts = [];
          for (const cx of CENTERS) for (const cz of CENTERS)
            if ((Math.abs(cx - ped.bx) === 60 && cz === ped.bz) || (Math.abs(cz - ped.bz) === 60 && cx === ped.bx)) opts.push([cx, cz]);
          if (opts.length) {
            const [nx, nz] = pick(rng, opts);
            ped.bx = nx; ped.bz = nz; ped.s = rng() * PER;
            perimeterPos(nx, nz, ped.s, tmp);
            ped.cross = { x: tmp.x, z: tmp.z };
          }
        }
        // keep the city alive near Mari: recycle walkers who are very far away
        if (Math.hypot(m.position.x - pp.x, m.position.z - pp.z) > 210 && rng() < 0.01) {
          let bx = CENTERS[0], bz = CENTERS[0], bd = 1e9;
          for (const cx of CENTERS) for (const cz of CENTERS) {
            const dd = (cx - pp.x) ** 2 + (cz - pp.z) ** 2;
            if (dd < bd) { bd = dd; bx = cx; bz = cz; }
          }
          ped.bx = bx; ped.bz = bz; ped.s = rng() * PER;
        }
      }
    },
  };
}
