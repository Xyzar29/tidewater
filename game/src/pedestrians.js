// pedestrians.js — thirty Port Serenans walking the sidewalks. They stroll
// corner to corner along the kerbs, scatter when there's gunfire or a car
// bears down on them, and go down (briefly) if one actually hits them.

import { PITCH, GRID, ROAD_W } from './config.js';
import { collideCircle } from './vehicles.js';

const LINES = [];
for (let k = -GRID; k <= GRID; k++) LINES.push(k * PITCH);
const OFF = ROAD_W / 2 + 1.6; // sidewalk centreline offset from the street
const SHIRTS = [0xff8fa3, 0xffd94d, 0x6ce0d4, 0xff9d5c, 0x9fe870, 0xe6d7f2, 0xf5f0e6, 0x7fb2ff];
const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0xffe0bd];

function makePerson(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.27, 0.78, 7),
    new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) }),
  );
  shirt.position.y = 0.85;
  shirt.castShadow = true;
  g.add(shirt);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 8, 7),
    new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) }),
  );
  head.position.y = 1.48;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.19, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: rng.pick([0x33404f, 0x6e5a4e, 0x274435, 0x59486e]) }),
  );
  legs.position.y = 0.25;
  g.add(legs);
  return g;
}

export class Pedestrians {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.peds = [];
    this.onHit = null; // (ped, car) => {} set by main for crime reporting
    for (let i = 0; i < 30; i++) this.spawn();
  }

  corner(a, b, sx, sz) {
    return { x: LINES[a] + sx * OFF, z: LINES[b] + sz * OFF, a, b, sx, sz };
  }

  spawn() {
    const rng = this.rng;
    const mesh = makePerson(rng);
    const a = rng.int(0, LINES.length - 1);
    const b = rng.int(0, LINES.length - 1);
    const sx = rng.chance(0.5) ? 1 : -1;
    const sz = rng.chance(0.5) ? 1 : -1;
    const start = this.corner(a, b, sx, sz);
    mesh.position.set(start.x + rng.range(-4, 4), 0, start.z + rng.range(-4, 4));
    this.scene.add(mesh);
    const ped = {
      mesh,
      corner: start,
      target: null,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.1, 1.7),
      state: 'walk', // walk | flee | down
      stateT: 0,
      danger: null,
      walkPhase: rng.range(0, 6),
    };
    this.pickTarget(ped);
    this.peds.push(ped);
    return ped;
  }

  pickTarget(ped) {
    const { a, b, sx, sz } = ped.corner;
    const options = [];
    // Walk along the NS sidewalk to the next corner north/south...
    if (b > 0) options.push(this.corner(a, b - 1, sx, sz));
    if (b < LINES.length - 1) options.push(this.corner(a, b + 1, sx, sz));
    // ...or cross to the EW sidewalk corners.
    if (a > 0) options.push(this.corner(a - 1, b, sx, sz));
    if (a < LINES.length - 1) options.push(this.corner(a + 1, b, sx, sz));
    ped.target = this.rng.pick(options);
  }

  // Gunfire / a crash nearby: everyone in earshot runs.
  alarm(x, z, radius = 26) {
    for (const ped of this.peds) {
      const dx = ped.mesh.position.x - x, dz = ped.mesh.position.z - z;
      if (dx * dx + dz * dz < radius * radius && ped.state === 'walk') {
        ped.state = 'flee';
        ped.stateT = this.rng.range(1.6, 3);
        ped.danger = { x, z };
      }
    }
  }

  update(dt, cars, playerPos) {
    for (const ped of this.peds) {
      const pos = ped.mesh.position;

      if (ped.state === 'down') {
        ped.stateT -= dt;
        if (ped.stateT <= 0) {
          ped.state = 'flee';
          ped.stateT = 1.6;
          ped.danger = { x: pos.x + 5, z: pos.z };
          ped.mesh.rotation.x = 0;
        }
        continue;
      }

      // Cars are the real danger: a fast car close by means run, and a
      // touch means down.
      let threat = null;
      for (const car of cars) {
        const cp = car.mesh.position;
        const dx = pos.x - cp.x, dz = pos.z - cp.z;
        const rr = car.radius + 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && Math.abs(car.speed) > 2.2) {
          ped.state = 'down';
          ped.stateT = 3.5;
          ped.mesh.rotation.x = Math.PI / 2;
          pos.y = 0.25;
          if (this.onHit) this.onHit(ped, car);
          threat = null;
          break;
        }
        if (d2 < 49 && Math.abs(car.speed) > 6) threat = { x: cp.x, z: cp.z };
      }
      if (ped.state === 'down') continue;
      if (threat && ped.state === 'walk') {
        ped.state = 'flee';
        ped.stateT = 1.4;
        ped.danger = threat;
      }

      let moveX = 0, moveZ = 0, speed = ped.speed;
      if (ped.state === 'flee') {
        ped.stateT -= dt;
        const dx = pos.x - ped.danger.x, dz = pos.z - ped.danger.z;
        const d = Math.hypot(dx, dz) || 1;
        moveX = dx / d; moveZ = dz / d;
        speed = 4.4;
        if (ped.stateT <= 0) ped.state = 'walk';
      } else {
        const t = ped.target;
        const dx = t.x - pos.x, dz = t.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) {
          ped.corner = t;
          this.pickTarget(ped);
        } else {
          moveX = dx / d; moveZ = dz / d;
        }
      }

      // The player politely shoves past.
      const pdx = pos.x - playerPos.x, pdz = pos.z - playerPos.z;
      const pd2 = pdx * pdx + pdz * pdz;
      if (pd2 < 0.64 && pd2 > 0.0001) {
        const pd = Math.sqrt(pd2);
        moveX += (pdx / pd) * 0.8;
        moveZ += (pdz / pd) * 0.8;
      }

      if (moveX !== 0 || moveZ !== 0) {
        const ml = Math.hypot(moveX, moveZ);
        pos.x += (moveX / ml) * speed * dt;
        pos.z += (moveZ / ml) * speed * dt;
        ped.heading = Math.atan2(moveX / ml, moveZ / ml);
        ped.walkPhase += dt * speed * 3.4;
      }
      collideCircle(pos, 0.4, this.colliders);
      pos.x = Math.max(-200, Math.min(200, pos.x));
      pos.z = Math.max(-200, Math.min(214, pos.z));
      pos.y = 0;
      ped.mesh.rotation.y = ped.heading;
      // A little walking bob.
      ped.mesh.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.05;
      if (ped.state === 'down') ped.mesh.position.y = 0.25;
    }
  }
}
