// traffic.js — the ordinary drivers of Port Serena.
//
// Traffic cars follow the road lattice lane by lane: each one owns a
// segment (an avenue or a street, a direction, a lane offset) and steers by
// pure pursuit toward a point ahead on that segment. At junctions they
// sometimes turn, sometimes pause; they brake for the car in front and stop
// for pedestrians in the road. Parked cars line the kerbs, waiting to be
// stolen. Cars that wander too far from the player are quietly recycled to
// a road a few blocks away so the city always feels lived-in.

import { AVENUES, STREETS, MAX_TRAFFIC, MAX_PARKED } from './config.js';
import { createCar, TRAFFIC_COLOURS } from './vehicles.js';

const LANE = 4.5;

// Lane centre for a segment. Right-hand traffic: the lane sits to the
// driver's right of the road's centre line.
function lanePoint(seg, along) {
  if (seg.axis === 'z') { // on an avenue, moving along z
    const off = seg.dir < 0 ? LANE : -LANE;
    return { x: seg.coord + off, z: along };
  }
  const off = seg.dir > 0 ? LANE : -LANE;
  return { x: along, z: seg.coord + off };
}

function randomSegment(rng) {
  if (rng.chance(0.5)) {
    return { axis: 'z', coord: rng.pick(AVENUES), dir: rng.sign() };
  }
  return { axis: 'x', coord: rng.pick(STREETS), dir: rng.sign() };
}

function alongOf(seg, car) {
  return seg.axis === 'z' ? car.z : car.x;
}

function spawnTrafficCar(G, nearPlayer) {
  const rng = G.rng;
  const seg = randomSegment(rng);
  let along = rng.range(-280, 280);
  if (nearPlayer) {
    // Recycle near the player: pick a segment through their neighbourhood.
    const p = G.playerPos;
    const base = seg.axis === 'z' ? p.z : p.x;
    along = Math.max(-285, Math.min(285, base + rng.range(90, 170) * rng.sign()));
  }
  const pt = lanePoint(seg, along);
  const heading = seg.axis === 'z' ? (seg.dir > 0 ? 0 : Math.PI) : (seg.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const type = rng.pick(['sedan', 'sedan', 'hatch', 'hatch', 'van']);
  const colour = rng.chance(0.14) ? 0xf7c948 : rng.pick(TRAFFIC_COLOURS); // the odd taxi-yellow
  const car = createCar(G, type, colour, pt.x, pt.z, heading, 'traffic');
  car.ai = { seg, cruise: rng.range(9, 12.5), pause: 0, decidedAt: -999 };
  car.speed = car.ai.cruise * 0.7;
  return car;
}

export function initTraffic(G) {
  const rng = G.rng;
  G.traffic = [];
  for (let i = 0; i < MAX_TRAFFIC; i++) G.traffic.push(spawnTrafficCar(G, false));

  // Parked cars along the kerbs.
  let parked = 0;
  let guard = 0;
  while (parked < MAX_PARKED && guard++ < 300) {
    const onAve = rng.chance(0.5);
    const coord = onAve ? rng.pick(AVENUES) : rng.pick(STREETS);
    const along = rng.range(-290, 290);
    const side = rng.sign();
    const x = onAve ? coord + side * 7.4 : along;
    const z = onAve ? along : coord + side * 7.4;
    // Keep the story spots and spawn area clear.
    if (Math.abs(x - 261) < 8 && Math.abs(z + 30) < 10) continue;
    if (Math.hypot(x - 20, z - 168) < 12) continue;
    let clear = true;
    for (const c of G.cars) if (Math.hypot(c.x - x, c.z - z) < 6) { clear = false; break; }
    if (!clear) continue;
    const heading = onAve ? (side > 0 ? 0 : Math.PI) + (rng.chance(0.5) ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(G, rng.pick(['sedan', 'hatch', 'van', 'sedan']), rng.pick(TRAFFIC_COLOURS), x, z, heading, 'parked');
    car.ai = { parked: true };
    parked++;
  }
}

// Is something solid just ahead of this car? Returns a desired speed cap.
function trafficAhead(G, car) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let cap = Infinity;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 0.5 || ahead > 15) continue;
    const lateral = Math.abs(dx * fz - dz * fx);
    if (lateral > 2.3) continue;
    cap = Math.min(cap, ahead < 6.5 ? 0 : other.speed);
  }
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const dx = ped.x - car.x, dz = ped.z - car.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 0.5 || ahead > 8) continue;
    if (Math.abs(dx * fz - dz * fx) > 2.1) continue;
    cap = 0;
  }
  return cap;
}

export function updateTraffic(G, dt) {
  const p = G.playerPos;
  for (const car of G.traffic) {
    if (car.driver !== 'traffic' || car.dead) continue; // stolen cars leave the pool
    const ai = car.ai;
    const seg = ai.seg;

    // Recycle cars that ended up across the map from the player.
    const distP = Math.hypot(car.x - p.x, car.z - p.z);
    if (distP > 300) {
      const fresh = spawnTrafficCar(G, true);
      // Reuse the entity: move this car onto the fresh car's spot, drop the extra.
      car.x = fresh.x; car.z = fresh.z; car.heading = fresh.heading;
      car.ai = fresh.ai; car.speed = fresh.speed;
      G.scene.remove(fresh.mesh);
      G.cars.splice(G.cars.indexOf(fresh), 1);
      continue;
    }

    // Junction decisions: when close to a crossing road, maybe turn.
    const along = alongOf(seg, car);
    const crossList = seg.axis === 'z' ? STREETS : AVENUES;
    for (const cross of crossList) {
      const d = (cross - along) * seg.dir; // distance ahead to the crossing
      if (d > 0 && d < 9 && Math.abs(along - ai.decidedAt) > 20) {
        ai.decidedAt = cross;
        if (G.rng.chance(0.16)) ai.pause = G.rng.range(0.5, 1.1); // junction courtesy pause
        if (G.rng.chance(0.34)) {
          // Turn onto the crossing road.
          const newAxis = seg.axis === 'z' ? 'x' : 'z';
          ai.seg = { axis: newAxis, coord: cross, dir: G.rng.sign() };
        }
        break;
      }
    }

    // Pure pursuit toward a lookahead point on the (possibly new) segment.
    const segNow = ai.seg;
    const alongNow = alongOf(segNow, car);
    const look = alongNow + segNow.dir * 16;
    const target = lanePoint(segNow, Math.max(-292, Math.min(292, look)));
    // Near the end of a road, wrap to the far end rather than leaving town.
    if (Math.abs(alongNow) > 290) {
      const pt = lanePoint(segNow, -segNow.dir * 285);
      car.x = pt.x; car.z = pt.z;
      continue;
    }
    const desired = Math.atan2(target.x - car.x, target.z - car.z);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.input.steer = Math.max(-1, Math.min(1, diff * 2.1));

    let want = ai.cruise;
    if (Math.abs(diff) > 0.45) want = Math.min(want, 5.5);
    const cap = trafficAhead(G, car);
    want = Math.min(want, cap);
    if (ai.pause > 0) { ai.pause -= dt; want = 0; }

    car.input.throttle = car.speed < want ? 0.85 : 0;
    car.input.brake = car.speed > want + 1.5;
    if (want === 0 && car.speed > 0.4) car.input.brake = true;
  }
}
