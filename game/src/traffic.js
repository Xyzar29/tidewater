// TIDEWATER — traffic AI: lane following on the road grid, parked cars.

import { CITY, WORLD } from './config.js';
import { roadX, roadZ, collide } from './city.js';
import { createCarMesh, makeCarState, pickBodyColor, stepCar, syncCarMesh } from './vehicles.js';

const LANE = 3;

export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.cars = []; this.parked = []; this.colliders = colliders;
    const kinds = ['sedan', 'sedan', 'hatch', 'van'];
    for (let i = 0; i < WORLD.trafficCap; i++) {
      const horiz = rng.chance(0.5);
      const laneIdx = rng.int(0, (horiz ? CITY.gridZ : CITY.gridX) - 1);
      const along = rng.range(-110, 110);
      const dir = rng.chance(0.5) ? 1 : -1;
      let x, z, heading;
      if (horiz) { z = roadZ(laneIdx) + dir * LANE; x = along; heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { x = roadX(laneIdx) + dir * LANE; z = along; heading = dir > 0 ? 0 : Math.PI; }
      const kind = rng.pick(kinds);
      const s = makeCarState(x, z, heading, kind);
      s.ai = { horiz, laneIdx, dir, cruise: rng.range(8, 13), pause: 0 };
      s.mesh = createCarMesh(kind, pickBodyColor(rng));
      scene.add(s.mesh); syncCarMesh(s);
      this.cars.push(s);
    }
    // parked cars along streets (stealable)
    for (let i = 0; i < 14; i++) {
      const horiz = rng.chance(0.5);
      const laneIdx = rng.int(0, (horiz ? CITY.gridZ : CITY.gridX) - 1);
      const along = rng.range(-110, 110);
      let x, z, heading;
      if (horiz) { z = roadZ(laneIdx) + 5.2; x = along; heading = Math.PI / 2; }
      else { x = roadX(laneIdx) + 5.2; z = along; heading = 0; }
      const kind = rng.pick(kinds);
      const s = makeCarState(x, z, heading, kind);
      s.parked = true;
      s.mesh = createCarMesh(kind, pickBodyColor(rng));
      scene.add(s.mesh); syncCarMesh(s);
      this.parked.push(s); this.cars.push(s);
    }
    // the yellow sports car at the beachfront hotel
    this.sportCar = makeCarState(roadX(4) + 8, roadZ(5) - 12, Math.PI / 2, 'sport');
    this.sportCar.parked = true; this.sportCar.isSport = true;
    this.sportCar.mesh = createCarMesh('sport', 0xffd21f);
    scene.add(this.sportCar.mesh); syncCarMesh(this.sportCar);
    this.parked.push(this.sportCar); this.cars.push(this.sportCar);
  }

  allCars() { return this.cars; }

  update(dt, playerPos) {
    for (const s of this.cars) {
      if (s.parked || s.isPlayerCar || s.disabled) { syncCarMesh(s); continue; }
      const ai = s.ai; if (!ai) continue;
      // slow for car ahead
      let throttle = 1, target = ai.cruise;
      for (const o of this.cars) {
        if (o === s) continue;
        const dx = o.x - s.x, dz = o.z - s.z;
        const fwd = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
        const lat = Math.abs(dx * Math.cos(s.heading) - dz * Math.sin(s.heading));
        if (fwd > 0 && fwd < 9 && lat < 2.2) { target = Math.min(target, Math.max(0, o.speed)); if (fwd < 5) target = 0; }
      }
      if (playerPos) {
        const dx = playerPos.x - s.x, dz = playerPos.z - s.z;
        if (dx * dx + dz * dz < 36) target = Math.min(target, 4);
      }
      if (ai.pause > 0) { ai.pause -= dt; target = 0; }
      const thr = s.speed < target ? 0.7 : (s.speed > target + 1 ? -0.4 : 0);
      stepCar(s, thr, 0, dt);
      s.speed = Math.min(s.speed, Math.max(target, 0) + 2);
      // turn at world edge: flip direction (U-turn onto opposite lane)
      const lim = 118;
      if (Math.abs(s.x) > lim || Math.abs(s.z) > lim) {
        ai.dir *= -1;
        if (ai.horiz) { s.z = roadZ(ai.laneIdx) + ai.dir * LANE; s.heading = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2; s.x = Math.max(-lim, Math.min(lim, s.x)); }
        else { s.x = roadX(ai.laneIdx) + ai.dir * LANE; s.heading = ai.dir > 0 ? 0 : Math.PI; s.z = Math.max(-lim, Math.min(lim, s.z)); }
        ai.pause = 0.4;
      }
      // keep on lane centre gently
      if (ai.horiz) s.z += (roadZ(ai.laneIdx) + ai.dir * LANE - s.z) * Math.min(1, dt * 2);
      else s.x += (roadX(ai.laneIdx) + ai.dir * LANE - s.x) * Math.min(1, dt * 2);
      syncCarMesh(s);
    }
  }
}
