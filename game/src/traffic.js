// traffic.js — Port Serena's civilian traffic. Moving cars pick their way
// across the street lattice node by node, keeping to the right-hand lane,
// braking for the car in front and pausing at junctions; parked cars line
// the kerbs. Every one of them can be stolen.

import { PITCH, GRID, ROAD_W, CAR_COLORS } from './config.js';
import { createCar, placeCar, stepCar } from './vehicles.js';

const LINES = [];
for (let k = -GRID; k <= GRID; k++) LINES.push(k * PITCH);
const LANE = 3.4;

export class Traffic {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];        // everything with wheels that isn't police
    this.drivers = [];     // moving cars with their route state

    for (let i = 0; i < 24; i++) this.spawnDriver();
    for (let i = 0; i < 24; i++) this.spawnParked();
  }

  randomNode() {
    return { a: this.rng.int(0, LINES.length - 1), b: this.rng.int(0, LINES.length - 1) };
  }

  // A fresh civilian car somewhere on the grid, aimed at a neighbour node.
  spawnDriver(nearPos) {
    let node = this.randomNode();
    if (nearPos) {
      // Respawn away from the player so pop-in is never visible.
      for (let tries = 0; tries < 12; tries++) {
        const cand = this.randomNode();
        const dx = LINES[cand.a] - nearPos.x, dz = LINES[cand.b] - nearPos.z;
        if (dx * dx + dz * dz > 130 * 130) { node = cand; break; }
      }
    }
    const dirs = [];
    if (node.a > 0) dirs.push([-1, 0]);
    if (node.a < LINES.length - 1) dirs.push([1, 0]);
    if (node.b > 0) dirs.push([0, -1]);
    if (node.b < LINES.length - 1) dirs.push([0, 1]);
    const dir = this.rng.pick(dirs);
    const kind = this.rng.pick(['sedan', 'sedan', 'hatch', 'hatch', 'van', 'sport']);
    const car = createCar(kind, this.rng.pick(CAR_COLORS));
    const fx = LINES[node.a], fz = LINES[node.b];
    const right = { x: -dir[1], z: dir[0] };
    const startT = this.rng.range(0.15, 0.7);
    const x = fx + dir[0] * PITCH * startT + right.x * LANE;
    const z = fz + dir[1] * PITCH * startT + right.z * LANE;
    placeCar(car, x, z, Math.atan2(dir[0], dir[1]));
    car.occupied = true;
    car.driver = {
      from: node,
      to: { a: node.a + dir[0], b: node.b + dir[1] },
      dir,
      pause: 0,
      cruise: this.rng.range(7.5, 11),
    };
    this.scene.add(car.mesh);
    this.cars.push(car);
    this.drivers.push(car);
    return car;
  }

  spawnParked() {
    // Kerbside spots: along a street, between two intersections.
    const vertical = this.rng.chance(0.5);
    const line = this.rng.pick(LINES);
    const seg = this.rng.int(-GRID, GRID - 1);
    const t = this.rng.range(0.2, 0.8);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const off = (ROAD_W / 2 + 2.7) * side;
    let x, z, heading;
    if (vertical) {
      x = line + off;
      z = seg * PITCH + PITCH * t;
      heading = side > 0 ? Math.PI : 0; // nose along the street, kerb side
    } else {
      x = seg * PITCH + PITCH * t;
      z = line + off;
      heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    const kind = this.rng.pick(['sedan', 'hatch', 'hatch', 'van', 'sport']);
    const car = createCar(kind, this.rng.pick(CAR_COLORS));
    placeCar(car, x, z, heading + this.rng.range(-0.04, 0.04));
    car.parked = true;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  // The yellow sports car mission 2 revolves around — parked at the hotel.
  spawnSpecialSportscar(x, z, heading) {
    const car = createCar('sport', 0xffd21f);
    placeCar(car, x, z, heading);
    car.parked = true;
    car.special = 'sportscar';
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  // The armoured cash van mission 6 robs — parked outside the casino.
  spawnCashVan(x, z, heading) {
    const car = createCar('truck', 0x707880);
    placeCar(car, x, z, heading);
    car.parked = true;
    car.special = 'cashvan';
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
    this.drivers = this.drivers.filter((c) => c !== car);
  }

  update(dt, playerPos, extraCars) {
    const all = extraCars ? this.cars.concat(extraCars) : this.cars;
    for (const car of this.drivers) {
      if (car.playerDriven) continue; // the player has this one, for now
      const d = car.driver;
      const pos = car.mesh.position;

      // Recycle cars that have wandered far from the action.
      const pdx = pos.x - playerPos.x, pdz = pos.z - playerPos.z;
      if (pdx * pdx + pdz * pdz > 320 * 320) {
        const fresh = this.spawnDriver(playerPos);
        this.removeCar(car);
        void fresh;
        continue;
      }

      // Target: the far node's centre, shifted into our lane.
      const tx = LINES[d.to.a] + (-d.dir[1]) * LANE;
      const tz = LINES[d.to.b] + (d.dir[0]) * LANE;
      const dx = tx - pos.x, dz = tz - pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 4.5) {
        // Arrived: choose the next leg (straight if possible, else a turn).
        const options = [];
        const straight = { a: d.to.a + d.dir[0], b: d.to.b + d.dir[1] };
        if (straight.a >= 0 && straight.a < LINES.length && straight.b >= 0 && straight.b < LINES.length) {
          options.push({ dir: d.dir, node: straight, w: 5 });
        }
        const left = { a: d.to.a + d.dir[1], b: d.to.b - d.dir[0] };
        const right = { a: d.to.a - d.dir[1], b: d.to.b + d.dir[0] };
        for (const cand of [left, right]) {
          if (cand.a >= 0 && cand.a < LINES.length && cand.b >= 0 && cand.b < LINES.length) {
            options.push({ dir: [cand.a - d.to.a, cand.b - d.to.b], node: cand, w: 2 });
          }
        }
        if (options.length === 0) {
          // Dead end of the grid: U-turn.
          const back = { a: d.from.a, b: d.from.b };
          d.dir = [-d.dir[0], -d.dir[1]];
          d.from = d.to;
          d.to = back;
        } else {
          let total = 0;
          for (const o of options) total += o.w;
          let roll = this.rng.next() * total;
          let chosen = options[0];
          for (const o of options) { roll -= o.w; if (roll <= 0) { chosen = o; break; } }
          d.from = d.to;
          d.to = chosen.node;
          d.dir = chosen.dir;
          if (this.rng.chance(0.16)) d.pause = this.rng.range(0.4, 1.1);
        }
        continue;
      }

      // Steering: pure pursuit of the lane target.
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));

      // Throttle: cruise, but brake for anything slow in front.
      let throttle = car.speed < d.cruise ? 0.65 : 0;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of all) {
        if (other === car) continue;
        const ox = other.mesh.position.x - pos.x;
        const oz = other.mesh.position.z - pos.z;
        const ahead = ox * fx + oz * fz;
        if (ahead > 0 && ahead < 12) {
          const side = Math.abs(ox * fz - oz * fx);
          if (side < 2.4) {
            throttle = ahead < 6 ? -0.7 : 0;
            break;
          }
        }
      }
      if (d.pause > 0) {
        d.pause -= dt;
        throttle = car.speed > 0.3 ? -0.8 : 0;
      }
      // Sirens clear the road: a cruiser close behind makes drivers hurry
      // out of the way instead of dawdling in a jam.
      if (extraCars) {
        for (const cop of extraCars) {
          const ox = pos.x - cop.mesh.position.x;
          const oz = pos.z - cop.mesh.position.z;
          const behind = ox * fx + oz * fz;
          if (behind > 0 && behind < 12 && Math.abs(ox * fz - oz * fx) < 3) {
            throttle = Math.max(throttle, 0.85);
            break;
          }
        }
      }

      stepCar(car, dt, { throttle, steer, brake: false }, this.colliders, all);
    }
  }
}