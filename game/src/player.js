// Mari Vega: on-foot movement with a mouse-look third-person camera,
// entering and stealing cars, arcade driving with a chase camera, crash
// damage and the WASTED flow. Input arrives via G.input, filled by main.

import { TUNE } from './config.js';
import { collideCircle } from './city.js';
import { buildFigure, animateFigure, hurtPed } from './pedestrians.js';
import { driveCar } from './vehicles.js';
import { resumeTraffic } from './traffic.js';
import { clamp, angDiff, dist2 } from './random.js';

export function createPlayer(G) {
  const mesh = buildFigure(0x14b8a6, 0x1f3a52, 0xc98d5e);
  // Mari's dark ponytail cap sets her apart from the crowd.
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.14, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x241a12 })
  );
  hair.position.y = 1.82;
  mesh.add(hair);
  G.scene.add(mesh);

  const player = {
    mesh, x: -178, z: -44, heading: Math.PI / 2,
    health: 100, maxHealth: 100,
    driving: null, phase: 0, hurtT: 0, regenT: 0, shake: 0,
    get car() { return this.driving; },
  };
  mesh.position.set(player.x, G.city.groundY(player.x, player.z), player.z);
  G.player = player;
  return player;
}

export function hurtPlayer(G, dmg) {
  const p = G.player;
  if (G.state !== 'playing' || dmg <= 0) return;
  p.health -= dmg;
  p.regenT = 0;
  p.shake = Math.min(0.5, p.shake + dmg * 0.012);
  G.audio.hurt();
  if (p.health <= 0) {
    p.health = 0;
    G.onWasted();
  }
}

export function healPlayer(G, amount) {
  const p = G.player;
  p.health = Math.min(p.maxHealth, p.health + amount);
}

export function teleport(G, x, z) {
  const p = G.player;
  if (p.driving) exitCar(G);
  p.x = x; p.z = z;
  p.mesh.position.set(x, G.city.groundY(x, z), z);
}

export function nearestCar(G, maxDist) {
  const p = G.player;
  let best = null, bestD = maxDist * maxDist;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = dist2(p.x, p.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  p.driving = car;
  car.occupant = 'player';
  p.mesh.visible = false;
  if (!car.stolen) {
    car.stolen = true;
    if (car.kind === 'parked' || car.kind === 'traffic') {
      G.police.reportCrime('theft', car.x, car.z);
    }
  }
  G.hud.hint('W A S D drive · E exit');
}

export function exitCar(G) {
  const p = G.player;
  const car = p.driving;
  if (!car) return;
  p.driving = null;
  car.occupant = null;
  // Step out on the car's left side.
  const lx = car.x + Math.cos(car.heading) * -2.2;
  const lz = car.z + Math.sin(car.heading) * 2.2;
  const [nx, nz] = collideCircle(G.city, lx, lz, TUNE.playerRadius);
  p.x = nx; p.z = nz;
  p.heading = car.heading;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, G.city.groundY(p.x, p.z), p.z);
  if (car.kind === 'traffic') resumeTraffic(G, car);
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  p.regenT += dt;
  if (p.regenT > 6 && p.health > 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + 1.4 * dt);
  }
  p.shake = Math.max(0, p.shake - dt * 1.4);

  if (input.pressed.has('KeyE')) {
    if (p.driving) exitCar(G);
    else {
      const car = nearestCar(G, TUNE.interactRange);
      if (car) enterCar(G, car);
    }
  }

  if (p.driving) updateDriving(G, dt);
  else updateOnFoot(G, dt);
  updateCamera(G, dt);
}

function updateOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  // Camera-relative movement.
  const sin = Math.sin(input.camYaw), cos = Math.cos(input.camYaw);
  let mx = 0, mz = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) { mx += sin; mz += cos; }
  if (input.keys.has('KeyS')) { mx -= sin; mz -= cos; }
  if (input.keys.has('KeyA')) { mx += cos; mz -= sin; }
  if (input.keys.has('KeyD')) { mx -= cos; mz += sin; }
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = run ? TUNE.runSpeed : TUNE.walkSpeed;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    const want = Math.atan2(mx, mz);
    p.heading += clamp(angDiff(want, p.heading), -12 * dt, 12 * dt);
    p.phase += dt * speed * 2.1;
    animateFigure(p.mesh, p.phase, run ? 1 : 0);
  }
  const [nx, nz] = collideCircle(G.city, p.x, p.z, TUNE.playerRadius);
  p.x = clamp(nx, -268, 268);
  p.z = clamp(nz, -268, 258);
  // Cars are solid to walk into.
  for (const car of G.cars) {
    if (car.dead) continue;
    const dx = p.x - car.x, dz = p.z - car.z;
    const d2 = dx * dx + dz * dz, min = 2.4;
    if (d2 < min * min && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = car.x + (dx / d) * min;
      p.z = car.z + (dz / d) * min;
    }
  }
  p.mesh.position.set(p.x, G.city.groundY(p.x, p.z), p.z);
  p.mesh.rotation.y = p.heading;
}

function updateDriving(G, dt) {
  const p = G.player;
  const car = p.driving;
  const input = G.input;
  const ctl = { throttle: 0, steer: 0, brake: false };
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) ctl.throttle = 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) ctl.throttle = -1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) ctl.steer = 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ctl.steer = -1;
  if (input.keys.has('Space')) ctl.brake = true;
  driveCar(G, car, dt, ctl);
  p.x = car.x; p.z = car.z;
  p.heading = car.heading;

  if (car.lastImpact > 13) {
    hurtPlayer(G, (car.lastImpact - 11) * 0.9);
    G.police.reportCrime('crash', car.x, car.z);
  }
  // Running someone down is the city's loudest crime.
  if (Math.abs(car.speed) > 4) {
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist2(ped.x, ped.z, car.x, car.z) < 6.5) {
        hurtPed(G, ped, 100);
        G.police.reportCrime('hitandrun', car.x, car.z);
        G.hud.notify('You hit a pedestrian!');
      }
    }
  }
  G.audio.engine(true, Math.abs(car.speed) / car.spec.topSpeed);
}

const camPos = { x: 0, y: 6, z: 10, init: false };

export function updateCamera(G, dt) {
  const p = G.player;
  const input = G.input;
  const cam = G.camera;
  if (!camPos.init) {
    camPos.x = p.x - 8; camPos.y = 5; camPos.z = p.z - 8;
    camPos.init = true;
  }
  let tx, ty, tz, lx, ly, lz;
  if (p.driving) {
    const car = p.driving;
    // Keep the shared yaw aligned with the car so the on-foot camera is
    // already behind Mari when she steps out.
    input.camYaw += angDiff(car.heading, input.camYaw) * Math.min(1, dt * 1.6);
    const dist = 10.5, height = 4.4;
    tx = car.x - Math.sin(car.heading) * dist;
    tz = car.z - Math.cos(car.heading) * dist;
    ty = height + G.city.groundY(car.x, car.z);
    lx = car.x + Math.sin(car.heading) * 7;
    lz = car.z + Math.cos(car.heading) * 7;
    ly = 1.6;
  } else {
    const dist = 7.5;
    const pitch = input.camPitch;
    tx = p.x - Math.sin(input.camYaw) * Math.cos(pitch) * dist;
    tz = p.z - Math.cos(input.camYaw) * Math.cos(pitch) * dist;
    ty = G.city.groundY(p.x, p.z) + 1.7 + Math.sin(pitch) * dist;
    lx = p.x; lz = p.z; ly = G.city.groundY(p.x, p.z) + 1.5;
  }
  const k = Math.min(1, dt * (p.driving ? 5 : 9));
  camPos.x += (tx - camPos.x) * k;
  camPos.y += (ty - camPos.y) * k;
  camPos.z += (tz - camPos.z) * k;
  const shX = p.shake ? (Math.random() - 0.5) * p.shake : 0;
  const shY = p.shake ? (Math.random() - 0.5) * p.shake : 0;
  cam.position.set(camPos.x + shX, Math.max(1.1, camPos.y) + shY, camPos.z);
  cam.lookAt(lx, ly, lz);
}
