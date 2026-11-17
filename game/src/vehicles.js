// vehicles.js — procedural low-poly cars (no model files: bodies, cabins,
// wheels and light bars are boxes and cylinders painted at runtime) and
// the shared physics step + collision helpers that the player, the traffic
// and the police all drive with.
//
// A car is a plain object: { mesh, kind, heading, speed, radius, ... }.
// Heading 0 faces +z (south); the forward vector is (sin h, cos h).

import { CAR_ACCEL, CAR_BRAKE, CAR_DRAG, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_STEER } from './config.js';

const GLASS = new THREE.MeshLambertMaterial({ color: 0x223243 });
const TYRE = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
const HEADLIGHT = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
const TAILLIGHT = new THREE.MeshBasicMaterial({ color: 0xff4b3e });

const SPECS = {
  sedan:  { w: 1.8, bodyH: 0.55, len: 4.2, cabinLen: 2.0, cabinH: 0.5 },
  hatch:  { w: 1.75, bodyH: 0.6, len: 3.7, cabinLen: 1.9, cabinH: 0.55 },
  sport:  { w: 1.85, bodyH: 0.42, len: 4.4, cabinLen: 1.7, cabinH: 0.42 },
  van:    { w: 2.05, bodyH: 1.15, len: 4.9, cabinLen: 1.4, cabinH: 0.6 },
  truck:  { w: 2.2, bodyH: 1.5, len: 5.4, cabinLen: 1.3, cabinH: 0.7 },
  police: { w: 1.85, bodyH: 0.55, len: 4.4, cabinLen: 2.0, cabinH: 0.5 },
};

export function createCar(kind, colorHex) {
  const spec = SPECS[kind] || SPECS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 60 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.bodyH, spec.len), paint);
  body.position.y = 0.35 + spec.bodyH / 2;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.25, spec.cabinH, spec.cabinLen), GLASS);
  cabin.position.set(0, 0.35 + spec.bodyH + spec.cabinH / 2, kind === 'van' || kind === 'truck' ? spec.len / 2 - spec.cabinLen / 2 - 0.1 : -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  if (kind === 'van' || kind === 'truck') {
    // Cargo box behind the cab for the van / armoured truck.
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w - 0.05, spec.bodyH + 0.5, spec.len - spec.cabinLen - 0.3),
      kind === 'truck' ? new THREE.MeshLambertMaterial({ color: 0x707880 }) : paint,
    );
    box.position.set(0, 0.35 + (spec.bodyH + 0.5) / 2, -spec.cabinLen / 2 - 0.25);
    box.castShadow = true;
    group.add(box);
  }

  if (kind === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.1, 0.08, 0.5), paint);
    spoiler.position.set(0, 1.0, -spec.len / 2 + 0.3);
    group.add(spoiler);
  }

  // Wheels: one spinning group per axle.
  const wheels = [];
  for (const wz of [spec.len / 2 - 0.85, -spec.len / 2 + 0.85]) {
    const axle = new THREE.Group();
    axle.position.set(0, 0.36, wz);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, spec.w + 0.15, 10), TYRE);
    tyre.rotation.z = Math.PI / 2;
    axle.add(tyre);
    group.add(axle);
    wheels.push(axle);
  }

  // Lights.
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), HEADLIGHT);
    hl.position.set(sx * (spec.w / 2 - 0.25), 0.62, spec.len / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), TAILLIGHT);
    tl.position.set(sx * (spec.w / 2 - 0.25), 0.66, -spec.len / 2 - 0.02);
    group.add(tl);
  }

  let lightbar = null;
  if (kind === 'police') {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a5cff }));
    blue.position.x = 0.3;
    lightbar.add(red);
    lightbar.add(blue);
    lightbar.position.set(0, 0.35 + spec.bodyH + spec.cabinH + 0.1, -0.25);
    group.add(lightbar);
  }

  return {
    mesh: group,
    kind,
    spec,
    wheels,
    lightbar,
    heading: 0,
    speed: 0,
    radius: Math.max(spec.w, spec.len) * 0.42,
    paintMat: paint,
    occupied: false,   // a driver (player / traffic / police) is using it
    stolen: false,
    hp: 100,
  };
}

export function placeCar(car, x, z, heading) {
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.mesh.rotation.y = heading;
  car.speed = 0;
}

// Push a circle (anything with x/z on a position object) out of every
// building AABB it overlaps. Returns true when a push happened.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre is inside the box: leave by the shallowest face.
        const left = pos.x - c.x0, right = c.x1 - pos.x;
        const top = pos.z - c.z0, bottom = c.z1 - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.x0 - radius;
        else if (m === right) pos.x = c.x1 + radius;
        else if (m === top) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
      }
    }
  }
  return hit;
}

// Circle-vs-circle between two cars; both give a little. Returns overlap.
export function collideCars(a, b) {
  const pa = a.mesh.position, pb = b.mesh.position;
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const rr = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr || d2 < 0.0001) return 0;
  const d = Math.sqrt(d2);
  const push = (rr - d) / 2;
  const ux = dx / d, uz = dz / d;
  pa.x -= ux * push; pa.z -= uz * push;
  pb.x += ux * push; pb.z += uz * push;
  return push;
}

// Advance one car. input: { throttle -1..1, steer -1..1, brake bool }.
// Mutates the car's speed/heading/position and its mesh. Sets car.hitWall
// and car.hitCar when a collision eats speed this step.
export function stepCar(car, dt, input, colliders, others) {
  const maxF = car.kind === 'sport' ? CAR_MAX_SPEED + 5 : car.kind === 'police' ? 33 : CAR_MAX_SPEED;
  if (input.throttle > 0) car.speed += CAR_ACCEL * input.throttle * dt;
  else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR_BRAKE * dt;         // braking
    else car.speed += CAR_ACCEL * 0.55 * input.throttle * dt; // reversing
  }
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * CAR_BRAKE * 1.4 * dt;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  }
  car.speed -= car.speed * CAR_DRAG * dt;
  if (car.speed > maxF) car.speed = maxF;
  if (car.speed < -CAR_MAX_REVERSE) car.speed = -CAR_MAX_REVERSE;
  if (Math.abs(car.speed) < 0.02 && input.throttle === 0) car.speed = 0;

  const steerAngle = input.steer * CAR_STEER;
  if (car.speed !== 0) {
    car.heading += (car.speed / 2.9) * Math.tan(steerAngle) * dt;
  }

  const pos = car.mesh.position;
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;

  car.hitWall = false;
  car.hitCar = false;
  if (collideCircle(pos, car.radius, colliders)) {
    car.hitWall = true;
    car.speed *= 0.35;
  }
  if (others) {
    for (const other of others) {
      if (other === car || !other.mesh.visible) continue;
      if (collideCars(car, other) > 0) {
        car.hitCar = true;
        car.speed *= 0.55;
        other.speed = (other.speed || 0) * 0.6;
      }
    }
  }

  // Keep cars inside the playable coast (the pier is solid collider).
  pos.x = Math.max(-204, Math.min(204, pos.x));
  pos.z = Math.max(-204, Math.min(216, pos.z));

  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.36;
  car.wheels[0].rotation.x += spin;
  car.wheels[1].rotation.x += spin;
  // A hint of body roll in corners, pitch under acceleration.
  car.mesh.rotation.z = -steerAngle * Math.min(1, Math.abs(car.speed) / 18) * 0.35;
  car.mesh.rotation.x = Math.max(-0.03, Math.min(0.03, -car.speed * 0.0008));
}
