// traffic.js — Port Serena's drivers: cars that follow the road grid lane by
// lane, brake for the car ahead, pause at junctions, stop for pedestrians,
// plus the parked cars lining the kerbs (all of them stealable).

import { ROADS_X, ROADS_Z, BEACH_ROAD_Z, LANE, CAPS, CAR_COLORS } from './config.js';
import { createCar, driveCar, syncCarMesh } from './vehicles.js';

const DIRS = [
  { x: 0, z: -1 }, // north
  { x: 0, z: 1 }, // south
  { x: 1, z: 0 }, // east
  { x: -1, z: 0 }, // west
];
// right-hand side of a heading, for lane offset
function rightOf(d) {
  return { x: -d.z, z: d.x };
}
function headingOf(d) {
  return Math.atan2(d.x, d.z);
}
function nodeKey(x, z) {
  return x + ',' + z;
}

export function createTraffic(G) {
  const rng = G.rng.fork('traffic');
  const nodes = new Set();
  const nodeList = [];
  for (const x of ROADS_X) {
    for (const z of [...ROADS_Z, BEACH_ROAD_Z]) {
      nodes.add(nodeKey(x, z));
      nodeList.push({ x, z });
    }
  }

  function neighbour(node, d) {
    // next intersection along d: scan the road coordinate lists
    if (d.x !== 0) {
      const xs = ROADS_X.filter((v) => (d.x > 0 ? v > node.x : v < node.x));
      if (!xs.length) return null;
      const nx = d.x > 0 ? Math.min(...xs) : Math.max(...xs);
      return nodes.has(nodeKey(nx, node.z)) ? { x: nx, z: node.z } : null;
    }
    const zs = [...ROADS_Z, BEACH_ROAD_Z].filter((v) => (d.z > 0 ? v > node.z : v < node.z));
    if (!zs.length) return null;
    const nz = d.z > 0 ? Math.min(...zs) : Math.max(...zs);
    return nodes.has(nodeKey(node.x, nz)) ? { x: node.x, z: nz } : null;
  }

  function lanePoint(node, d) {
    const r = rightOf(d);
    return { x: node.x + r.x * LANE, z: node.z + r.z * LANE };
  }

  function spawnCar(car) {
    // pick a node + direction far from the player when possible
    let node = rng.pick(nodeList);
    for (let tries = 0; tries < 8; tries++) {
      const cand = rng.pick(nodeList);
      const dx = cand.x - G.player.x, dz = cand.z - G.player.z;
      if (dx * dx + dz * dz > 150 * 150) { node = cand; break; }
    }
    const d = rng.pick(DIRS.filter((dd) => neighbour(node, dd)));
    const next = neighbour(node, d);
    const r = rightOf(d);
    const t = rng.range(0.15, 0.8);
    car.x = node.x + (next.x - node.x) * t + r.x * LANE;
    car.z = node.z + (next.z - node.z) * t + r.z * LANE;
    car.heading = headingOf(d);
    car.speed = 0;
    car.route = { node: next, dir: d, pause: 0, stuck: 0, lastX: car.x, lastZ: car.z };
    syncCarMesh(car, 0);
  }

  const cars = [];
  const types = ['sedan', 'hatch', 'wagon', 'sedan', 'hatch'];
  for (let i = 0; i < CAPS.traffic; i++) {
    const car = createCar(G, rng.pick(types), rng.pick(CAR_COLORS), 0, 0, 0);
    car.driver = 'traffic';
    spawnCar(car);
    cars.push(car);
  }

  // parked cars along kerbs
  const parkedSpots = [];
  for (const bx of [-225, -135, -45, 45, 135, 225]) {
    for (const bz of [-225, -135, -45, 45, 135]) {
      if (rng.chance(0.55)) {
        parkedSpots.push({
          x: bx + rng.range(-30, 30),
          z: bz - 41.5,
          heading: Math.PI / 2,
        });
      }
      if (rng.chance(0.45)) {
        parkedSpots.push({
          x: bx - 41.5,
          z: bz + rng.range(-30, 30),
          heading: 0,
        });
      }
    }
  }
  for (const spot of parkedSpots.slice(0, CAPS.parked)) {
    const car = createCar(G, rng.pick(types), rng.pick(CAR_COLORS), spot.x, spot.z, spot.heading);
    car.driver = null;
    syncCarMesh(car, 0);
  }

  function update(dt) {
    for (const car of cars) {
      if (car.driver !== 'traffic') continue; // stolen cars leave the fleet
      const rt = car.route;
      if (rt.pause > 0) {
        rt.pause -= dt;
        driveCar(car, dt, 0, 0, true);
        syncCarMesh(car, dt);
        continue;
      }
      const wp = lanePoint(rt.node, rt.dir);
      const dx = wp.x - car.x, dz = wp.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5) {
        // arrived at the junction: choose the next leg
        const options = DIRS.filter((d) => {
          if (d.x === -rt.dir.x && d.z === -rt.dir.z) return false;
          return neighbour(rt.node, d) !== null;
        });
        const straight = options.find((d) => d.x === rt.dir.x && d.z === rt.dir.z);
        const nd = straight && rng.chance(0.62) ? straight : rng.pick(options.length ? options : [rt.dir]);
        const next = neighbour(rt.node, nd);
        if (next) {
          rt.dir = nd;
          rt.node = next;
          if (rng.chance(0.22)) rt.pause = rng.range(0.6, 1.3); // junction courtesy stop
        }
      }
      // steer toward the waypoint
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.0));
      // obstacle scan: anything slow or stopped ahead means brake lights
      let throttle = 1, brake = false;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of G.cars) {
        if (other === car) continue;
        const ox = other.x - car.x, oz = other.z - car.z;
        const ahead = ox * fx + oz * fz;
        if (ahead < 0.5 || ahead > 11) continue;
        const side = Math.abs(ox * fz - oz * fx);
        if (side < 1.7) {
          if (ahead < 5.5) { throttle = 0; brake = true; }
          else throttle = Math.min(throttle, 0.25);
        }
      }
      if (!brake) {
        for (const ped of G.peds) {
          if (ped.dead) continue;
          const ox = ped.x - car.x, oz = ped.z - car.z;
          const ahead = ox * fx + oz * fz;
          if (ahead > 0 && ahead < 7 && Math.abs(ox * fz - oz * fx) < 1.8) {
            throttle = 0; brake = true;
            break;
          }
        }
      }
      if (Math.abs(diff) > 2.4) throttle = Math.min(throttle, 0.3);
      driveCar(car, dt, steer, throttle, brake);
      // stuck in a jam? quietly re-route across town
      const moved = Math.hypot(car.x - rt.lastX, car.z - rt.lastZ);
      if (moved < 0.4) rt.stuck += dt; else { rt.stuck = 0; rt.lastX = car.x; rt.lastZ = car.z; }
      if (rt.stuck > 14) spawnCar(car);
      syncCarMesh(car, dt);
    }
  }

  return { update, cars };
}
