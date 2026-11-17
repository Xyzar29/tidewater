// traffic.js — Port Serena's drivers: lane-following cars on the street grid
// that brake for the car ahead, pause at junctions, and stream in around the
// player — plus the parked cars lining the kerbs. Every one can be stolen.
import { STREETS, CFG } from './config.js';
import { createCar, driveCar } from './vehicles.js';
import { randRange, pick } from './random.js';

const TYPES = ['sedan', 'hatch', 'van', 'sports'];
const COLORS = [0xd8574a, 0x4a90d8, 0xf2c14e, 0x7fc46a, 0xe8e4da, 0x8a7fd6, 0xef8fb5, 0x5fc4b5, 0xd97b3f, 0x9fb4c7];
const DIRS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
const CRUISE = 11.5;

export function createTraffic(g) {
  const rng = g.rng;
  const drivers = [];

  function placeOnLeg(car, ax, az, dir, along) {
    const rx = -dir.z, rz = dir.x; // right-hand lane offset
    car.mesh.position.set(ax + dir.x * along + rx * 3.4, 0, az + dir.z * along + rz * 3.4);
    car.heading = Math.atan2(dir.x, dir.z);
    car.mesh.rotation.y = car.heading;
    return { ax, az, dir };
  }

  function spawnDriver(car, nearPos) {
    let ax, az;
    if (nearPos) {
      ax = STREETS.reduce((a, b) => Math.abs(b - nearPos.x) < Math.abs(a - nearPos.x) ? b : a);
      az = STREETS.reduce((a, b) => Math.abs(b - nearPos.z) < Math.abs(a - nearPos.z) ? b : a);
      ax += (rng() < 0.5 ? -60 : 60); az += (rng() < 0.5 ? -60 : 60);
      ax = Math.max(-180, Math.min(180, ax)); az = Math.max(-180, Math.min(180, az));
    } else {
      ax = pick(rng, STREETS); az = pick(rng, STREETS);
    }
    const dir = pick(rng, DIRS);
    const leg = placeOnLeg(car, ax, az, dir, randRange(rng, 2, 34));
    return { car, leg, pauseT: 0 };
  }

  for (let i = 0; i < CFG.trafficCount; i++) {
    const car = createCar(pick(rng, TYPES), pick(rng, COLORS));
    car.driver = 'traffic';
    g.scene.add(car.mesh); g.cars.push(car);
    drivers.push(spawnDriver(car, null));
  }
  // parked cars along the kerbs
  for (let i = 0; i < CFG.parkedCount; i++) {
    const car = createCar(pick(rng, TYPES), pick(rng, COLORS));
    car.driver = 'parked';
    const vertical = rng() < 0.5, c = pick(rng, STREETS), side = rng() < 0.5 ? -5.6 : 5.6;
    let ok = false;
    for (let tries = 0; tries < 6 && !ok; tries++) {
      const along = randRange(rng, -200, 200);
      const x = vertical ? c + side : along;
      const z = vertical ? along : c + side;
      ok = g.cars.every(o => Math.hypot(o.mesh.position.x - x, o.mesh.position.z - z) > 6);
      if (ok) {
        car.mesh.position.set(x, 0, z);
        car.heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        car.mesh.rotation.y = car.heading;
      }
    }
    if (ok) { g.scene.add(car.mesh); g.cars.push(car); }
  }

  function obstacleAhead(car, f) {
    const p = car.mesh.position;
    const rx = -f.z, rz = f.x;
    for (const o of g.cars) {
      if (o === car) continue;
      const dx = o.mesh.position.x - p.x, dz = o.mesh.position.z - p.z;
      const ahead = dx * f.x + dz * f.z, lat = dx * rx + dz * rz;
      if (ahead > 0 && ahead < 8.5 && Math.abs(lat) < 2.1) return true;
    }
    for (const ped of g.peds.peds) {
      if (ped.mode === 'down') continue;
      const dx = ped.mesh.position.x - p.x, dz = ped.mesh.position.z - p.z;
      const ahead = dx * f.x + dz * f.z, lat = dx * rx + dz * rz;
      if (ahead > 0 && ahead < 6.5 && Math.abs(lat) < 1.7) return true;
    }
    return false;
  }

  return {
    update(dt) {
      const pp = g.player.pos();
      for (const d of drivers) {
        const car = d.car;
        if (car.driver !== 'traffic') continue; // stolen or parked by the player
        const p = car.mesh.position;
        // stream the city around Mari
        if (Math.hypot(p.x - pp.x, p.z - pp.z) > 205) {
          const nd = spawnDriver(car, pp);
          d.leg = nd.leg; d.pauseT = 0;
          continue;
        }
        if (d.pauseT > 0) {
          d.pauseT -= dt;
          driveCar(car, dt, 0, 0, g, car.speed > 0.5);
          continue;
        }
        const { dir } = d.leg;
        const rx = -dir.z, rz = dir.x;
        const progress = (p.x - d.leg.ax) * dir.x + (p.z - d.leg.az) * dir.z;
        const aimX = d.leg.ax + dir.x * (progress + 11) + rx * 3.4;
        const aimZ = d.leg.az + dir.z * (progress + 11) + rz * 3.4;
        const desired = Math.atan2(aimX - p.x, aimZ - p.z);
        let diff = desired - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.7));
        const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
        let throttle = Math.abs(diff) > 1.1 ? 0.3 : 1;
        if (car.speed > CRUISE) throttle = Math.min(throttle, 0);
        if (obstacleAhead(car, f)) throttle = car.speed > 1 ? -0.7 : 0;
        driveCar(car, dt, throttle, steer, g, false);
        if (progress > 55) {
          // choose the next leg at the junction: mostly straight, sometimes a turn
          const bx = d.leg.ax + dir.x * 60, bz = d.leg.az + dir.z * 60;
          const options = DIRS.filter(nd => {
            const nx = bx + nd.x * 60, nz = bz + nd.z * 60;
            return nx >= -181 && nx <= 181 && nz >= -181 && nz <= 181 && !(nd.x === -dir.x && nd.z === -dir.z);
          });
          const straight = options.find(nd => nd.x === dir.x && nd.z === dir.z);
          const nd = (straight && rng() < 0.62) ? straight : pick(rng, options.length ? options : [dir]);
          d.leg = { ax: bx, az: bz, dir: nd };
          if (rng() < 0.16) d.pauseT = randRange(rng, 0.5, 1.1);
        }
      }
    },
  };
}
