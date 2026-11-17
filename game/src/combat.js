// TIDEWATER — combat: melee, pistol, NPC health, rival crew, WASTED flow.

import { createPersonMesh } from './pedestrians.js';

export class CombatSystem {
  constructor(scene, audio) {
    this.scene = scene; this.audio = audio;
    this.ammo = 48; this.reserveNote = 0; this.gunOut = false;
    this.enemies = []; this.muzzle = 0; this.onCrime = null; this.onKill = null;
    this.raycaster = new THREE.Raycaster();
  }
  spawnEnemy(x, z) {
    const e = { x, z, health: 60, dead: false, shootT: Math.random() * 1.5, mesh: createPersonMesh(0x8d0801, 0x181a1d), isEnemy: true };
    e.mesh.position.set(x, 0, z); this.scene.add(e.mesh);
    this.enemies.push(e); return e;
  }
  clearEnemies() { for (const e of this.enemies) this.scene.remove(e.mesh); this.enemies = []; }
  aliveEnemies() { return this.enemies.filter(e => !e.dead).length; }

  melee(player, peds) {
    this.audio.punch();
    const pp = player.pos; let hit = false;
    const targets = [...peds, ...this.enemies];
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.x - pp.x, dz = t.z - pp.z;
      if (dx * dx + dz * dz < 4.4) {
        t.health -= 34; hit = true;
        t.x += dx * 0.4; t.z += dz * 0.4;
        if (t.health <= 0) { t.dead = true; if (this.onKill) this.onKill(t); }
        if (t.state !== undefined) { t.state = 'flee'; t.fleeT = 2; }
      }
    }
    if (hit && this.onCrime) this.onCrime('assault');
    return hit;
  }

  shoot(player, camera, peds, cars) {
    if (this.ammo <= 0) return false;
    this.ammo--; this.audio.gunshot(); this.muzzle = 0.06;
    if (this.onCrime) this.onCrime('shot');
    // hitscan from camera centre with spread toward facing
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    let best = null, bestD = 60;
    const consider = (obj, x, y, z, r) => {
      const to = new THREE.Vector3(x - origin.x, y - origin.y, z - origin.z);
      const d = to.length(); if (d > 60 || d < 1) return;
      to.normalize();
      if (to.dot(dir) > 0.982 && d < bestD) { bestD = d; best = obj; }
      void r;
    };
    for (const t of [...peds, ...this.enemies]) { if (!t.dead) consider(t, t.x, 1.2, t.z); }
    if (best) {
      best.health -= 55;
      if (best.health <= 0) { best.dead = true; if (this.onKill) this.onKill(best); }
      else if (best.state !== undefined) { best.state = 'flee'; best.fleeT = 2; }
      return true;
    }
    // car hits spark damage
    for (const c of cars) { consider(c, c.x, 0.8, c.z); if (best === c) { c.health -= 20; return true; } }
    return false;
  }
  reload() { this.ammo = 48; }

  damagePlayer(player, amount) {
    player.health -= amount;
    return player.health <= 0;
  }

  update(dt, player) {
    if (this.muzzle > 0) this.muzzle -= dt;
    const pp = player.pos;
    for (const e of this.enemies) {
      if (e.dead) { e.mesh.rotation.x = Math.PI / 2; e.mesh.position.y = 0.2; continue; }
      const dx = pp.x - e.x, dz = pp.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.mesh.position.set(e.x, 0, e.z); e.mesh.rotation.y = Math.atan2(dx, dz);
      if (dist > 14) { e.x += (dx / dist) * 3.2 * dt; e.z += (dz / dist) * 3.2 * dt; }
      e.shootT -= dt;
      if (e.shootT <= 0 && dist < 30) {
        e.shootT = 1.1 + Math.random() * 0.9;
        this.audio.gunshot();
        if (Math.random() < 0.45) this.damagePlayer(player, 7);
      }
    }
  }
}
