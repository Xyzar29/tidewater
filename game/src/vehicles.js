// vehicles.js — procedural car models (merged, vertex-coloured box geometry,
// cached per type+colour) and the one arcade physics step every car shares:
// player, traffic and police all drive through driveCar().
import { collideCircle } from './city.js';

const carMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const geoCache = new Map();

function part(list, w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  list.push({ g, color });
}

function mergeParts(list) {
  let total = 0;
  const geos = list.map(({ g, color }) => {
    const ng = g.toNonIndexed();
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    total += n;
    return ng;
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  let o = 0;
  for (const ng of geos) {
    pos.set(ng.attributes.position.array, o * 3);
    nor.set(ng.attributes.normal.array, o * 3);
    uv.set(ng.attributes.uv.array, o * 2);
    col.set(ng.attributes.color.array, o * 3);
    o += ng.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const GLASS = 0x25384a, TYRE = 0x1c1e22, TRIM = 0x2b2f36;
function wheels(list, x, z, r) {
  for (const sx of [-x, x]) for (const sz of [-z, z])
    part(list, 0.26, r * 2, r * 2, sx, r, sz, TYRE);
}
function lights(list, zF, zR) {
  for (const sx of [-0.6, 0.6]) {
    part(list, 0.36, 0.12, 0.06, sx, 0.68, zF, 0xfff3b0);
    part(list, 0.36, 0.12, 0.06, sx, 0.68, zR, 0xd84040);
  }
}

function buildGeometry(type, color) {
  const key = type + '|' + color;
  if (geoCache.has(key)) return geoCache.get(key);
  const P = [];
  if (type === 'sedan' || type === 'police') {
    const body = type === 'police' ? 0xf0f2f0 : color;
    part(P, 1.82, 0.52, 4.35, 0, 0.58, 0, body);
    part(P, 1.62, 0.5, 2.0, 0, 1.06, -0.25, GLASS);
    part(P, 1.86, 0.22, 0.3, 0, 0.38, 2.12, TRIM);
    part(P, 1.86, 0.22, 0.3, 0, 0.38, -2.12, TRIM);
    if (type === 'police') for (const sx of [-0.93, 0.93]) part(P, 0.04, 0.4, 1.7, sx, 0.62, -0.2, 0x22262c);
    wheels(P, 0.82, 1.32, 0.34); lights(P, 2.19, -2.19);
  } else if (type === 'hatch') {
    part(P, 1.78, 0.55, 3.7, 0, 0.6, 0, color);
    part(P, 1.6, 0.52, 1.9, 0, 1.08, -0.35, GLASS);
    wheels(P, 0.8, 1.15, 0.33); lights(P, 1.87, -1.87);
  } else if (type === 'van' || type === 'armoured') {
    part(P, 1.95, 1.35, 4.5, 0, 1.05, 0, color);
    part(P, 1.8, 0.55, 0.9, 0, 1.3, 1.72, GLASS);
    if (type === 'armoured') for (const sx of [-0.99, 0.99]) part(P, 0.04, 0.8, 2.6, sx, 1.05, -0.4, 0x59636e);
    wheels(P, 0.85, 1.5, 0.37); lights(P, 2.27, -2.27);
  } else { // sports
    part(P, 1.9, 0.4, 4.4, 0, 0.48, 0, color);
    part(P, 1.86, 0.26, 1.15, 0, 0.44, 1.62, color);
    part(P, 1.5, 0.38, 1.7, 0, 0.84, -0.3, GLASS);
    part(P, 1.8, 0.07, 0.42, 0, 0.96, -2.02, TRIM);
    part(P, 0.08, 0.22, 0.3, -0.7, 0.82, -2.02, TRIM);
    part(P, 0.08, 0.22, 0.3, 0.7, 0.82, -2.02, TRIM);
    wheels(P, 0.85, 1.4, 0.32); lights(P, 2.21, -2.21);
  }
  const geo = mergeParts(P);
  geoCache.set(key, geo);
  return geo;
}

const SPECS = {
  sedan:    { maxSpeed: 29, accel: 13.5 },
  hatch:    { maxSpeed: 26, accel: 12.5 },
  van:      { maxSpeed: 23, accel: 10.5 },
  sports:   { maxSpeed: 38, accel: 17.5 },
  police:   { maxSpeed: 34.5, accel: 16.5 },
  armoured: { maxSpeed: 22, accel: 9.5 },
};

export function createCar(type, color) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(buildGeometry(type, color),
    type === 'police' ? new THREE.MeshLambertMaterial({ vertexColors: true }) : carMaterial);
  body.castShadow = true;
  mesh.add(body);
  let bar = null;
  if (type === 'police') {
    bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.55),
      new THREE.MeshBasicMaterial({ color: 0x2a5aff }));
    blue.position.x = 0.3;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.4, -0.25);
    mesh.add(bar);
  }
  const spec = SPECS[type] || SPECS.sedan;
  return {
    mesh, bar, type, color,
    heading: 0, speed: 0,
    maxSpeed: spec.maxSpeed, accel: spec.accel,
    radius: 1.55, driver: null, stolen: false, wrecked: false,
    stuckT: 0, reverseT: 0,
  };
}

export function carForward(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

// One physics step. throttle -1..1, steer -1..1 (+ steers toward +x when facing +z).
export function driveCar(car, dt, throttle, steer, world, brake) {
  if (throttle > 0) {
    car.speed += car.accel * throttle * dt * (car.speed < -0.5 ? 2.4 : 1);
  } else if (throttle < 0) {
    car.speed += car.accel * throttle * dt * (car.speed > 0.5 ? 1.7 : 0.55);
  } else {
    car.speed *= Math.max(0, 1 - 1.3 * dt);
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
  }
  if (brake) car.speed *= Math.max(0, 1 - 6.5 * dt);
  car.speed = Math.max(-9, Math.min(car.maxSpeed, car.speed));
  if (car.speed !== 0) {
    const grip = Math.max(-1, Math.min(1, car.speed / 6.5));
    car.heading += steer * dt * 1.8 * grip;
  }
  const f = carForward(car);
  const pos = car.mesh.position;
  pos.x += f.x * car.speed * dt;
  pos.z += f.z * car.speed * dt;
  if (pos.z > 206) car.speed *= Math.max(0, 1 - 1.2 * dt); // sand drag on the beach
  if (collideCircle(pos, car.radius, world.colliders)) car.speed *= 0.35;
  // car-to-car: soft push-apart
  for (let i = 0; i < world.cars.length; i++) {
    const o = world.cars[i];
    if (o === car) continue;
    const dx = pos.x - o.mesh.position.x, dz = pos.z - o.mesh.position.z;
    const rr = car.radius + o.radius - 0.5;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.0001) {
      const d = Math.sqrt(d2), push = (rr - d) * 0.5;
      pos.x += (dx / d) * push; pos.z += (dz / d) * push;
      if (car.speed > 2) car.speed *= 0.72;
    }
  }
  car.mesh.rotation.y = car.heading;
}
