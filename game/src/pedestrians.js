// pedestrians.js — Port Serena on foot: locals who stroll the sidewalks block
// by block, cross at the corners, and scatter when a car mounts the pavement
// or a shot rings out.

import { ROADS_X, ROADS_Z, BEACH_ROAD_Z, CAPS } from './config.js';
import { buildHumanoid, poseHumanoid, randomPersonColors } from './vehicles.js';
import { collideCircle } from './city.js';

const WALK_LINES = [];
// sidewalk loops run 11.5 m out from each road centreline (road edge + pavement)
for (const bx of [-225, -135, -45, 45, 135, 225]) {
  for (const bz of [-225, -135, -45, 45, 135, 206]) {
    WALK_LINES.push({ x: bx, z: bz });
  }
}

export function createPedestrians(G) {
  const rng = G.rng.fork('peds');
  const peds = [];

  function blockLoop(cx, cz) {
    const h = cz === 206 ? 25 : 41.5;
    const w = 41.5;
    return [
      { x: cx - w, z: cz - h }, { x: cx + w, z: cz - h },
      { x: cx + w, z: cz + h }, { x: cx - w, z: cz + h },
    ];
  }

  function respawn(ped) {
    const block = rng.pick(WALK_LINES);
    ped.loop = blockLoop(block.x, block.z);
    ped.seg = rng.int(0, 3);
    const a = ped.loop[ped.seg];
    const b = ped.loop[(ped.seg + 1) % 4];
    const t = rng.float();
    ped.x = a.x + (b.x - a.x) * t;
    ped.z = a.z + (b.z - a.z) * t;
    ped.flee = 0;
    ped.dead = false;
    ped.mesh.visible = true;
  }

  for (let i = 0; i < CAPS.peds; i++) {
    const mesh = buildHumanoid(randomPersonColors(rng));
    G.scene.add(mesh);
    const ped = {
      mesh, x: 0, z: 0, heading: 0, speed: 0,
      walkPhase: rng.range(0, 6),
      loop: null, seg: 0, flee: 0, fleeX: 0, fleeZ: 0,
      dead: false, deadTimer: 0,
      pace: rng.range(1.1, 1.7),
    };
    respawn(ped);
    // spread the crowd: keep some near the player's side of town
    if (i % 3 === 0) {
      ped.x = G.player.x + rng.range(-50, 50);
      ped.z = G.player.z + rng.range(-50, 50);
      collideCircle(G, ped, 0.5);
    }
    peds.push(ped);
    G.peds.push(ped);
  }

  function scare(x, z, radius) {
    for (const ped of peds) {
      if (ped.dead) continue;
      const dx = ped.x - x, dz = ped.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        ped.flee = rng.range(1.6, 2.8);
        ped.fleeX = d > 0.1 ? dx / d : 1;
        ped.fleeZ = d > 0.1 ? dz / d : 0;
      }
    }
  }

  function update(dt) {
    for (const ped of peds) {
      if (ped.dead) {
        ped.deadTimer -= dt;
        if (ped.deadTimer <= 0) respawn(ped);
        continue;
      }
      let tx, tz, speed;
      if (ped.flee > 0) {
        ped.flee -= dt;
        tx = ped.x + ped.fleeX * 10;
        tz = ped.z + ped.fleeZ * 10;
        speed = 4.6;
      } else {
        const target = ped.loop[(ped.seg + 1) % 4];
        tx = target.x; tz = target.z;
        speed = ped.pace;
        const dx = tx - ped.x, dz = tz - ped.z;
        if (dx * dx + dz * dz < 1.2) {
          ped.seg = (ped.seg + 1) % 4;
          // occasionally cross the street: jump to the neighbouring loop
          if (rng.chance(0.1)) {
            const block = rng.pick(WALK_LINES);
            ped.loop = blockLoop(block.x, block.z);
            ped.seg = rng.int(0, 3);
          }
          continue;
        }
      }
      const dx = tx - ped.x, dz = tz - ped.z;
      const d = Math.hypot(dx, dz) || 1;
      const vx = (dx / d) * speed, vz = (dz / d) * speed;
      ped.x += vx * dt;
      ped.z += vz * dt;
      ped.heading = Math.atan2(vx, vz);
      ped.walkPhase += dt * speed * 2.4;
      collideCircle(G, ped, 0.45);
      // cars are terrifying up close
      for (const car of G.cars) {
        if (Math.abs(car.speed) < 2) continue;
        const cdx = ped.x - car.x, cdz = ped.z - car.z;
        if (cdx * cdx + cdz * cdz < 16 && ped.flee <= 0) {
          ped.flee = 1.4;
          const cd = Math.hypot(cdx, cdz) || 1;
          ped.fleeX = cdx / cd; ped.fleeZ = cdz / cd;
        }
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      poseHumanoid(ped.mesh, ped.walkPhase, speed, false);
    }
  }

  return { update, scare, peds };
}
