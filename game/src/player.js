// player.js — Marisol "Mari" Vega: on-foot movement with a mouse-look chase
// camera, entering/stealing cars, arcade driving, health and damage.

import { PLAYER } from './config.js';
import { buildHumanoid, poseHumanoid, driveCar, syncCarMesh } from './vehicles.js';
import { collideCircle } from './city.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createPlayer(G) {
  const mesh = buildHumanoid({ shirt: 0x1f9e93, pants: 0x2f3542, skin: 0xd9a066, hair: 0x241a12 });
  G.scene.add(mesh);

  const player = {
    mesh,
    x: -225, z: -192, heading: 0,
    camYaw: 0, camPitch: 0.18,
    car: null,
    health: 100,
    speedNow: 0,
    carSpeedBefore: 0,
    walkPhase: 0,
    lastHurt: -99,
    enterCooldown: 0,

    teleport(x, z, heading) {
      this.x = x; this.z = z;
      if (heading !== undefined) { this.heading = heading; this.camYaw = heading; }
      if (this.car) { this.car.x = x; this.car.z = z; syncCarMesh(this.car, 0); }
    },

    damage(n) {
      if (G.state.screen !== 'playing') return;
      this.health -= n;
      this.lastHurt = G.state.time;
      G.hud.flashDamage();
      if (this.health <= 0 && G.onWasted) G.onWasted();
    },

    heal(n) {
      this.health = Math.min(100, this.health + n);
    },

    nearestCar(maxDist) {
      let best = null, bestD = maxDist;
      for (const car of G.cars) {
        if (car.driver === 'player') continue;
        const d = Math.hypot(car.x - this.x, car.z - this.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },

    enterCar(car) {
      // witnessed theft heats up; the first owner always notices eventually
      const witnessed = G.police.nearestDist < 60 ||
        G.peds.some((p) => !p.dead && Math.hypot(p.x - car.x, p.z - car.z) < 15);
      if (!car.playerUsed) {
        car.playerUsed = true;
        if (witnessed) G.police.reportCrime('theft', car.x, car.z, 100);
        if (car.missionTag === 'steal-target') G.police.addHeat(100);
      }
      if (car.driver === 'traffic') car.driver = null;
      if (car.driver === 'police') car.driver = null;
      car.driver = 'player';
      this.car = car;
      this.mesh.visible = false;
      this.enterCooldown = 0.35;
      G.audio.engineStart();
      if (G.missions) G.missions.onEnterCar(car);
    },

    exitCar() {
      const car = this.car;
      if (!car) return;
      car.driver = null;
      this.car = null;
      // step out on the left side of the car
      const lx = -Math.cos(car.heading), lz = Math.sin(car.heading);
      this.x = car.x + lx * (car.spec.wid / 2 + 0.9);
      this.z = car.z + lz * (car.spec.wid / 2 + 0.9);
      this.heading = car.heading;
      this.mesh.visible = true;
      this.enterCooldown = 0.35;
      collideCircle(G, this, PLAYER.radius);
    },

    update(dt) {
      const input = G.input;
      this.enterCooldown = Math.max(0, this.enterCooldown - dt);
      // slow health regen after a quiet spell
      if (this.health > 0 && G.state.time - this.lastHurt > 7) this.heal(3 * dt);

      // camera mouse control
      const sens = 0.0026;
      if (input.lookDX || input.lookDY) {
        this.camYaw -= input.lookDX * sens;
        this.camPitch = Math.max(-0.15, Math.min(1.0, this.camPitch + input.lookDY * sens));
        input.lookDX = 0; input.lookDY = 0;
      }

      if (this.car) this.updateDriving(dt, input);
      else this.updateOnFoot(dt, input);
      this.updateCamera(dt);
    },

    updateOnFoot(dt, input) {
      const k = input.keys;
      let ix = 0, iz = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) iz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
      const running = k.has('ShiftLeft') || k.has('ShiftRight');
      const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const rx = -fz, rz = fx;
      let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        mx /= len; mz /= len;
        this.x += mx * speed * dt;
        this.z += mz * speed * dt;
        const targetHeading = Math.atan2(mx, mz);
        this.heading += wrapAngle(targetHeading - this.heading) * Math.min(1, dt * 14);
        this.walkPhase += dt * speed * 2.3;
        this.speedNow = speed;
      } else {
        this.speedNow = 0;
      }
      collideCircle(G, this, PLAYER.radius);
      // don't walk through cars
      for (const car of G.cars) {
        const dx = this.x - car.x, dz = this.z - car.z;
        const rr = car.spec.len * 0.42 + 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          this.x = car.x + (dx / d) * rr;
          this.z = car.z + (dz / d) * rr;
        }
      }
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
      const aiming = G.combat && G.combat.weapon.drawn;
      if (aiming) this.heading = this.camYaw;
      poseHumanoid(this.mesh, this.walkPhase, this.speedNow, aiming);
      // E: get into the nearest car
      if (input.pressed.has('KeyE') && this.enterCooldown <= 0) {
        const car = this.nearestCar(3.4);
        if (car) this.enterCar(car);
      }
    },

    updateDriving(dt, input) {
      const car = this.car;
      const k = input.keys;
      let steer = 0, throttle = 0;
      if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) throttle += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) throttle -= 1;
      const brake = k.has('Space');
      this.carSpeedBefore = car.speed;
      driveCar(car, dt, steer, throttle, brake);
      const hit = collideCircle(G, car, 1.35);
      if (hit && Math.abs(car.speed) > 4) {
        car.speed *= 0.45;
        this.damage(1.5);
      }
      // running someone down is very much a crime
      for (const ped of G.peds) {
        if (ped.dead) continue;
        const dx = ped.x - car.x, dz = ped.z - car.z;
        if (dx * dx + dz * dz < 3.6 && Math.abs(car.speed) > 3) {
          ped.dead = true;
          ped.deadTimer = 25;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.25;
          G.police.reportCrime('pedHit', ped.x, ped.z, 130);
          G.audio.thud();
        }
      }
      this.x = car.x; this.z = car.z;
      this.heading = car.heading;
      this.speedNow = Math.abs(car.speed);
      syncCarMesh(car, dt);
      if (input.pressed.has('KeyE') && this.enterCooldown <= 0 && Math.abs(car.speed) < 14) {
        this.exitCar();
      }
    },

    updateCamera(dt) {
      const cam = G.camera;
      if (G.camOverride) {
        cam.position.copy(G.camOverride.pos);
        cam.lookAt(G.camOverride.look);
        return;
      }
      if (this.car) {
        // chase camera: ease behind the car, mouse can nudge the orbit
        const targetYaw = this.car.heading;
        let dy = wrapAngle(targetYaw - this.camYaw);
        const moving = Math.abs(this.car.speed) > 2;
        this.camYaw += dy * Math.min(1, dt * (moving ? 2.6 : 0.7));
        const pitch = 0.24 + this.camPitch * 0.3;
        const dist = 10.6, height = 3.4;
        const bx = this.car.x - Math.sin(this.camYaw) * Math.cos(pitch) * dist;
        const bz = this.car.z - Math.cos(this.camYaw) * Math.cos(pitch) * dist;
        cam.position.set(bx, height + Math.sin(pitch) * dist, bz);
        cam.lookAt(this.car.x + Math.sin(this.camYaw) * 6, 1.6, this.car.z + Math.cos(this.camYaw) * 6);
      } else {
        const pitch = this.camPitch;
        const dist = 7.6;
        const tx = this.x, ty = 1.7, tz = this.z;
        const cx = tx - Math.sin(this.camYaw) * Math.cos(pitch) * dist;
        const cz = tz - Math.cos(this.camYaw) * Math.cos(pitch) * dist;
        const cy = ty + Math.sin(pitch) * dist;
        cam.position.set(cx, Math.max(0.7, cy), cz);
        cam.lookAt(tx + Math.sin(this.camYaw) * 4, ty + 0.2, tz + Math.cos(this.camYaw) * 4);
      }
    },
  };

  player.mesh.position.set(player.x, 0, player.z);
  return player;
}
