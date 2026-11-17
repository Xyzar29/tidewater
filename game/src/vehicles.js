// Procedural cars: every vehicle is a small group of boxes and cylinders
// (body, glasshouse, wheels, lights) built from its type spec — no model
// files. Police get a white-and-blue livery with a flashing light bar, the
// sports car a low body and spoiler, the cash van an armoured box.
// One shared arcade physics step drives player, traffic and police cars.

import { CAR_TYPES, TUNE } from './config.js';
import { collideCircle } from './city.js';
import { clamp, angDiff } from './random.js';

const glassMat = new THREE.MeshLambertMaterial({ color: 0x223240 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xd8dde2 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const L = spec.len, W = spec.wid;
  const low = type === 'sports';
  const tall = type === 'van' || type === 'cashvan';

  const bodyH = tall ? 1.5 : low ? 0.5 : 0.62;
  const bodyY = tall ? 1.05 : 0.58;
  g.add(box(W, bodyH, L, paint, 0, bodyY, 0));
  if (!tall) {
    const cabin = box(W * 0.84, low ? 0.38 : 0.5, L * 0.44, glassMat, 0, bodyY + bodyH / 2 + 0.22, -L * 0.05);
    g.add(cabin);
  } else {
    g.add(box(W * 0.92, 0.42, L * 0.2, glassMat, 0, bodyY + bodyH / 2 - 0.1, L * 0.36));
  }
  if (type === 'sports') {
    g.add(box(W * 0.9, 0.09, 0.5, paint, 0, 1.02, -L / 2 + 0.3)); // spoiler
    g.add(box(0.08, 0.22, 0.08, chromeMat, -W * 0.32, 0.86, -L / 2 + 0.3));
    g.add(box(0.08, 0.22, 0.08, chromeMat, W * 0.32, 0.86, -L / 2 + 0.3));
  }
  if (type === 'police') {
    const stripe = new THREE.MeshLambertMaterial({ color: 0x2456a8 });
    g.add(box(W + 0.04, 0.3, L * 0.5, stripe, 0, 0.62, 0));
    const bar = new THREE.Group();
    const red = box(0.42, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), -0.24, 0, 0);
    const blue = box(0.42, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0x2a5aff }), 0.24, 0, 0);
    bar.add(red, blue);
    bar.position.set(0, 1.42, -L * 0.05);
    g.add(bar);
    g.userData.lightBar = { red, blue };
  }
  if (type === 'cashvan') {
    const trim = new THREE.MeshLambertMaterial({ color: 0x37414a });
    g.add(box(W + 0.05, 0.24, L * 0.7, trim, 0, 0.42, -0.2));
  }
  // Lights: pale headlights at the front (+z), red tails at the back.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92b2b });
  g.add(box(0.34, 0.14, 0.06, headMat, -W * 0.32, 0.66, L / 2 + 0.01));
  g.add(box(0.34, 0.14, 0.06, headMat, W * 0.32, 0.66, L / 2 + 0.01));
  g.add(box(0.34, 0.12, 0.06, tailMat, -W * 0.32, 0.7, -L / 2 - 0.01));
  g.add(box(0.34, 0.12, 0.06, tailMat, W * 0.32, 0.7, -L / 2 - 0.01));

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  const wheels = [];
  const wx = W / 2 + 0.02, wz = L / 2 - 0.85;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * wx, 0.36, sz * wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.spec = spec;
  return g;
}

export function spawnCar(G, opts) {
  const type = opts.type || 'sedan';
  const mesh = createCarMesh(type, opts.color);
  mesh.position.set(opts.x, 0, opts.z);
  mesh.rotation.y = opts.heading || 0;
  G.scene.add(mesh);
  const car = {
    mesh, type, spec: CAR_TYPES[type],
    x: opts.x, z: opts.z, heading: opts.heading || 0,
    speed: 0, steerVis: 0, wheelSpin: 0,
    kind: opts.kind || 'parked',     // parked | traffic | police | mission
    occupant: null,                  // null | 'player' | 'ai'
    dead: false, lastImpact: 0, honkAt: 0,
    ai: {},
  };
  G.cars.push(car);
  return car;
}

export function removeCar(G, car) {
  car.dead = true;
  G.scene.remove(car.mesh);
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

// Arcade step shared by every driver. input: {throttle -1..1, steer -1..1,
// brake bool}. Collisions resolve against building AABBs; a hard stop sets
// car.lastImpact so callers can charge damage / noise for it.
export function driveCar(G, car, dt, input) {
  const spec = car.spec;
  car.lastImpact = 0;
  const prevSpeed = car.speed;
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  } else if (input.throttle > 0) {
    car.speed += spec.accel * input.throttle * dt * (1 - Math.max(0, car.speed) / (spec.topSpeed * 1.25));
  } else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed -= 24 * dt;
    else car.speed = Math.max(-11, car.speed + spec.accel * 0.7 * input.throttle * dt);
  }
  // Rolling drag settles the car at a stop instead of creeping forever.
  car.speed -= car.speed * 0.35 * dt;
  if (Math.abs(car.speed) < 0.04 && !input.throttle) car.speed = 0;
  car.speed = clamp(car.speed, -11, spec.topSpeed);

  const steerTarget = (input.steer || 0) * 0.55;
  car.steerVis += (steerTarget - car.steerVis) * Math.min(1, dt * 8);
  if (car.speed !== 0) {
    const turn = car.steerVis * spec.grip * dt * clamp(car.speed / 9, -1, 1);
    car.heading += turn;
  }
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;

  const [nx, nz] = collideCircle(G.city, car.x, car.z, TUNE.carRadius);
  if (nx !== car.x || nz !== car.z) {
    const loss = Math.abs(prevSpeed) - Math.abs(car.speed);
    if (Math.abs(prevSpeed) > 10) car.lastImpact = Math.abs(prevSpeed);
    car.speed *= 0.35;
    void loss;
    car.x = nx; car.z = nz;
  }
  car.x = clamp(car.x, -WORLD_CLAMP, WORLD_CLAMP);
  car.z = clamp(car.z, -WORLD_CLAMP, 258);

  car.mesh.position.set(car.x, G.city.groundY(car.x, car.z), car.z);
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += car.speed * dt * 2.4;
  const wheels = car.mesh.userData.wheels;
  for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x = car.wheelSpin;
    if (i < 2) wheels[i].rotation.y = -car.steerVis * 0.7;
  }
}

const WORLD_CLAMP = 268;

// Pairwise car-vs-car: push overlapping cars apart and trade a little speed.
export function collideCars(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz, min = 3.6;
      if (d2 > min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (min - d) / 2;
      const ux = dx / d, uz = dz / d;
      const aMovable = a.occupant !== null || a.kind !== 'parked';
      const bMovable = b.occupant !== null || b.kind !== 'parked';
      if (aMovable) { a.x -= ux * push; a.z -= uz * push; }
      if (bMovable) { b.x += ux * push; b.z += uz * push; }
      const rel = Math.abs(a.speed) + Math.abs(b.speed);
      if (rel > 8) {
        if (aMovable) a.lastImpact = Math.max(a.lastImpact, Math.abs(a.speed));
        if (bMovable) b.lastImpact = Math.max(b.lastImpact, Math.abs(b.speed));
        a.speed *= 0.55; b.speed *= 0.55;
      }
      a.mesh.position.set(a.x, G.city.groundY(a.x, a.z), a.z);
      b.mesh.position.set(b.x, G.city.groundY(b.x, b.z), b.z);
    }
  }
}

// Steer a car toward a world point; returns the drive input for driveCar.
export function steerToward(car, tx, tz, dt, opts = {}) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  const diff = angDiff(want, car.heading);
  const steer = clamp(diff * 1.6, -1, 1);
  const dist = Math.hypot(tx - car.x, tz - car.z);
  let throttle = 1;
  if (Math.abs(diff) > 2.4 && car.speed < 4) throttle = -0.7; // reverse out of a bad angle
  if (opts.slowNear && dist < opts.slowNear) throttle = Math.min(throttle, 0.45);
  if (opts.stopAt && dist < opts.stopAt) throttle = car.speed > 1 ? 0 : 0.0;
  return { throttle, steer, brake: !!(opts.stopAt && dist < opts.stopAt && car.speed > 0.5) };
}
