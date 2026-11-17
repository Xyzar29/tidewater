// player.js — Mari herself: a merged-geometry figure other systems reuse, the
// on-foot controller (WASD + mouse look), car entry/exit, driving, and the
// chase camera that follows both modes.
import { S, CFG } from './config.js';
import { collideCircle } from './city.js';
import { driveCar } from './vehicles.js';

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

const figureMat = new THREE.MeshLambertMaterial({ vertexColors: true });

// A low-poly person facing +z, built from coloured boxes merged into one mesh,
// plus a separate pistol mesh the combat system can show or hide.
export function makeFigure(pal) {
  const P = [];
  const add = (w, h, d, x, y, z, color) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
    P.push({ g, color });
  };
  add(0.44, 0.55, 0.25, 0, 0.275, 0, pal.pants);          // legs
  add(0.54, 0.62, 0.28, 0, 0.86, 0, pal.shirt);           // torso
  add(0.13, 0.56, 0.13, -0.34, 0.85, 0, pal.shirt);       // arms
  add(0.13, 0.56, 0.13, 0.34, 0.85, 0, pal.shirt);
  add(0.34, 0.36, 0.32, 0, 1.34, 0, pal.skin);            // head
  add(0.37, 0.13, 0.35, 0, 1.56, 0, pal.hair);            // hair
  const group = new THREE.Group();
  const body = new THREE.Mesh(mergeParts(P), figureMat);
  body.castShadow = true;
  group.add(body);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.44),
    new THREE.MeshLambertMaterial({ color: 0x1e2126 }));
  gun.position.set(0.34, 0.92, 0.3);
  gun.visible = false;
  group.add(gun);
  group.userData.gun = gun;
  return group;
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function createPlayer(g) {
  const mesh = makeFigure({ shirt: 0xff7a59, pants: 0x2e3d59, skin: 0xc98a64, hair: 0x3a2418 });
  mesh.position.set(-146, 0.12, -114);
  g.scene.add(mesh);

  const P = {
    mesh, mode: 'foot', car: null,
    yaw: Math.PI, pitch: 0.3, walkCycle: 0,
    vel: { x: 0, z: 0 }, footSpeed: 0,
    camSnap: true,

    pos() {
      const p = this.mode === 'car' ? this.car.mesh.position : this.mesh.position;
      return { x: p.x, z: p.z };
    },
    info() {
      if (this.mode === 'car') {
        const c = this.car;
        return { speed: c.speed, heading: c.heading, vel: { x: Math.sin(c.heading) * c.speed, z: Math.cos(c.heading) * c.speed } };
      }
      return { speed: this.footSpeed, heading: this.mesh.rotation.y, vel: this.vel };
    },
    teleport(x, z) {
      this.mesh.position.set(x, 0.12, z);
      if (this.car) this.car.mesh.position.set(x, 0, z);
      this.camSnap = true;
    },
    nearestCar() {
      const p = this.pos();
      let best = null, bd = 3.6;
      for (const c of g.cars) {
        const d = Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    enterCar(car) {
      this.mode = 'car'; this.car = car;
      car.driver = 'player'; S.inCar = car;
      this.mesh.visible = false;
      if (!car.stolen) {
        car.stolen = true;
        g.reportCrime('theft', car.mesh.position);
      }
      g.audioSfx('click');
    },
    exitCar() {
      const car = this.car; if (!car) return;
      const h = car.heading;
      const rx = -Math.cos(h), rz = Math.sin(h);
      this.mesh.position.set(car.mesh.position.x + rx * 2.4, 0.12, car.mesh.position.z + rz * 2.4);
      collideCircle(this.mesh.position, CFG.playerRadius, g.city.colliders);
      this.mesh.rotation.y = h;
      car.driver = 'parked'; car.speed = 0;
      this.car = null; this.mode = 'foot'; S.inCar = null;
      this.mesh.visible = true;
      this.yaw = h;
    },
    toggleVehicle() {
      if (this.mode === 'car') this.exitCar();
      else { const c = this.nearestCar(); if (c) this.enterCar(c); }
    },

    update(dt) {
      const k = g.keys;
      if (this.mode === 'car') {
        const car = this.car;
        let throttle = 0, steer = 0, brake = false;
        if (S.autopilot) { throttle = S.autopilot.throttle; steer = S.autopilot.steer; }
        else {
          if (k.has('KeyW') || k.has('ArrowUp')) throttle = 1;
          if (k.has('KeyS') || k.has('ArrowDown')) throttle = -1;
          if (k.has('KeyA') || k.has('ArrowLeft')) steer = 1;
          if (k.has('KeyD') || k.has('ArrowRight')) steer = -1;
          brake = k.has('Space');
        }
        driveCar(car, dt, throttle, steer, g, brake);
        this.mesh.position.set(car.mesh.position.x, 0.12, car.mesh.position.z);
        if (throttle !== 0 && !S.autopilot) this.yaw = angleLerp(this.yaw, car.heading, dt * 2.4);
        this.vel = { x: Math.sin(car.heading) * car.speed, z: Math.cos(car.heading) * car.speed };
        this.footSpeed = Math.abs(car.speed);
      } else {
        const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
        const r = { x: -f.z, z: f.x };
        let mx = 0, mz = 0;
        if (k.has('KeyW') || k.has('ArrowUp')) { mx += f.x; mz += f.z; }
        if (k.has('KeyS') || k.has('ArrowDown')) { mx -= f.x; mz -= f.z; }
        if (k.has('KeyD') || k.has('ArrowRight')) { mx += r.x; mz += r.z; }
        if (k.has('KeyA') || k.has('ArrowLeft')) { mx -= r.x; mz -= r.z; }
        const len = Math.hypot(mx, mz);
        const run = k.has('ShiftLeft') || k.has('ShiftRight');
        const speed = len > 0 ? (run ? CFG.runSpeed : CFG.walkSpeed) : 0;
        if (len > 0) {
          mx /= len; mz /= len;
          this.mesh.position.x += mx * speed * dt;
          this.mesh.position.z += mz * speed * dt;
          const targetYaw = Math.atan2(mx, mz);
          this.mesh.rotation.y = angleLerp(this.mesh.rotation.y, targetYaw, dt * 12);
          this.walkCycle += dt * speed * 1.7;
          this.mesh.position.y = 0.12 + Math.abs(Math.sin(this.walkCycle)) * 0.05;
        }
        this.footSpeed = speed;
        this.vel = { x: mx * speed, z: mz * speed };
        collideCircle(this.mesh.position, CFG.playerRadius, g.city.colliders);
        for (const c of g.cars) {
          const dx = this.mesh.position.x - c.mesh.position.x;
          const dz = this.mesh.position.z - c.mesh.position.z;
          const rr = c.radius + CFG.playerRadius;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            this.mesh.position.x = c.mesh.position.x + (dx / d) * rr;
            this.mesh.position.z = c.mesh.position.z + (dz / d) * rr;
          }
        }
      }
      this.updateCamera(dt);
    },

    updateCamera(dt) {
      const p = this.pos();
      const inCar = this.mode === 'car';
      const ty = inCar ? 1.3 : 1.6;
      const dist = inCar ? 10.5 : 6.8;
      const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const cx = p.x - f.x * dist * cp, cz = p.z - f.z * dist * cp;
      const cy = ty + dist * sp + 0.7;
      const cam = g.camera;
      if (this.camSnap) {
        cam.position.set(cx, Math.max(0.7, cy), cz);
        this.camSnap = false;
      } else {
        const a = 1 - Math.exp(-dt * 11);
        cam.position.x += (cx - cam.position.x) * a;
        cam.position.y += (Math.max(0.7, cy) - cam.position.y) * a;
        cam.position.z += (cz - cam.position.z) * a;
      }
      cam.lookAt(
        cam.position.x + f.x * cp * 10,
        cam.position.y - sp * 10 + 0.3,
        cam.position.z + f.z * cp * 10);
      g.city.followSun(p.x, p.z);
    },
  };
  return P;
}
