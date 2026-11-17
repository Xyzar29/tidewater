// TIDEWATER — player controller: on-foot movement, driving, chase camera.

import { PLAYER, CAR } from './config.js';
import { collide } from './city.js';
import { createPersonMesh } from './pedestrians.js';
import { stepCar, syncCarMesh } from './vehicles.js';

export class Player {
  constructor(scene, startPos) {
    this.x = startPos.x; this.z = startPos.z; this.y = 0;
    this.heading = 0; this.yaw = 0; this.pitch = 0.18;
    this.health = PLAYER.maxHealth; this.money = PLAYER.startMoney;
    this.mode = 'foot'; // 'foot' | 'car'
    this.car = null; this.speedRatio = 0;
    this.mesh = createPersonMesh(0x06d6a0, 0x173f5f);
    scene.add(this.mesh);
    this.camPos = new THREE.Vector3(this.x, 6, this.z - 10);
    this.walkPhase = 0;
  }
  get pos() { return this.mode === 'car' && this.car ? { x: this.car.x, z: this.car.z } : { x: this.x, z: this.z }; }
  get headingNow() { return this.mode === 'car' && this.car ? this.car.heading : this.heading; }

  enterCar(car) {
    this.car = car; this.mode = 'car'; car.isPlayerCar = true; car.parked = false;
    this.mesh.visible = false;
  }
  exitCar() {
    if (!this.car) return null;
    const c = this.car;
    c.isPlayerCar = false; if (Math.abs(c.speed) < 0.5) c.parked = true;
    this.x = c.x + Math.cos(c.heading) * 2.2; this.z = c.z - Math.sin(c.heading) * 2.2;
    this.heading = c.heading; this.car = null; this.mode = 'foot';
    this.mesh.visible = true;
    return c;
  }

  update(dt, input, colliders, camera) {
    if (this.mode === 'foot') {
      const run = input.keys['shift'] ? 1.45 : 1;
      let mx = 0, mz = 0;
      if (input.keys['w']) mz += 1; if (input.keys['s']) mz -= 1;
      if (input.keys['a']) mx -= 1; if (input.keys['d']) mx += 1;
      const moving = (mx !== 0 || mz !== 0);
      if (moving) {
        const len = Math.hypot(mx, mz); mx /= len; mz /= len;
        // Camera sits at player + (sin yaw, cos yaw)*dist and looks at the
        // player, so forward (away from camera) is -(sin yaw, cos yaw) and
        // right is (cos yaw, -sin yaw).
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        const fx = -s * mz + c * mx;
        const fz = -c * mz - s * mx;
        const spd = PLAYER.walkSpeed * run;
        this.x += fx * spd * dt; this.z += fz * spd * dt;
        this.heading = Math.atan2(fx, fz);
        this.walkPhase += dt * 10;
      }
      const pos = { x: this.x, z: this.z }; collide(pos, PLAYER.radius, colliders); this.x = pos.x; this.z = pos.z;
      this.x = Math.max(-128, Math.min(128, this.x)); this.z = Math.max(-128, Math.min(132, this.z));
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.yaw + Math.PI;
      const legs = this.mesh.getObjectByName('legs');
      if (legs) legs.rotation.x = moving ? Math.sin(this.walkPhase) * 0.5 : 0;
      this.speedRatio = 0;
      // third-person camera behind the player along +yaw direction
      const dist = 7.5, h = 3.4;
      const cx = this.x + Math.sin(this.yaw) * dist * Math.cos(this.pitch);
      const cz = this.z + Math.cos(this.yaw) * dist * Math.cos(this.pitch);
      this.camPos.x += (cx - this.camPos.x) * Math.min(1, dt * 7);
      this.camPos.z += (cz - this.camPos.z) * Math.min(1, dt * 7);
      this.camPos.y += ((h + Math.sin(this.pitch) * dist) - this.camPos.y) * Math.min(1, dt * 7);
      camera.position.copy(this.camPos);
      camera.lookAt(this.x, 1.6, this.z);
    } else if (this.car) {
      let throttle = 0, steer = 0;
      if (input.keys['w']) throttle = 1; if (input.keys['s']) throttle = -1;
      if (input.keys['a']) steer = 1; if (input.keys['d']) steer = -1;
      const boost = this.car.kind === 'sport';
      this.speedRatio = stepCar(this.car, throttle, steer, dt, boost);
      const pos = { x: this.car.x, z: this.car.z }; collide(pos, 1.4, colliders);
      if (pos.x !== this.car.x || pos.z !== this.car.z) { this.car.x = pos.x; this.car.z = pos.z; this.car.speed *= 0.4; }
      this.car.x = Math.max(-128, Math.min(128, this.car.x)); this.car.z = Math.max(-128, Math.min(130, this.car.z));
      syncCarMesh(this.car);
      this.x = this.car.x; this.z = this.car.z;
      // chase camera
      const back = 10 + Math.abs(this.car.speed) * 0.12;
      const cx = this.car.x - Math.sin(this.car.heading) * back;
      const cz = this.car.z - Math.cos(this.car.heading) * back;
      this.camPos.x += (cx - this.camPos.x) * Math.min(1, dt * 4.5);
      this.camPos.z += (cz - this.camPos.z) * Math.min(1, dt * 4.5);
      this.camPos.y += (4.2 - this.camPos.y) * Math.min(1, dt * 4.5);
      camera.position.copy(this.camPos);
      camera.lookAt(this.car.x + Math.sin(this.car.heading) * 6, 1.4, this.car.z + Math.cos(this.car.heading) * 6);
    }
  }
}
export { CAR };
