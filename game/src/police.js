// TIDEWATER — wanted system + police pursuit AI.

import { WANTED } from './config.js';
import { createCarMesh, makeCarState, stepCar, syncCarMesh } from './vehicles.js';
import { collide } from './city.js';

const CRIME_STARS = { theft: 1, assault: 1, shot: 2, hitPed: 2, hitCar: 1, robbery: 4 };

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.stars = 0; this.cars = []; this.busted = 0; this.unseenT = 0; this.lastCrimeT = 0;
    this.onBusted = null;
  }
  commitCrime(kind) {
    const add = CRIME_STARS[kind] || 1;
    this.stars = Math.min(5, Math.max(this.stars, add === 4 ? 4 : this.stars + (this.stars === 0 ? add : Math.ceil(add / 2))));
    if (kind === 'robbery') this.stars = Math.max(this.stars, 4);
    this.unseenT = 0; this.lastCrimeT = performance.now() / 1000;
  }
  setStars(n) { this.stars = Math.max(0, Math.min(5, n)); this.unseenT = 0; }
  clear() { this.stars = 0; this.busted = 0; for (const c of this.cars) this.scene.remove(c.mesh); this.cars = []; }

  spawnOne(playerPos) {
    const ang = Math.random() * Math.PI * 2;
    const d = 55 + Math.random() * 20;
    const x = Math.max(-125, Math.min(125, playerPos.x + Math.sin(ang) * d));
    const z = Math.max(-125, Math.min(125, playerPos.z + Math.cos(ang) * d));
    const s = makeCarState(x, z, Math.atan2(playerPos.x - x, playerPos.z - z), 'police');
    s.mesh = createCarMesh('police'); this.scene.add(s.mesh); syncCarMesh(s);
    this.cars.push(s);
  }

  update(dt, player, now) {
    const want = WANTED.policeByStars[this.stars] || 0;
    const pp = player.pos;
    if (this.stars > 0 && this.cars.length < want) this.spawnOne(pp);
    if (this.cars.length > want + 2) { const c = this.cars.pop(); this.scene.remove(c.mesh); }
    let nearest = 1e9; let seen = false;
    for (const c of this.cars) {
      const dx = pp.x - c.x, dz = pp.z - c.z;
      const dist = Math.hypot(dx, dz); nearest = Math.min(nearest, dist);
      if (dist < 70) seen = true;
      // pursuit steering: aim at player, ram when close
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - c.heading;
      while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, -diff * 1.6));
      const thr = dist > 6 ? 1 : 0.4;
      stepCar(c, thr, steer, dt, true);
      c.speed = Math.min(c.speed, 30);
      const pos = { x: c.x, z: c.z }; collide(pos, 1.4, this.colliders);
      if (pos.x !== c.x || pos.z !== c.z) { c.x = pos.x; c.z = pos.z; c.speed *= 0.5; }
      syncCarMesh(c);
    }
    // wanted decay when unseen
    if (this.stars > 0) {
      if (!seen) { this.unseenT += dt; if (this.unseenT > WANTED.decaySeconds) { this.stars--; this.unseenT = 0; if (this.stars === 0) this.clear(); } }
      else this.unseenT = 0;
    }
    // busted meter: player slow/on foot near police
    const playerSpeed = player.mode === 'car' && player.car ? Math.abs(player.car.speed) : 0;
    if (this.stars > 0 && nearest < 9 && playerSpeed < 2.5) {
      this.busted += WANTED.bustedFillRate * dt;
      if (this.busted >= 1) { this.busted = 0; if (this.onBusted) this.onBusted(); }
    } else {
      this.busted = Math.max(0, this.busted - WANTED.bustedDrainRate * dt);
    }
    return { nearest, seen };
  }
}
