// player.js — Mari Vega herself: the on-foot controller (WASD relative to
// the camera, Shift to run), getting in and out of cars with E, and the
// driving controls when she's behind a wheel.

import { WALK_SPEED, RUN_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP } from './config.js';
import { collideCircle, stepCar } from './vehicles.js';

function makeMari() {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.21, 0.62, 7),
    new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
  );
  legs.position.y = 0.31;
  g.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.62, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xff6b4a }),
  );
  torso.position.y = 0.93;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xc68863 }),
  );
  head.position.y = 1.5;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.22, 0.46),
    new THREE.MeshLambertMaterial({ color: 0x2a1a12 }),
  );
  hair.position.set(0, 1.66, -0.03);
  g.add(hair);
  return g;
}

export class Player {
  constructor(scene, colliders) {
    this.colliders = colliders;
    this.mesh = makeMari();
    scene.add(this.mesh);
    this.mode = 'foot';       // 'foot' | 'car'
    this.car = null;
    this.heading = 0;
    this.hp = PLAYER_MAX_HP;
    this.speedNow = 0;        // for audio / HUD / busted checks
    this.walkPhase = 0;
    this.setPosition(-146, 12);
  }

  setPosition(x, z) {
    this.mesh.position.set(x, 0, z);
  }

  // Where the world should consider Mari to be (her car, when driving).
  get pos() {
    return this.mode === 'car' && this.car ? this.car.mesh.position : this.mesh.position;
  }

  get speed() {
    if (this.mode === 'car' && this.car) return Math.abs(this.car.speed);
    return this.speedNow;
  }

  nearestCar(cars, maxDist = 3.4) {
    const p = this.mesh.position;
    let best = null, bestD = maxDist;
    for (const car of cars) {
      if (car === this.car) continue;
      const cp = car.mesh.position;
      const d = Math.hypot(cp.x - p.x, cp.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    this.mode = 'car';
    this.car = car;
    car.occupied = true;
    car.playerDriven = true;
    car.wasPlayerCar = true;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    // Step out on the left side of the car.
    const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
    this.mesh.position.set(
      car.mesh.position.x + lx * 1.8,
      0,
      car.mesh.position.z + lz * 1.8,
    );
    collideCircle(this.mesh.position, PLAYER_RADIUS, this.colliders);
    this.mesh.visible = true;
    car.occupied = false;
    car.playerDriven = false;
    car.speed = 0;
    this.car = null;
    this.mode = 'foot';
  }

  // input: { f, b, l, r (bools), run } plus camera yaw for foot movement.
  update(dt, input, camYaw, cars) {
    if (this.mode === 'car' && this.car) {
      const carInput = {
        throttle: (input.f ? 1 : 0) + (input.b ? -1 : 0),
        steer: (input.l ? 1 : 0) + (input.r ? -1 : 0),
        brake: !!input.brake,
      };
      stepCar(this.car, dt, carInput, this.colliders, cars);
      this.heading = this.car.heading;
      return;
    }

    // On foot: move relative to where the camera is looking.
    let mx = 0, mz = 0;
    if (input.f) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.b) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.l) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
    if (input.r) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const pos = this.mesh.position;
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.speedNow = speed;
      this.walkPhase += dt * speed * 2.6;
    } else {
      this.speedNow = 0;
    }
    const pos = this.mesh.position;
    collideCircle(pos, PLAYER_RADIUS, this.colliders);
    // Cars are solid too.
    for (const car of cars) {
      const cp = car.mesh.position;
      const dx = pos.x - cp.x, dz = pos.z - cp.z;
      const rr = car.radius * 0.82 + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cp.x + (dx / d) * rr;
        pos.z = cp.z + (dz / d) * rr;
      }
    }
    pos.x = Math.max(-202, Math.min(202, pos.x));
    pos.z = Math.max(-202, Math.min(215, pos.z));
    this.mesh.rotation.y = this.heading;
    this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.04;
  }
}
