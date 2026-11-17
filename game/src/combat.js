// combat.js — gunplay and fists. Shooting is hitscan along the camera ray
// (level aim, exactly like the mouse look), drawn with a tracer line and a
// muzzle flash. The rival crew in the warehouse fight strafes, keeps its
// distance and returns fire with visible tracers of its own.

import { PISTOL_DAMAGE, ENEMY_HP, ENEMY_DAMAGE, MELEE_DAMAGE, MELEE_RANGE } from './config.js';

function makeGunman(rng) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.8, 7),
    new THREE.MeshLambertMaterial({ color: rng.pick([0x2b3440, 0x40342b, 0x342b40]) }),
  );
  body.position.y = 0.86;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 8, 7),
    new THREE.MeshLambertMaterial({ color: rng.pick([0xf2c49b, 0xc68863, 0x8a5a3b]) }),
  );
  head.position.y = 1.5;
  g.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.44),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.24, 1.12, 0.3);
  g.add(gun);
  return g;
}

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.4, 'rgba(255,180,60,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Combat {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.enemies = [];
    this.tracers = [];   // { line, ttl }
    this.onEnemyDown = null;  // set by missions
    this.onPlayerHit = null;  // set by main (HUD flash)
    this.flashTex = flashTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.flash.scale.set(0.6, 0.6, 1);
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.flashT = 0;
  }

  spawnCrew(x, z, count) {
    this.clearCrew();
    const spots = [
      [0, 0], [7, -4], [-6, -5], [3, -10], [-3, 6], [9, 4],
    ];
    for (let i = 0; i < count; i++) {
      const [ox, oz] = spots[i % spots.length];
      const mesh = makeGunman(this.rng);
      mesh.position.set(x + ox, 0, z + oz);
      this.scene.add(mesh);
      this.enemies.push({
        mesh, hp: ENEMY_HP, alive: true,
        shootCd: this.rng.range(0.7, 1.6),
        strafeDir: this.rng.chance(0.5) ? 1 : -1,
        strafeT: this.rng.range(1, 2.4),
      });
    }
    return this.enemies;
  }

  clearCrew() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }

  // Is the straight line a→b (at chest height) free of buildings?
  lineOfSight(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of this.colliders) {
        if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return false;
      }
    }
    return true;
  }

  drawTracer(from, to, color = 0xffd76a) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(line);
    this.tracers.push({ line, ttl: 0.07 });
  }

  showFlash(pos, ttl = 0.055) {
    this.flash.position.copy(pos);
    this.flash.visible = true;
    this.flashT = ttl;
  }

  // Distance from ray origin along dir to a sphere; Infinity when it misses.
  raySphere(origin, dir, center, r) {
    const ox = center.x - origin.x, oy = center.y - origin.y, oz = center.z - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0) return Infinity;
    const d2 = ox * ox + oy * oy + oz * oz - t * t;
    if (d2 > r * r) return Infinity;
    return t - Math.sqrt(r * r - d2);
  }

  // The player's shot: from the camera, through the crosshair.
  playerShoot(camera, playerPos) {
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // The gun sits at Mari's shoulder, slightly below the camera.
    const gunPos = new THREE.Vector3(playerPos.x, 1.35, playerPos.z)
      .addScaledVector(dir, 0.5);
    let bestT = 70;
    let hitEnemy = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const c = e.mesh.position;
      const t = this.raySphere(origin, dir, { x: c.x, y: 1.05, z: c.z }, 0.62);
      if (t < bestT) { bestT = t; hitEnemy = e; }
    }
    const end = origin.clone().addScaledVector(dir, bestT);
    this.drawTracer(gunPos, end);
    this.showFlash(gunPos);
    if (hitEnemy) {
      hitEnemy.hp -= PISTOL_DAMAGE;
      if (hitEnemy.hp <= 0 && hitEnemy.alive) {
        hitEnemy.alive = false;
        hitEnemy.mesh.rotation.x = Math.PI / 2;
        hitEnemy.mesh.position.y = 0.25;
        if (this.onEnemyDown) this.onEnemyDown(hitEnemy);
      }
    }
    return hitEnemy;
  }

  // Fists: nearest living enemy within reach and roughly in front.
  melee(playerPos, heading) {
    let hit = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const c = e.mesh.position;
      const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > MELEE_RANGE) continue;
      const ang = Math.atan2(dx, dz);
      let diff = Math.abs(ang - heading);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 1.1) { hit = e; break; }
    }
    if (hit) {
      hit.hp -= MELEE_DAMAGE;
      // A shove with the punch.
      const c = hit.mesh.position;
      const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      c.x += (dx / d) * 0.9;
      c.z += (dz / d) * 0.9;
      if (hit.hp <= 0 && hit.alive) {
        hit.alive = false;
        hit.mesh.rotation.x = Math.PI / 2;
        hit.mesh.position.y = 0.25;
        if (this.onEnemyDown) this.onEnemyDown(hit);
      }
    }
    return hit;
  }

  enemyShoot(enemy, player, audio) {
    const from = enemy.mesh.position.clone();
    from.y = 1.25;
    const to = player.pos.clone();
    to.y = 1.1;
    const dist = from.distanceTo(to);
    // Spread grows with range; the tracer shows where the bullet went.
    const spread = 0.6 + dist * 0.02;
    to.x += this.rng.range(-spread, spread) * 0.4;
    to.z += this.rng.range(-spread, spread) * 0.4;
    this.drawTracer(from, to, 0xff9d5c);
    this.showFlash(from.clone(), 0.045);
    if (audio) audio.gunshot();
    const hitChance = Math.max(0.14, 0.52 - dist * 0.008);
    if (this.rng.chance(hitChance)) {
      player.hp -= ENEMY_DAMAGE;
      if (this.onPlayerHit) this.onPlayerHit();
    }
  }

  update(dt, player, audio) {
    // Tracers and flashes fade.
    for (const t of [...this.tracers]) {
      t.ttl -= dt;
      if (t.ttl <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers = this.tracers.filter((x) => x !== t);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }

    const ppos = player.pos;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const pos = e.mesh.position;
      const dx = ppos.x - pos.x, dz = ppos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      if (dist > 46 || dist < 0.01) continue;
      if (!this.lineOfSight(pos, ppos)) continue;

      // Strafe sideways, holding a fighting distance of roughly 9–16 m.
      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeDir *= -1;
        e.strafeT = this.rng.range(1, 2.4);
      }
      const ux = dx / dist, uz = dz / dist;
      let mx = -uz * e.strafeDir, mz = ux * e.strafeDir;
      if (dist > 17) { mx += ux * 0.8; mz += uz * 0.8; }
      if (dist < 7) { mx -= ux * 0.7; mz -= uz * 0.7; }
      pos.x += mx * 1.6 * dt;
      pos.z += mz * 1.6 * dt;

      e.shootCd -= dt;
      if (e.shootCd <= 0) {
        e.shootCd = this.rng.range(1.05, 1.8);
        this.enemyShoot(e, player, audio);
      }
    }
  }
}
