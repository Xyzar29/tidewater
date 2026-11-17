// TIDEWATER — procedural car models + arcade car physics helpers.

import { CAR } from './config.js';

const BODY_COLORS = [0xd64545, 0x4a7fc9, 0x59b06a, 0xe8e3d5, 0x333a45, 0xe08a2e, 0x9b59b6, 0x2ec4b6];

export function makeCarState(x, z, heading, kind) {
  return { x, z, heading: heading || 0, speed: 0, steer: 0, kind: kind || 'sedan', health: 100, mesh: null, isPlayerCar: false };
}

// Build a low-poly car group: body, cabin, wheels, lights. Police get livery.
export function createCarMesh(kind, colorHex) {
  const g = new THREE.Group();
  const isPolice = kind === 'police';
  const isSport = kind === 'sport';
  const isVan = kind === 'van';
  const bodyColor = isPolice ? 0xf2f2f2 : (colorHex != null ? colorHex : BODY_COLORS[0]);
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const len = isVan ? 5.2 : isSport ? 4.4 : 4.6;
  const h = isVan ? 1.5 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, h, len), bodyMat);
  body.position.y = 0.55 + h / 2 - 0.3; g.add(body);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, len * 0.9), new THREE.MeshLambertMaterial({ color: 0x173f5f }));
    stripe.position.y = body.position.y; g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0xff3355 }));
    bar.position.set(0, body.position.y + h / 2 + 0.35, 0); bar.name = 'lightbar'; g.add(bar);
  }
  if (!isVan) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, len * 0.45), new THREE.MeshLambertMaterial({ color: isSport ? bodyColor : 0x22303c }));
    cab.position.set(0, body.position.y + h / 2 + 0.22, -0.2); g.add(cab);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.1), new THREE.MeshLambertMaterial({ color: 0x22303c }));
    cab.position.set(0, body.position.y + 0.35, len / 2 - 0.7); g.add(cab);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181a1d });
  const wheels = [];
  [[-0.95, len / 2 - 0.8], [0.95, len / 2 - 0.8], [-0.95, -len / 2 + 0.8], [0.95, -len / 2 + 0.8]].forEach(p => {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.36, p[1]); g.add(w); wheels.push(w);
  });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  [-0.6, 0.6].forEach(x => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    l.position.set(x, 0.72, len / 2 + 0.02); g.add(l);
  });
  g.userData.wheels = wheels; g.userData.len = len;
  return g;
}

export function pickBodyColor(rng) { return rng.pick(BODY_COLORS); }

// Arcade step: throttle -1..1, steer -1..1. Mutates state; returns speed ratio.
export function stepCar(s, throttle, steer, dt, boost) {
  const maxF = boost ? CAR.maxSpeed * 1.25 : CAR.maxSpeed;
  if (throttle > 0) s.speed += CAR.accel * throttle * dt * (1 - Math.max(0, s.speed) / (maxF * 1.4));
  else if (throttle < 0) {
    if (s.speed > 0.5) s.speed -= CAR.brake * dt;
    else s.speed = Math.max(-CAR.maxReverse, s.speed + CAR.accel * throttle * dt * 0.6);
  } else {
    s.speed -= s.speed * 0.6 * dt; if (Math.abs(s.speed) < 0.05) s.speed = 0;
  }
  s.speed = Math.max(-CAR.maxReverse, Math.min(maxF, s.speed));
  s.steer += ((steer || 0) - s.steer) * Math.min(1, dt * 8);
  const spdFactor = Math.min(1, Math.abs(s.speed) / 8 + 0.15);
  if (Math.abs(s.speed) > 0.1) s.heading -= s.steer * CAR.turnRate * dt * spdFactor * Math.sign(s.speed);
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;
  return s.speed / CAR.maxSpeed;
}

export function syncCarMesh(s) {
  if (!s.mesh) return;
  s.mesh.position.set(s.x, 0, s.z);
  s.mesh.rotation.y = s.heading;
  const wheels = s.mesh.userData.wheels || [];
  for (const w of wheels) w.rotation.x += s.speed * 0.03;
  const bar = s.mesh.getObjectByName('lightbar');
  if (bar) bar.material.color.setHex(Math.floor(performance.now() / 300) % 2 ? 0xff3355 : 0x3388ff);
}
