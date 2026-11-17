// The PSPD: a heat-based wanted system. Crimes add heat; heat maps to
// 0–5 stars; patrol cars spawn at the city edge of the player's view,
// pursue and ram; the BUSTED meter fills while the player is stopped
// near an officer. Stay out of sight and the heat bleeds away star by
// star until the chase is called off.

import { WORLD } from './config.js';
import { spawnCar, removeCar, driveCar, steerToward } from './vehicles.js';
import { clamp } from './random.js';

const { lines } = WORLD;
const HEAT_FOR_STARS = [0, 40, 110, 200, 320, 470];
const CRIME_HEAT = {
  theft: 55, crash: 16, hitandrun: 130, gunshot: 70,
  melee: 45, robbery: 260, mission: 90,
};

export function createPolice(G) {
  const police = {
    heat: 0, stars: 0, floor: 0,
    unseenT: 0, bustedMeter: 0, spawnT: 0, flashT: 0,
    cars: [],

    reportCrime(kind, x, z) {
      const add = CRIME_HEAT[kind] || 20;
      this.heat = Math.min(560, this.heat + add);
      this.unseenT = 0;
    },
    setStarsAtLeast(n) {
      this.heat = Math.max(this.heat, HEAT_FOR_STARS[n] || 0);
    },
    setFloor(n) { this.floor = n; },
    clear() {
      this.heat = 0; this.floor = 0; this.bustedMeter = 0;
    },
    desiredCops() {
      if (this.stars === 0) return 0;
      return Math.min(2 + this.stars, 6);
    },
  };
  G.police = police;
  return police;
}

function spawnCop(G) {
  const p = G.player;
  // Pick an intersection 70–110 m away: close enough to matter, far
  // enough to feel like a response rather than a teleport.
  let spot = null;
  for (let tries = 0; tries < 12 && !spot; tries++) {
    const lx = G.rng.pick(lines), lz = G.rng.pick(lines);
    const d = Math.hypot(lx - p.x, lz - p.z);
    if (d > 65 && d < 115) spot = { x: lx, z: lz };
  }
  if (!spot) spot = { x: lines[0], z: lines[0] };
  const car = spawnCar(G, {
    type: 'police', color: 0xf2f0eb, x: spot.x, z: spot.z,
    heading: Math.atan2(p.x - spot.x, p.z - spot.z), kind: 'police',
  });
  car.occupant = 'ai';
  G.police.cars.push(car);
  return car;
}

export function updatePolice(G, dt) {
  const pol = G.police;
  const p = G.player;

  // Stars from heat, respecting the mission floor.
  let stars = 0;
  for (let i = 5; i >= 1; i--) if (pol.heat >= HEAT_FOR_STARS[i]) { stars = i; break; }
  pol.stars = Math.max(stars, pol.floor);

  // Are we seen? Any active patrol within 55 m counts.
  let nearestCop = Infinity;
  for (const car of pol.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < nearestCop) nearestCop = d;
  }
  const seen = pol.stars > 0 && nearestCop < 55;
  if (seen) pol.unseenT = 0;
  else pol.unseenT += dt;
  if (pol.unseenT > 4 && pol.floor === 0) {
    pol.heat = Math.max(0, pol.heat - 13 * dt);
  }

  // Spawn / retire patrols.
  pol.spawnT -= dt;
  const alive = pol.cars.filter((c) => !c.dead);
  pol.cars = alive;
  if (pol.stars > 0 && alive.length < pol.desiredCops() && pol.spawnT <= 0) {
    spawnCop(G);
    pol.spawnT = 1.1;
  }

  pol.flashT += dt;
  const flashPhase = Math.floor(pol.flashT * 2.4) % 2 === 0;
  let sirenNear = false;

  for (const car of pol.cars) {
    const bar = car.mesh.userData.lightBar;
    if (bar) {
      bar.red.material.color.setHex(flashPhase ? 0xff2a2a : 0x661111);
      bar.blue.material.color.setHex(flashPhase ? 0x112266 : 0x2a5aff);
    }
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < 75 && pol.stars > 0) sirenNear = true;
    if (pol.stars === 0) {
      // Chase called off: drive away and despawn once distant.
      if (d > 130) { removeCar(G, car); continue; }
      const away = { x: car.x + (car.x - p.x), z: car.z + (car.z - p.z) };
      driveCar(G, car, dt, steerToward(car, away.x, away.z, dt));
      continue;
    }
    if (d > 240) {
      // Fallen too far behind: re-stage at the edge of the action.
      const lx = G.rng.pick(lines), lz = G.rng.pick(lines);
      if (Math.hypot(lx - p.x, lz - p.z) > 60) {
        car.x = lx; car.z = lz; car.speed = 0;
        car.mesh.position.set(car.x, 0, car.z);
      }
      continue;
    }
    // Pursuit: aim where the player will be, not where they are.
    let tx = p.x, tz = p.z;
    if (p.driving) {
      tx += Math.sin(p.car.heading) * p.car.speed * 0.45;
      tz += Math.cos(p.car.heading) * p.car.speed * 0.45;
    }
    const input = steerToward(car, tx, tz, dt, { slowNear: 6 });
    driveCar(G, car, dt, input);
  }
  pol.cars = pol.cars.filter((c) => !c.dead);
  G.audio.siren(sirenNear && G.state === 'playing');

  // BUSTED meter: stopped (or on foot and cornered) with police close.
  const playerSlow = p.driving ? Math.abs(p.car.speed) < 2.2 : !anyMoveKey(G);
  if (pol.stars > 0 && playerSlow && nearestCop < 13) {
    pol.bustedMeter += dt / 2.8;
    if (pol.bustedMeter >= 1) {
      pol.bustedMeter = 0;
      G.onBusted();
    }
  } else {
    pol.bustedMeter = Math.max(0, pol.bustedMeter - dt * 1.4);
  }
}

function anyMoveKey(G) {
  const k = G.input.keys;
  return k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD');
}

export function wantedStars(G) { return G.police.stars; }
export { clamp };
