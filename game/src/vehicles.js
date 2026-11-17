// vehicles.js — procedural car models (built from boxes, no external assets),
// the arcade driving physics shared by the player, traffic and police, and
// the little box-person builder used for Mari, pedestrians and rival crew.

import { CAR_TYPES } from './config.js';

const matCache = new Map();
function mat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return matCache.get(hex);
}
const GLASS = () => mat(0x1d2733);
const TYRE = () => mat(0x17181a);

let nextCarId = 1;

function buildCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.55, spec.len), mat(colorHex));
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  if (type === 'van') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 1.15, spec.len * 0.78), mat(colorHex));
    box.position.set(0, 1.35, -spec.len * 0.08);
    box.castShadow = true;
    g.add(box);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.86, 0.5, 0.1), GLASS());
    shield.position.set(0, 1.15, spec.len * 0.32);
    g.add(shield);
  } else {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(spec.wid * 0.82, 0.5, spec.len * 0.44),
      type === 'police' ? mat(0xf2f0eb) : GLASS()
    );
    cabin.position.set(0, 1.05, -spec.len * 0.04);
    cabin.castShadow = true;
    g.add(cabin);
    if (type === 'sports') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.9, 0.08, 0.4), mat(0x22242a));
      spoiler.position.set(0, 1.0, -spec.len * 0.46);
      g.add(spoiler);
    }
    if (type === 'police') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.04, 0.3, spec.len * 0.9), mat(0x24406e));
      stripe.position.y = 0.52;
      g.add(stripe);
      const bar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      red.position.x = -0.3;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2a5cff }));
      blue.position.x = 0.3;
      bar.add(red); bar.add(blue);
      bar.position.y = 1.42;
      bar.userData.isLightbar = true;
      g.add(bar);
      g.userData.lightbar = bar;
    }
  }
  // lights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  const tl = new THREE.MeshBasicMaterial({ color: 0xd92b2b });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), hl);
    h.position.set(sx * spec.wid * 0.32, 0.62, spec.len / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tl);
    t.position.set(sx * spec.wid * 0.32, 0.62, -spec.len / 2 - 0.01);
    g.add(t);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo, TYRE());
    w.position.set(sx * (spec.wid / 2 - 0.05), 0.34, sz * spec.len * 0.32);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function createCar(G, type, colorHex, x, z, heading) {
  const mesh = buildCarMesh(type, colorHex);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    id: nextCarId++,
    type,
    spec: CAR_TYPES[type],
    color: colorHex,
    mesh,
    x, z, heading,
    speed: 0,
    steerVis: 0,
    driver: null, // null | 'traffic' | 'police' | 'player'
    route: null, // traffic AI state
    cop: null, // police AI state
    missionTag: null,
    wrecked: false,
  };
  G.cars.push(car);
  return car;
}

// Arcade driving: steerInput/throttleInput in [-1, 1]; brake is a strong decel.
// Mutates car.x/z/heading/speed. Collisions are the caller's job.
export function driveCar(car, dt, steerInput, throttleInput, brake) {
  const spec = car.spec;
  if (throttleInput > 0) {
    const room = Math.max(0, 1 - car.speed / spec.topSpeed);
    car.speed += spec.accel * room * throttleInput * dt * 3.2;
  } else if (throttleInput < 0) {
    if (car.speed > 0.6) car.speed -= 24 * dt;
    else car.speed = Math.max(car.speed + 7 * throttleInput * dt, -8.5);
  }
  if (brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  }
  // rolling drag + idle friction
  car.speed -= car.speed * 0.35 * dt;
  if (throttleInput === 0 && !brake) {
    const f = 5.5 * dt;
    car.speed = Math.abs(car.speed) <= f ? 0 : car.speed - Math.sign(car.speed) * f;
  }
  if (car.speed > spec.topSpeed) car.speed = spec.topSpeed;
  if (car.speed < -8.5) car.speed = -8.5;
  // steering: less angle the faster you go
  const steerAngle = steerInput * (0.62 - 0.3 * Math.min(1, Math.abs(car.speed) / spec.topSpeed));
  if (car.speed !== 0) {
    const wheelbase = spec.len * 0.62;
    car.heading += (car.speed / wheelbase) * Math.tan(steerAngle) * dt;
  }
  car.steerVis += ((steerInput * 0.5) - car.steerVis) * Math.min(1, dt * 10);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
}

export function syncCarMesh(car, dt) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels;
  if (wheels) {
    const spin = (car.speed * dt) / 0.34;
    for (const w of wheels) w.rotation.x += spin;
  }
  const bar = car.mesh.userData.lightbar;
  if (bar) {
    const phase = Math.floor(performance.now() / 280) % 2;
    bar.children[0].material.color.setHex(phase ? 0xff2a2a : 0x5c0f0f);
    bar.children[1].material.color.setHex(phase ? 0x0f2a5c : 0x2a5cff);
  }
}

// Push overlapping cars apart (circle approximation) so traffic never stacks.
export function separateCars(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const minD = (a.spec.len + b.spec.len) * 0.36;
      const d2 = dx * dx + dz * dz;
      if (d2 > minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const nx = dx / d, nz = dz / d;
      if (a.driver !== 'player') { a.x -= nx * push; a.z -= nz * push; }
      if (b.driver !== 'player') { b.x += nx * push; b.z += nz * push; }
      if (a.driver === 'player' || b.driver === 'player') {
        const other = a.driver === 'player' ? b : a;
        const p = G.player;
        if (Math.abs(p.carSpeedBefore || 0) > 6 && !other.wrecked) {
          G.police.reportCrime('collision', other.x, other.z, 12);
        }
      }
    }
  }
}

// --- people -------------------------------------------------------------------

const SKIN_TONES = [0xf2c79b, 0xd9a066, 0xa06a3b, 0x7a4a26, 0xffe0bd];

export function buildHumanoid({ shirt, pants, skin, hair }) {
  const g = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.24, 0.78, 0.26);
  legGeo.translate(0, -0.39, 0);
  const armGeo = new THREE.BoxGeometry(0.17, 0.66, 0.19);
  armGeo.translate(0, -0.3, 0);
  const legL = new THREE.Mesh(legGeo, mat(pants));
  legL.position.set(-0.14, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, mat(pants));
  legR.position.set(0.14, 0.78, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), mat(shirt));
  torso.position.y = 1.13;
  torso.castShadow = true;
  const armL = new THREE.Mesh(armGeo, mat(shirt));
  armL.position.set(-0.4, 1.44, 0);
  const armR = new THREE.Mesh(armGeo, mat(shirt));
  armR.position.set(0.4, 1.44, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), mat(skin));
  head.position.y = 1.68;
  head.castShadow = true;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.13, 0.37), mat(hair));
  hairM.position.y = 1.9;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), mat(0x1c1e22));
  gun.position.set(0, -0.62, 0.14);
  gun.visible = false;
  armR.add(gun);
  g.add(legL, legR, torso, armL, armR, head, hairM);
  g.userData.parts = { legL, legR, armL, armR, torso, head, gun };
  return g;
}

export function poseHumanoid(mesh, walkPhase, speed, aiming) {
  const p = mesh.userData.parts;
  if (!p) return;
  const swing = Math.min(1, Math.abs(speed) / 4) * 0.65;
  p.legL.rotation.x = Math.sin(walkPhase) * swing;
  p.legR.rotation.x = Math.sin(walkPhase + Math.PI) * swing;
  if (aiming) {
    p.armR.rotation.x = -1.45;
    p.armL.rotation.x = -0.25;
  } else {
    p.armL.rotation.x = Math.sin(walkPhase + Math.PI) * swing * 0.8;
    p.armR.rotation.x = Math.sin(walkPhase) * swing * 0.8;
  }
}

export function randomPersonColors(rng) {
  return {
    shirt: rng.pick([0x3fc1c9, 0xe77fb0, 0xf2b13d, 0x53b06a, 0xf2f0eb, 0x8a5fc0, 0xd94f3d, 0x3d7bd9]),
    pants: rng.pick([0x2f3542, 0x51606e, 0x8a6f4d, 0xd8d2c4, 0x37474f]),
    skin: rng.pick(SKIN_TONES),
    hair: rng.pick([0x1c1710, 0x3a2a18, 0x6e4a26, 0xb08954, 0xd9d2c4, 0x843c2c]),
  };
}
