// police.js — the Port Serena PD. Wanted runs 0–5 stars: crimes and
// missions raise it, cruisers spawn out of sight and hunt with a predicted
// intercept, and standing still next to one fills the BUSTED meter. Break
// visual contact long enough and the stars bleed away one by one.

import { PITCH, GRID, MAX_STARS, POLICE_CAP, SIGHT_RANGE, LOSE_SIGHT_TIME, STAR_DECAY_TIME, BUST_TIME } from './config.js';
import { createCar, placeCar, stepCar } from './vehicles.js';

const LINES = [];
for (let k = -GRID; k <= GRID; k++) LINES.push(k * PITCH);

export class Police {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];
    this.stars = 0;
    this.lastSeen = 999;     // seconds since any cruiser had eyes on Mari
    this.decayT = 0;
    this.bustedMeter = 0;
    this.bustedEvent = false; // main consumes this and shows the BUSTED screen
    this.time = 0;
  }

  get wanted() { return this.stars; }

  setWanted(n) {
    this.stars = Math.max(0, Math.min(MAX_STARS, Math.floor(n)));
    if (this.stars > 0) this.lastSeen = 0;
  }

  // A crime guarantees at least n stars (never lowers the current level).
  reportCrime(n) {
    if (n > this.stars) this.setWanted(n);
    else if (this.stars > 0) this.lastSeen = 0;
  }

  clearWanted() {
    this.stars = 0;
    this.bustedMeter = 0;
    this.decayT = 0;
    this.lastSeen = 999;
  }

  desiredCruisers() {
    if (this.stars === 0) return 0;
    return Math.min(POLICE_CAP, this.stars + 1);
  }

  spawnCruiser(playerPos) {
    // On a street, well away from the player so it arrives, not appears.
    const angle = this.rng.range(0, Math.PI * 2);
    let x = playerPos.x + Math.sin(angle) * 150;
    let z = playerPos.z + Math.cos(angle) * 150;
    // Snap the larger axis onto a street line so it starts on a road.
    if (Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle))) {
      z = LINES.reduce((best, l) => (Math.abs(l - z) < Math.abs(best - z) ? l : best), LINES[0]);
    } else {
      x = LINES.reduce((best, l) => (Math.abs(l - x) < Math.abs(best - x) ? l : best), LINES[0]);
    }
    x = Math.max(-190, Math.min(190, x));
    z = Math.max(-190, Math.min(200, z));
    const car = createCar('police', 0xf2f4f6);
    const heading = Math.atan2(playerPos.x - x, playerPos.z - z);
    placeCar(car, x, z, heading);
    car.occupied = true;
    car.leaving = false;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  removeCruiser(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
  }

  nearestDist(playerPos) {
    let best = Infinity;
    for (const car of this.cars) {
      const cp = car.mesh.position;
      const d = Math.hypot(cp.x - playerPos.x, cp.z - playerPos.z);
      if (d < best) best = d;
    }
    return best;
  }

  // Is the straight run a→b free of buildings? (Sampled, arcade-cheap.)
  hasLOS(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of this.colliders) {
        if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return false;
      }
    }
    return true;
  }

  update(dt, player, allCars) {
    this.time += dt;
    const ppos = player.pos;
    const want = this.desiredCruisers();

    // Maintain the fleet size for the current wanted level.
    const active = this.cars.filter((c) => !c.leaving);
    if (active.length < want) this.spawnCruiser(ppos);
    if (this.stars === 0) {
      for (const car of this.cars) car.leaving = true;
    }

    // Visual contact: any active cruiser close enough has eyes on her.
    let seen = false;
    let nearest = Infinity;
    for (const car of this.cars) {
      const cp = car.mesh.position;
      const d = Math.hypot(cp.x - ppos.x, cp.z - ppos.z);
      if (d < nearest) nearest = d;
      if (!car.leaving && d < SIGHT_RANGE) seen = true;
    }
    if (seen) { this.lastSeen = 0; this.decayT = 0; }
    else this.lastSeen += dt;

    // Star decay while hidden.
    if (this.stars > 0 && this.lastSeen > LOSE_SIGHT_TIME) {
      this.decayT += dt;
      if (this.decayT >= STAR_DECAY_TIME) {
        this.decayT = 0;
        this.setWanted(this.stars - 1);
      }
    } else {
      this.decayT = 0;
    }

    // BUSTED: caught standing (or crawling) right next to a cruiser.
    if (this.stars > 0 && player.speed < 1.1 && nearest < 10.5) {
      this.bustedMeter += dt / BUST_TIME;
      if (this.bustedMeter >= 1) {
        this.bustedMeter = 0;
        this.bustedEvent = true;
      }
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.7);
    }

    // Drive the cruisers.
    const pVel = player.mode === 'car' && player.car
      ? { x: Math.sin(player.car.heading) * player.car.speed, z: Math.cos(player.car.heading) * player.car.speed }
      : { x: 0, z: 0 };
    for (const car of [...this.cars]) {
      const pos = car.mesh.position;
      // Flash the light bar.
      if (car.lightbar) {
        const phase = Math.floor(this.time * 6) % 2 === 0;
        car.lightbar.children[0].visible = phase;
        car.lightbar.children[1].visible = !phase;
      }
      if (car.leaving) {
        stepCar(car, dt, { throttle: car.speed < 10 ? 0.6 : 0, steer: 0, brake: false }, this.colliders, allCars);
        const d = Math.hypot(pos.x - ppos.x, pos.z - ppos.z);
        if (d > 190 || this.stars > 0) {
          if (this.stars > 0) { car.leaving = false; }
          else this.removeCruiser(car);
        }
        continue;
      }
      // Wedged on a facade or stuck in a jam? Radio in a fresh unit: a
      // cruiser that barely closes the distance for seconds at a time is
      // replaced by one spawning on a clear street.
      const distToPlayer = Math.hypot(ppos.x - pos.x, ppos.z - pos.z);
      if (car.bestDist === undefined || distToPlayer < car.bestDist - 2) {
        car.bestDist = distToPlayer;
        car.progT = 0;
      } else {
        car.progT = (car.progT || 0) + dt;
      }
      const wedged = Math.abs(car.speed) < 0.9 && distToPlayer > 22;
      if ((wedged && (car.stuckT = (car.stuckT || 0) + dt) > 4)
        || (distToPlayer > 30 && car.progT > 6)) {
        this.removeCruiser(car);
        this.spawnCruiser(ppos);
        continue;
      }
      if (!wedged) car.stuckT = 0;
      // Intercept: aim where she will be, favouring her rear quarter.
      // When a building blocks the line, aim for her nearest intersection
      // first — cruisers hunt along streets, not through facades.
      let tx = ppos.x + pVel.x * 0.45 - Math.sin(player.heading) * 2.5;
      let tz = ppos.z + pVel.z * 0.45 - Math.cos(player.heading) * 2.5;
      const distNow = Math.hypot(ppos.x - pos.x, ppos.z - pos.z);
      if (distNow > 34 && !this.hasLOS(pos, ppos)) {
        tx = Math.round(ppos.x / PITCH) * PITCH;
        tz = Math.round(ppos.z / PITCH) * PITCH;
      }
      const dx = tx - pos.x, dz = tz - pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.4));
      let throttle = 1;
      if (dist < 7) throttle = 0.25;
      if (Math.abs(diff) > 2.4 && car.speed > 6) throttle = -0.6; // too sharp: back up
      stepCar(car, dt, { throttle, steer, brake: false }, this.colliders, allCars);
    }
  }
}
