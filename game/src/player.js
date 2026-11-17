// player.js — Mari Vega: on-foot movement, driving, and the camera.
//
// One controller, two bodies. On foot, WASD moves relative to the camera
// and the mouse (pointer-locked, or drag) looks around. Near a car, E gets
// in — any car: parked, traffic, even a police cruiser, though the PSPD
// notice that one. In a car the same keys drive and the camera settles into
// a smoothed chase view. G.playerPos always holds where "the player" is
// for the rest of the game (her feet, or her car's centre).

import { WALK_SPEED, RUN_SPEED, SPAWN } from './config.js';
import { collideCircle } from './city.js';
import { makePerson, animatePerson } from './pedestrians.js';

export function initPlayer(G) {
  const mesh = makePerson(0x2ec4b6, 0x27324a, 0xc68863, 0x2e2018); // Mari: teal top, dark jeans
  mesh.position.set(SPAWN.x, 0.1, SPAWN.z);
  G.scene.add(mesh);
  G.player = {
    mesh, x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading,
    hp: 100, inCar: null, walkPhase: 0, flash: 0,
  };
  G.playerPos = { x: SPAWN.x, z: SPAWN.z };
  G.camYaw = Math.PI;      // start looking north, up the avenue
  G.camPitch = 0.32;
  G.camPos = new THREE.Vector3(SPAWN.x, 4, SPAWN.z + 8);
  G.nearCar = null;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Find the car Mari could get into right now (nearest within reach).
export function findNearCar(G) {
  const p = G.player;
  if (p.inCar) return p.inCar;
  let best = null, bestD = 3.6;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  p.inCar = car;
  p.mesh.visible = false;
  car.driver = 'player';
  car.input.throttle = 0; car.input.steer = 0; car.input.brake = false;
  if (!car.stolen) {
    car.stolen = true;
    if (G.onStealCar) G.onStealCar(car);
  }
  if (G.audio) G.audio.door();
}

export function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  // Step out on the car's left.
  const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
  p.x = car.x + lx * -2.2;
  p.z = car.z + lz * -2.2;
  const res = collideCircle(G.city, p.x, p.z, 0.5);
  p.x = res.x; p.z = res.z;
  p.heading = car.heading;
  p.inCar = null;
  p.mesh.visible = true;
  car.driver = 'none';
  car.input.throttle = 0; car.input.steer = 0; car.input.brake = true;
  car.speed = 0;
  if (G.audio) G.audio.door();
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const keys = G.keys;
  if (p.flash > 0) p.flash -= dt;

  // Mouse look deltas are accumulated by main.js into G.look.
  G.camYaw -= G.look.dx * 0.0031;
  G.camPitch = Math.max(-0.15, Math.min(1.1, G.camPitch + G.look.dy * 0.0026));
  G.look.dx = 0; G.look.dy = 0;

  if (p.inCar) {
    const car = p.inCar;
    car.input.throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
    car.input.steer = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? -1 : 0);
    car.input.brake = !!keys['Space'];
    p.x = car.x; p.z = car.z;
    p.heading = car.heading;
  } else {
    // On foot: move relative to the camera.
    const f = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    const s = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
    const running = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = running ? RUN_SPEED : WALK_SPEED;
    if (f !== 0 || s !== 0) {
      const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
      const rx = Math.cos(G.camYaw), rz = -Math.sin(G.camYaw);
      let mx = fx * f + rx * s, mz = fz * f + rz * s;
      const ml = Math.hypot(mx, mz);
      mx /= ml; mz /= ml;
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      p.heading = angleLerp(p.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
      p.walkPhase += dt * speed * 3.2;
      const res = collideCircle(G.city, p.x, p.z, 0.5);
      p.x = res.x; p.z = res.z;
      // Cars are solid on foot too.
      for (const car of G.cars) {
        const dx = p.x - car.x, dz = p.z - car.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.1 * 2.1 && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          p.x = car.x + (dx / d) * 2.1;
          p.z = car.z + (dz / d) * 2.1;
        }
      }
      p.x = Math.max(-306, Math.min(344, p.x));
      p.z = Math.max(-306, Math.min(306, p.z));
    }
    animatePerson(p.mesh, p.walkPhase, (f !== 0 || s !== 0) ? 1 : 0);
    p.mesh.position.x = p.x;
    p.mesh.position.z = p.z;
    p.mesh.rotation.y = p.heading;
  }

  G.playerPos.x = p.x;
  G.playerPos.z = p.z;
  G.nearCar = p.inCar ? null : findNearCar(G);
  updateCamera(G, dt);
}

const _look = new THREE.Vector3();
export function updateCamera(G, dt) {
  const p = G.player;
  const cam = G.camera;
  let tx, ty, tz, lx, ly, lz;
  if (p.inCar) {
    const car = p.inCar;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const back = 8.6 + Math.abs(car.speed) * 0.06;
    tx = car.x - fx * back; ty = 3.4; tz = car.z - fz * back;
    lx = car.x + fx * 7; ly = 1.3; lz = car.z + fz * 7;
    const k = 1 - Math.exp(-dt * 5.5);
    G.camPos.x += (tx - G.camPos.x) * k;
    G.camPos.y += (ty - G.camPos.y) * k;
    G.camPos.z += (tz - G.camPos.z) * k;
  } else {
    const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
    const dist = 5.6;
    tx = p.x - fx * dist;
    ty = 1.7 + Math.sin(G.camPitch) * dist * 0.72;
    tz = p.z - fz * dist;
    lx = p.x + fx * 4; ly = 1.45; lz = p.z + fz * 4;
    const k = 1 - Math.exp(-dt * 14);
    G.camPos.x += (tx - G.camPos.x) * k;
    G.camPos.y += (ty - G.camPos.y) * k;
    G.camPos.z += (tz - G.camPos.z) * k;
  }
  // Keep the camera out of the ground and out of the sea cliffs of geometry.
  if (G.camPos.y < 0.7) G.camPos.y = 0.7;
  cam.position.copy(G.camPos);
  _look.set(lx, ly, lz);
  cam.lookAt(_look);
}
