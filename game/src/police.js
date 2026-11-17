// police.js — the PSPD wanted system: crimes feed a heat meter (100 points a
// star, up to 5), cruisers spawn out of sight and pursue with prediction,
// the BUSTED meter fills when you sit stopped near them, and heat bleeds
// away while nobody can see you.

import { WANTED, CAPS, ROADS_X, ROADS_Z, BEACH_ROAD_Z } from './config.js';
import { createCar, driveCar, syncCarMesh } from './vehicles.js';
import { collideCircle } from './city.js';

export function createPolice(G) {
  const rng = G.rng.fork('police');
  const units = [];

  const api = {
    heat: 0,
    stars: 0,
    bustedMeter: 0,
    lastSeen: -99,
    nearestDist: 999,
    units,

    addHeat(n) {
      api.heat = Math.max(0, Math.min(500, api.heat + n));
    },
    setStars(n) {
      api.heat = n * WANTED.heatPerStar;
    },
    clearWanted() {
      api.heat = 0;
      api.bustedMeter = 0;
    },
    // one funnel for everything Mari does wrong
    reportCrime(kind, x, z, amount) {
      api.addHeat(amount);
      if (kind === 'gunshot' || kind === 'melee' || kind === 'pedHit') {
        G.pedestrians.scare(x, z, 26);
      }
    },
    update,
  };

  function desiredUnits() {
    if (api.stars <= 0) return 0;
    return Math.min(CAPS.police, 1 + api.stars);
  }

  function spawnPoint() {
    const p = G.player;
    // appear on a street, roughly WANTED.spawnDist away, out of the camera's eye
    for (let tries = 0; tries < 10; tries++) {
      const ang = rng.range(0, Math.PI * 2);
      const x = p.x + Math.sin(ang) * WANTED.spawnDist;
      const z = p.z + Math.cos(ang) * WANTED.spawnDist;
      if (x < -310 || x > 310 || z < -310 || z > 235) continue;
      // snap to the nearest street
      const snapX = ROADS_X.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
      const snapZ = [...ROADS_Z, BEACH_ROAD_Z].reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
      const useX = Math.abs(snapX - x) < Math.abs(snapZ - z);
      const sx = useX ? snapX : x;
      const sz = useX ? z : snapZ;
      // behind the camera is best
      const camYaw = G.player.camYaw;
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const dot = ((sx - p.x) * fx + (sz - p.z) * fz) / WANTED.spawnDist;
      if (dot > 0.45 && tries < 7) continue;
      return { x: sx, z: sz };
    }
    return { x: p.x + 70, z: p.z };
  }

  let spawnCooldown = 0;

  function update(dt) {
    const p = G.player;
    api.stars = api.heat <= 0 ? 0 : Math.min(5, Math.ceil(api.heat / WANTED.heatPerStar));
    spawnCooldown -= dt;

    // prune stolen/wrecked units
    for (let i = units.length - 1; i >= 0; i--) {
      if (units[i].driver !== 'police') units.splice(i, 1);
    }
    // spawn up to the desired strength
    if (units.length < desiredUnits() && spawnCooldown <= 0) {
      const s = spawnPoint();
      const car = createCar(G, 'police', 0xe8ecf0, s.x, s.z, Math.atan2(p.x - s.x, p.z - s.z));
      car.driver = 'police';
      car.cop = { reverse: 0, stuck: 0, lastX: s.x, lastZ: s.z };
      units.push(car);
      spawnCooldown = 1.2;
    }
    // despawn units left far behind; they rejoin via the spawner
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      const d = Math.hypot(u.x - p.x, u.z - p.z);
      if (d > 250 || (api.stars === 0 && d > 120)) {
        G.scene.remove(u.mesh);
        G.cars.splice(G.cars.indexOf(u), 1);
        units.splice(i, 1);
      }
    }

    // sight + heat decay
    api.nearestDist = 999;
    for (const u of units) {
      const d = Math.hypot(u.x - p.x, u.z - p.z);
      if (d < api.nearestDist) api.nearestDist = d;
    }
    if (api.nearestDist < 55) api.lastSeen = G.state.time;
    if (api.heat > 0 && G.state.time - api.lastSeen > WANTED.decayDelay) {
      api.heat = Math.max(0, api.heat - WANTED.decayRate * dt);
      if (api.heat === 0) api.bustedMeter = 0;
    }

    // pursuit driving
    const pSpeed = p.car ? Math.abs(p.car.speed) : 0;
    for (const u of units) {
      const cop = u.cop;
      const lead = Math.min(1.1, pSpeed * 0.045);
      const tx = p.x + Math.sin(p.heading) * pSpeed * lead * 2.2;
      const tz = p.z + Math.cos(p.heading) * pSpeed * lead * 2.2;
      const dx = tx - u.x, dz = tz - u.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - u.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      let steer = Math.max(-1, Math.min(1, diff * 2.4));
      let throttle = 1, brake = false;
      if (cop.reverse > 0) {
        cop.reverse -= dt;
        throttle = -1;
        steer = -steer;
      } else if (dist < 7 && pSpeed < 2) {
        // arrived: park on the suspect
        throttle = 0; brake = true;
      } else if (Math.abs(diff) > 2.5) {
        throttle = 0.35;
      }
      driveCar(u, dt, steer, throttle, brake);
      const hitWall = collideCircle(G, u, 1.35);
      if (hitWall && Math.abs(u.speed) > 5) u.speed *= 0.35;
      // unstick: if barely moving while the suspect is far, back up and retry
      const moved = Math.hypot(u.x - cop.lastX, u.z - cop.lastZ);
      if (moved < 0.3 && dist > 15) cop.stuck += dt; else { cop.stuck = 0; cop.lastX = u.x; cop.lastZ = u.z; }
      if (cop.stuck > 2.2) { cop.reverse = 0.8; cop.stuck = 0; }
      syncCarMesh(u, dt);
    }

    // BUSTED: stopped with a cruiser alongside
    const playerStopped = p.car ? Math.abs(p.car.speed) < 1.3 : true;
    if (api.stars > 0 && playerStopped && api.nearestDist < 13) {
      api.bustedMeter = Math.min(1, api.bustedMeter + dt / WANTED.bustedTime);
      if (api.bustedMeter >= 1 && G.onBusted) G.onBusted();
    } else {
      api.bustedMeter = Math.max(0, api.bustedMeter - dt * 1.5);
    }
  }

  return api;
}
