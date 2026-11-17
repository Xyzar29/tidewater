// combat.js — fists and the pistol: draw/holster, hitscan shooting down the
// camera ray with tracers and muzzle flash, magazines and reloads, melee, and
// the rival crew who strafe, return fire and go down in three hits.
import { S } from './config.js';
import { makeFigure } from './player.js';
import { collideCircle } from './city.js';
import { pick } from './random.js';

export const CS = { drawn: false, mag: 12, reserve: 96, reloading: false, reloadDoneAt: 0 };
const MAG = 12;
const SKINS = [0xc98a64, 0x8a5a3b, 0xe8b48c, 0x6e4226];
const HAIRS = [0x111111, 0x2a1a10, 0x4a2f1a];

// t at which the ray (o + dir*t, dir.xz raw) enters a 2D AABB, or Infinity.
function segBox(ox, oz, dx, dz, b) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x1 || ox > b.x2) return Infinity; }
  else {
    let t1 = (b.x1 - ox) / dx, t2 = (b.x2 - ox) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z1 || oz > b.z2) return Infinity; }
  else {
    let t1 = (b.z1 - oz) / dz, t2 = (b.z2 - oz) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin > 0 ? tmin : Infinity;
}

export function createCombat(g) {
  const rivals = [];
  const tracers = [];
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  flash.visible = false;
  g.scene.add(flash);
  const flashLight = new THREE.PointLight(0xffc36b, 0, 18);
  g.scene.add(flashLight);

  function addTracer(from, to, color, persist) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    g.scene.add(line);
    if (!persist) tracers.push({ line, until: S.time + 0.09 });
    return line;
  }
  function gunTip() {
    const p = g.player.pos(), info = g.player.info(), h = info.heading;
    return new THREE.Vector3(p.x + Math.sin(h) * 0.45, 1.25, p.z + Math.cos(h) * 0.45);
  }
  function killRival(r) {
    r.alive = false;
    r.mesh.rotation.x = -Math.PI / 2;
    r.mesh.position.y = 0.35;
  }
  function startReload() {
    if (CS.reloading || CS.reserve <= 0 || CS.mag >= MAG) return;
    CS.reloading = true;
    CS.reloadDoneAt = S.time + 1.35;
    g.audioSfx('click');
  }

  const api = {
    CS, rivals,
    setDrawn(v) {
      CS.drawn = v; S.drawn = v;
      g.player.mesh.userData.gun.visible = v;
    },
    toggleDraw() { api.setDrawn(!CS.drawn); g.audioSfx('click'); },
    startReload,
    tryShoot() {
      if (!CS.drawn || S.inCar) return false;
      if (CS.reloading) return true;
      if (CS.mag <= 0) { g.audioSfx('empty'); startReload(); return true; }
      CS.mag--;
      g.audioSfx('gunshot');
      const cam = g.camera;
      const origin = cam.position.clone();
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      g.lastShot = { x: origin.x, z: origin.z, t: S.time };
      if (S.time - S.lastShotCrime > 1.5) { S.lastShotCrime = S.time; g.reportCrime('shot'); }
      let bestT = 70, hitKind = null, hitRef = null;
      const test = (x, y, z, radius, kind, ref) => {
        const vx = x - origin.x, vy = y - origin.y, vz = z - origin.z;
        const t = vx * dir.x + vy * dir.y + vz * dir.z;
        if (t < 0.5 || t > bestT) return;
        const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
        const d2 = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
        if (d2 < radius * radius) { bestT = t; hitKind = kind; hitRef = ref; }
      };
      for (const r of rivals) if (r.alive) test(r.mesh.position.x, 1.15, r.mesh.position.z, 1.15, 'rival', r);
      for (const p of g.peds.peds) if (p.mode !== 'down') test(p.mesh.position.x, 1.1, p.mesh.position.z, 1.0, 'ped', p);
      for (const b of g.city.colliders) {
        const t = segBox(origin.x, origin.z, dir.x, dir.z, b);
        if (t < bestT) { bestT = t; hitKind = 'wall'; hitRef = null; }
      }
      const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
      const tip = gunTip();
      addTracer(tip, end, 0xffe9a8, false);
      flash.position.copy(tip).add(dir.clone().multiplyScalar(0.35));
      flash.lookAt(end);
      flash.material.opacity = 0.95; flash.visible = true;
      flashLight.position.copy(tip); flashLight.intensity = 2.2;
      if (hitKind === 'rival') {
        hitRef.hp -= 34; hitRef.aggro = true;
        if (hitRef.hp <= 0) killRival(hitRef);
      } else if (hitKind === 'ped') {
        g.peds.downPed(hitRef, true);
      }
      if (CS.mag === 0) startReload();
      return true;
    },
    tryMelee() {
      if (CS.drawn || S.inCar) return false;
      const p = g.player.pos(), info = g.player.info();
      const fx = Math.sin(info.heading), fz = Math.cos(info.heading);
      let acted = false;
      for (const r of rivals) {
        if (!r.alive) continue;
        const dx = r.mesh.position.x - p.x, dz = r.mesh.position.z - p.z;
        if (dx * dx + dz * dz < 5.8 && dx * fx + dz * fz > 0.3) {
          r.hp -= 30; r.aggro = true;
          if (r.hp <= 0) killRival(r);
          acted = true;
        }
      }
      if (!acted) for (const ped of g.peds.peds) {
        if (ped.mode === 'down') continue;
        const dx = ped.mesh.position.x - p.x, dz = ped.mesh.position.z - p.z;
        if (dx * dx + dz * dz < 5.8 && dx * fx + dz * fz > 0.3) { g.peds.downPed(ped, true); acted = true; break; }
      }
      if (acted) { g.audioSfx('punch'); g.reportCrime('punch'); }
      return acted;
    },
    spawnSquad(positions) {
      api.clearSquad();
      for (const [x, z] of positions) {
        const mesh = makeFigure({ shirt: 0x35383e, pants: 0x22242a, skin: pick(g.rng, SKINS), hair: pick(g.rng, HAIRS) });
        mesh.position.set(x, 0.12, z);
        mesh.userData.gun.visible = true;
        g.scene.add(mesh);
        rivals.push({ mesh, hp: 60, alive: true, anchor: { x, z }, phase: g.rng() * 6, shootT: 1.2 + g.rng() * 1.2, aggro: false });
      }
      return rivals;
    },
    clearSquad() {
      for (const r of rivals) g.scene.remove(r.mesh);
      rivals.length = 0;
    },
    aliveCount() { return rivals.reduce((n, r) => n + (r.alive ? 1 : 0), 0); },
    stageTracer() {
      const r = rivals.find(r => r.alive);
      if (!r) return;
      const tip = gunTip();
      addTracer(tip, new THREE.Vector3(r.mesh.position.x, 1.2, r.mesh.position.z), 0xffe9a8, true);
      flash.position.copy(tip);
      flash.material.opacity = 0.9; flash.visible = true;
    },
    update(dt) {
      if (CS.reloading && S.time >= CS.reloadDoneAt) {
        const take = Math.min(MAG - CS.mag, CS.reserve);
        CS.mag += take; CS.reserve -= take; CS.reloading = false;
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        if (S.time > tracers[i].until) {
          g.scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }
      if (flash.visible && !S.shotMode) {
        flash.material.opacity -= dt * 9;
        flashLight.intensity = Math.max(0, flashLight.intensity - dt * 22);
        if (flash.material.opacity <= 0) flash.visible = false;
      }
      const pp = g.player.pos();
      for (const r of rivals) {
        if (!r.alive) continue;
        const m = r.mesh;
        const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
        const dist = Math.hypot(dx, dz);
        const active = r.aggro || (g.missions && g.missions.fightActive());
        m.rotation.y = Math.atan2(dx, dz);
        if (!active || dist > 46 || S.screen !== 'playing') continue;
        r.phase += dt * 1.4;
        let mx = Math.cos(r.phase) * 0.9, mz = Math.sin(r.phase) * 0.9;
        if (dist > 15) { mx += (dx / dist) * 1.6; mz += (dz / dist) * 1.6; }
        m.position.x += mx * dt * 1.3;
        m.position.z += mz * dt * 1.3;
        collideCircle(m.position, 0.5, g.city.colliders);
        r.shootT -= dt;
        if (r.shootT <= 0 && dist < 40) {
          r.shootT = 1.15 + g.rng() * 0.95;
          const from = new THREE.Vector3(m.position.x, 1.25, m.position.z);
          const to = new THREE.Vector3(pp.x + (g.rng() - 0.5) * 1.6, 1.15, pp.z + (g.rng() - 0.5) * 1.6);
          addTracer(from, to, 0xff9a7a, false);
          g.audioSfx('gunshot');
          g.lastShot = { x: m.position.x, z: m.position.z, t: S.time };
          const chance = Math.max(0.14, 0.52 - dist * 0.007);
          if (g.rng() < chance) g.damagePlayer(4 + g.rng() * 5);
        }
      }
    },
  };
  return api;
}
