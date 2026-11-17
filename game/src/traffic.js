// Traffic AI: cars follow the intersection graph in the right-hand lane,
// brake for whatever is ahead of them, sometimes pause at junctions, and
// quietly respawn far away so the streets near the player stay alive.
// Parked cars line the kerbs and landmark lots — all of them stealable.

import { WORLD, TUNE, CAR_TYPES, CAR_COLORS } from './config.js';
import { spawnCar, driveCar, steerToward } from './vehicles.js';
import { clamp } from './random.js';

const { lines } = WORLD;
const LANE = 3.6;

function neighbours(node) {
  const out = [];
  const i = lines.indexOf(node.x), j = lines.indexOf(node.z);
  if (i > 0) out.push({ x: lines[i - 1], z: node.z });
  if (i < lines.length - 1) out.push({ x: lines[i + 1], z: node.z });
  if (j > 0) out.push({ x: node.x, z: lines[j - 1] });
  if (j < lines.length - 1) out.push({ x: node.x, z: lines[j + 1] });
  return out;
}

function pickNext(G, car) {
  const from = car.ai.from, at = car.ai.to;
  const options = neighbours(at).filter((n) => !(n.x === from.x && n.z === from.z));
  let next;
  const straight = options.find((n) => Math.sign(n.x - at.x) === Math.sign(at.x - from.x)
    && Math.sign(n.z - at.z) === Math.sign(at.z - from.z));
  if (straight && G.rng.chance(0.62)) next = straight;
  else next = G.rng.pick(options.length ? options : neighbours(at));
  car.ai.from = at;
  car.ai.to = next;
  if (G.rng.chance(0.22)) car.ai.pauseT = G.rng.range(0.5, 1.4);
}

function lanePoint(car, node) {
  const from = car.ai.from;
  const fx = Math.sign(node.x - from.x), fz = Math.sign(node.z - from.z);
  // right-hand lane offset for travel from -> node
  return { x: node.x + (-fz) * LANE, z: node.z + fx * LANE };
}

export function createTraffic(G) {
  const rng = G.rng;
  for (let i = 0; i < TUNE.trafficCount; i++) {
    const a = { x: rng.pick(lines), z: rng.pick(lines) };
    const b = rng.pick(neighbours(a));
    const t = rng.range(0.15, 0.85);
    const fx = Math.sign(b.x - a.x), fz = Math.sign(b.z - a.z);
    const x = a.x + (b.x - a.x) * t + (-fz) * LANE;
    const z = a.z + (b.z - a.z) * t + fx * LANE;
    const type = rng.pick(['sedan', 'sedan', 'hatch', 'hatch', 'van']);
    const car = spawnCar(G, {
      type, color: rng.pick(CAR_COLORS), x, z,
      heading: Math.atan2(fx, fz), kind: 'traffic',
    });
    car.occupant = 'ai';
    car.ai.from = a; car.ai.to = b; car.ai.pauseT = 0;
    car.ai.cruise = rng.range(9, 12.5);
  }
  // Parked cars: kerbside along random roads, plus the landmark lots.
  for (let i = 0; i < TUNE.parkedCount; i++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(lines);
    const along = rng.range(-250, 225);
    const side = rng.sign();
    const x = vertical ? line + side * (WORLD.roadHalf - 1.1) : along;
    const z = vertical ? along : line + side * (WORLD.roadHalf - 1.1);
    const heading = vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    spawnCar(G, {
      type: rng.pick(['sedan', 'hatch', 'van', 'sedan']),
      color: rng.pick(CAR_COLORS), x, z, heading, kind: 'parked',
    });
  }
  void CAR_TYPES;
}

function obstacleAhead(G, car) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let nearest = Infinity;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const fwd = dx * fx + dz * fz;
    if (fwd < 0.5 || fwd > 11) continue;
    const lat = Math.abs(dx * fz - dz * fx);
    if (lat < 2.3 && fwd < nearest) nearest = fwd;
  }
  // A pedestrian (or Mari on foot) in the road counts too.
  const p = G.player;
  if (p && !p.driving) {
    const dx = p.x - car.x, dz = p.z - car.z;
    const fwd = dx * fx + dz * fz;
    const lat = Math.abs(dx * fz - dz * fx);
    if (fwd > 0 && fwd < 8 && lat < 2 && fwd < nearest) nearest = fwd;
  }
  return nearest;
}

// A traffic car the player has abandoned rejoins the flow from the
// nearest intersection instead of freezing where it was left.
export function resumeTraffic(G, car) {
  let best = null, bestD = Infinity;
  for (const lx of lines) for (const lz of lines) {
    const d = (car.x - lx) * (car.x - lx) + (car.z - lz) * (car.z - lz);
    if (d < bestD) { bestD = d; best = { x: lx, z: lz }; }
  }
  car.ai.from = best;
  car.ai.to = G.rng.pick(neighbours(best));
  car.ai.pauseT = 0.6;
  car.occupant = 'ai';
}

export function updateTraffic(G, dt) {
  const px = G.player ? G.player.x : 0, pz = G.player ? G.player.z : 0;
  for (const car of G.cars) {
    if (car.kind !== 'traffic' || car.occupant !== 'ai' || car.dead) continue;
    // Far-away traffic teleports to an edge nearer the player.
    const dxp = car.x - px, dzp = car.z - pz;
    if (dxp * dxp + dzp * dzp > 300 * 300) {
      const a = { x: G.rng.pick(lines), z: G.rng.pick(lines) };
      const b = G.rng.pick(neighbours(a));
      car.ai.from = a; car.ai.to = b;
      car.x = a.x; car.z = a.z;
      car.heading = Math.atan2(b.x - a.x, b.z - a.z);
      car.speed = 0;
    }
    if (car.ai.pauseT > 0) {
      car.ai.pauseT -= dt;
      driveCar(G, car, dt, { throttle: 0, steer: 0, brake: car.speed > 0.3 });
      continue;
    }
    const target = lanePoint(car, car.ai.to);
    const distNode = Math.hypot(car.ai.to.x - car.x, car.ai.to.z - car.z);
    if (distNode < 8) pickNext(G, car);
    const input = steerToward(car, target.x, target.z, dt);
    const obstacle = obstacleAhead(G, car);
    if (obstacle < 6) { input.throttle = 0; input.brake = car.speed > 0.5; }
    else if (obstacle < 11) input.throttle = Math.min(input.throttle, 0.25);
    const speedCap = car.ai.cruise / car.spec.topSpeed;
    if (car.speed > car.ai.cruise) input.throttle = 0;
    void speedCap;
    driveCar(G, car, dt, input);
    void clamp;
  }
}
