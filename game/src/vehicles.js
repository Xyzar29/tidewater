// vehicles.js — procedural cars and their arcade physics.
//
// Every car in Port Serena is built from boxes and cylinders at boot: a
// rounded-ish body, a glasshouse, four wheels that roll and steer, lights.
// One shared physics step drives them all — the player, traffic and police
// all just fill in an input struct {throttle, steer, brake} and this file
// moves the metal, resolves building collisions and reports crashes.

import { isOnRoad, collideCircle } from './city.js';
import { SAND_X, WATER_X } from './config.js';

export const CAR_TYPES = {
  sedan:    { len: 4.5, wid: 1.9, top: 27, accel: 11, bodyH: 0.62, cabH: 0.55, cabLen: 2.2 },
  hatch:    { len: 3.9, wid: 1.8, top: 24, accel: 10, bodyH: 0.66, cabH: 0.62, cabLen: 1.9 },
  sports:   { len: 4.3, wid: 1.9, top: 37, accel: 17, bodyH: 0.5,  cabH: 0.34, cabLen: 2.0 },
  van:      { len: 5.3, wid: 2.1, top: 21, accel: 8,  bodyH: 1.15, cabH: 0.5,  cabLen: 1.4 },
  police:   { len: 4.6, wid: 1.95, top: 33, accel: 15, bodyH: 0.62, cabH: 0.55, cabLen: 2.2 },
  armoured: { len: 5.6, wid: 2.2, top: 20, accel: 7,  bodyH: 1.3,  cabH: 0.5,  cabLen: 1.5 },
};

export const TRAFFIC_COLOURS = [
  0xe8e4da, 0xc0c6cc, 0x7fb3d5, 0xd64545, 0x4ecdc4, 0xf6d8a8,
  0x8e6cc8, 0x3f9e4d, 0xef8fb5, 0x5a6068, 0xf39c3d, 0x2a4a6b,
];

const glassMat = new THREE.MeshLambertMaterial({ color: 0x223140 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x2e2e33 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d });

// Build the mesh for one car. Faces +z. Police cars get the PSPD livery and
// a working lightbar (materials stashed in userData for police.js to flash).
export function buildCarMesh(type, colourHex) {
  const t = CAR_TYPES[type];
  const grp = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colourHex });
  const isPolice = type === 'police';

  const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, t.bodyH, t.len), paint);
  body.position.y = 0.38 + t.bodyH / 2;
  body.castShadow = true;
  grp.add(body);

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(t.wid * 0.86, t.cabH, t.cabLen),
    isPolice ? paint : glassMat
  );
  cab.position.set(0, 0.38 + t.bodyH + t.cabH / 2 - 0.04, type === 'van' || type === 'armoured' ? t.len * 0.22 : -t.len * 0.04);
  cab.castShadow = true;
  grp.add(cab);
  if (isPolice) {
    // white doors / blue band livery on a dark cruiser
    const band = new THREE.Mesh(new THREE.BoxGeometry(t.wid + 0.03, 0.3, t.len * 0.96),
      new THREE.MeshLambertMaterial({ color: 0x2456a8 }));
    band.position.y = 0.72;
    grp.add(band);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.86, 0.07, t.cabLen),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    roof.position.copy(cab.position); roof.position.y += t.cabH / 2;
    grp.add(roof);
    const barL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    barL.position.set(-0.32, roof.position.y + 0.14, cab.position.z);
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    barR.position.set(0.32, roof.position.y + 0.14, cab.position.z);
    grp.add(barL); grp.add(barR);
    grp.userData.barL = barL.material;
    grp.userData.barR = barR.material;
  }

  // bumpers + lights
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(t.wid, 0.22, 0.24), trimMat);
  bumperF.position.set(0, 0.42, t.len / 2 + 0.05);
  grp.add(bumperF);
  const bumperB = bumperF.clone();
  bumperB.position.z = -t.len / 2 - 0.05;
  grp.add(bumperB);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    hl.position.set(sx * t.wid * 0.32, 0.78, t.len / 2 + 0.16);
    grp.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    tl.position.set(sx * t.wid * 0.32, 0.8, -t.len / 2 - 0.16);
    grp.add(tl);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wpos = [
    [-t.wid / 2, t.len * 0.32, true], [t.wid / 2, t.len * 0.32, true],
    [-t.wid / 2, -t.len * 0.32, false], [t.wid / 2, -t.len * 0.32, false],
  ];
  for (const [wx, wz, front] of wpos) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.castShadow = true;
    pivot.add(wheel);
    grp.add(pivot);
    wheels.push({ pivot, wheel, front });
  }
  grp.userData.wheels = wheels;
  return grp;
}

// Create a car entity and register it in G.cars.
export function createCar(G, type, colourHex, x, z, heading, driver) {
  const mesh = buildCarMesh(type, colourHex);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    mesh, type, colour: colourHex,
    x, z, heading, speed: 0,
    input: { throttle: 0, steer: 0, brake: false },
    driver: driver || 'none',   // 'player' | 'traffic' | 'police' | 'parked' | 'none'
    ai: null,                    // traffic/police scratch state
    hp: type === 'armoured' ? 400 : 120,
    crashCooldown: 0,
    dead: false,
  };
  G.cars.push(car);
  return car;
}

export function removeCar(G, car) {
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
  G.scene.remove(car.mesh);
}

// The arcade step. Fills car.input beforehand; this integrates and collides.
export function stepCar(G, car, dt) {
  const t = CAR_TYPES[car.type];
  const inp = car.input;
  if (car.crashCooldown > 0) car.crashCooldown -= dt;

  // Longitudinal: engine, drag, brakes, reverse.
  const offRoad = !isOnRoad(car.x, car.z);
  const inWater = car.x > WATER_X - 2;
  let top = t.top * (offRoad ? 0.55 : 1) * (inWater ? 0.2 : 1);
  if (inp.throttle > 0) {
    car.speed += t.accel * inp.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (inp.throttle < 0) {
    if (car.speed > 0.6) car.speed -= 26 * dt;               // braking with S
    else car.speed += 7 * inp.throttle * dt;                  // reverse
  }
  if (inp.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed -= car.speed * 0.35 * dt;                          // rolling drag
  if (offRoad) car.speed -= car.speed * 0.9 * dt;
  car.speed = Math.max(-8, Math.min(top, car.speed));
  if (Math.abs(car.speed) < 0.02 && inp.throttle === 0) car.speed = 0;

  // Steering: more lock at low speed, less at pace; only bites when moving.
  const steerAuthority = Math.max(-1, Math.min(1, car.speed / 6));
  car.heading += inp.steer * 1.55 * steerAuthority * dt * (Math.abs(car.speed) > 6 ? 6 / Math.abs(car.speed) * 1.6 : 1);

  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;

  // Buildings: treat the car as a fat circle; a solid hit costs speed.
  const r = t.len * 0.34;
  const res = collideCircle(G.city, car.x, car.z, r);
  if (res.hit) {
    car.x = res.x; car.z = res.z;
    if (Math.abs(car.speed) > 4 && car.crashCooldown <= 0) {
      car.crashCooldown = 0.5;
      if (G.onCarCrash) G.onCarCrash(car, null, Math.abs(car.speed));
    }
    car.speed *= -0.22;
  }

  // World bounds: keep cars inside the playable coast.
  car.x = Math.max(-306, Math.min(344, car.x));
  car.z = Math.max(-306, Math.min(306, car.z));

  // Sync the mesh; wheels roll, front wheels yaw.
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels;
  if (wheels) {
    const spin = car.speed * dt / 0.36;
    for (const w of wheels) {
      w.wheel.rotation.x += spin;
      if (w.front) w.pivot.rotation.y = inp.steer * 0.42;
    }
  }
}

// Car-to-car shoving for every pair in G.cars. Cheap n² with tiny n.
export function collideCars(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const rr = 2.45;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      const rel = Math.abs(a.speed - b.speed);
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg; b.speed = avg;
      if (rel > 3.5) {
        if (a.crashCooldown <= 0 && G.onCarCrash) { a.crashCooldown = 0.5; G.onCarCrash(a, b, rel); }
        if (b.crashCooldown <= 0 && G.onCarCrash) { b.crashCooldown = 0.5; G.onCarCrash(b, a, rel); }
      }
      a.mesh.position.set(a.x, 0, a.z);
      b.mesh.position.set(b.x, 0, b.z);
    }
  }
}
