// Combat: fists on F / click, and a pistol on Q — draw it, click to fire
// a hitscan shot with a tracer and muzzle flash, R to reload. Rival-crew
// gunmen (spawned by the warehouse mission) keep their distance, strafe
// and shoot back. Gunfire and violence feed the wanted system, throttled
// so a long firefight tops out instead of pegging the meter instantly.

import { buildFigure, animateFigure, hurtPed, scarePeds } from './pedestrians.js';
import { hurtPlayer } from './player.js';
import { collideCircle } from './city.js';
import { clamp, dist2 } from './random.js';

export function createCombat(G) {
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1c1e22 })
  );
  gun.position.set(0.37, 0.92, 0.28);
  gun.visible = false;
  G.player.mesh.add(gun);

  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffcf5e, transparent: true, opacity: 0.95 })
  );
  flash.visible = false;
  G.scene.add(flash);

  const combat = {
    gun, flash, flashT: 0,
    drawn: false, ammo: 12, reserve: 72, magSize: 12,
    reloadT: 0, cooldown: 0, meleeT: 0, crimeT: 0,
    gunmen: [], tracers: [],

    toggleDraw() {
      this.drawn = !this.drawn;
      gun.visible = this.drawn;
      G.hud.hint(this.drawn ? 'Click to shoot · R reload · Q holster' : '');
    },
    addAmmo(n) { this.reserve += n; },
  };
  G.combat = combat;
  return combat;
}

function reportViolence(G, kind) {
  if (G.time - G.combat.crimeT > 2.5) {
    G.combat.crimeT = G.time;
    G.police.reportCrime(kind, G.player.x, G.player.z);
  }
}

function addTracer(G, from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.combat.tracers.push({ line, life: 0.07 });
}

export function tryMelee(G) {
  const c = G.combat, p = G.player;
  if (c.meleeT > 0 || p.driving) return;
  c.meleeT = 0.38;
  G.audio.punch();
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  let hit = false;
  const inFront = (x, z) => {
    const dx = x - p.x, dz = z - p.z;
    return dx * fx + dz * fz > 0.2 && dx * dx + dz * dz < 5.3;
  };
  for (const ped of G.peds) {
    if (!ped.dead && inFront(ped.x, ped.z)) { hurtPed(G, ped, 34); hit = true; }
  }
  for (const gm of c.gunmen) {
    if (!gm.dead && inFront(gm.x, gm.z)) { hurtGunman(G, gm, 34); hit = true; }
  }
  if (hit) {
    reportViolence(G, 'melee');
    scarePeds(G, p.x, p.z, 7);
  }
}

export function tryShoot(G) {
  const c = G.combat, p = G.player;
  if (!c.drawn || p.driving || c.cooldown > 0 || c.reloadT > 0) return;
  if (c.ammo <= 0) {
    G.hud.notify('Out of ammo — R to reload');
    c.cooldown = 0.3;
    return;
  }
  c.ammo--;
  c.cooldown = 0.24;
  G.audio.shot();
  scarePeds(G, p.x, p.z, 26);
  reportViolence(G, 'gunshot');

  // Aim: the camera's forward ray; the closest body it passes near wins.
  const cam = G.camera;
  const origin = cam.position.clone();
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const hand = new THREE.Vector3(p.x, G.city.groundY(p.x, p.z) + 1.15, p.z);
  let bestT = 70, bestPoint = null, bestTarget = null;
  const consider = (x, y, z, radius, target) => {
    const vx = x - origin.x, vy = y - origin.y, vz = z - origin.z;
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t < 1 || t > 70) return;
    const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
    const perp = Math.hypot(x - px, y - py, z - pz);
    if (perp < radius && t < bestT) {
      bestT = t; bestTarget = target;
      bestPoint = { x, y, z };
    }
  };
  for (const gm of c.gunmen) {
    if (!gm.dead) consider(gm.x, G.city.groundY(gm.x, gm.z) + 1.15, gm.z, 0.95, { kind: 'gunman', ref: gm });
  }
  for (const ped of G.peds) {
    if (!ped.dead) consider(ped.x, G.city.groundY(ped.x, ped.z) + 1.15, ped.z, 0.85, { kind: 'ped', ref: ped });
  }
  for (const car of G.cars) {
    if (!car.dead) consider(car.x, 0.9, car.z, 2.3, { kind: 'car', ref: car });
  }
  const end = bestPoint || {
    x: origin.x + dir.x * 60, y: Math.max(0.3, origin.y + dir.y * 60), z: origin.z + dir.z * 60,
  };
  addTracer(G, hand, end, 0xffe9a3);
  c.flash.position.set(hand.x + Math.sin(p.heading) * 0.5, hand.y + 0.05, hand.z + Math.cos(p.heading) * 0.5);
  c.flash.visible = true;
  c.flashT = 0.045;
  if (bestTarget) {
    if (bestTarget.kind === 'gunman') hurtGunman(G, bestTarget.ref, 26);
    else if (bestTarget.kind === 'ped') { hurtPed(G, bestTarget.ref, 26); reportViolence(G, 'gunshot'); }
  }
  if (c.ammo === 0 && c.reserve > 0) startReload(G);
}

export function startReload(G) {
  const c = G.combat;
  if (c.reloadT > 0 || c.ammo >= c.magSize || c.reserve <= 0) return;
  c.reloadT = 1.1;
  G.hud.notify('Reloading…');
}

export function spawnGunman(G, x, z) {
  const mesh = buildFigure(0x8e2f32, 0x1c1c22, 0xc98d5e);
  mesh.position.set(x, G.city.groundY(x, z), z);
  G.scene.add(mesh);
  const gm = {
    mesh, x, z, heading: 0, health: 60, dead: false,
    shootT: G.rng.range(0.8, 2), strafeDir: G.rng.sign(), phase: G.rng.range(0, 6),
    fallT: 0,
  };
  G.combat.gunmen.push(gm);
  return gm;
}

export function hurtGunman(G, gm, dmg) {
  if (gm.dead) return;
  gm.health -= dmg;
  if (gm.health <= 0) {
    gm.dead = true;
    gm.fallT = 8;
    gm.mesh.rotation.x = -Math.PI / 2;
    gm.mesh.position.y = G.city.groundY(gm.x, gm.z) + 0.25;
    if (G.missions) G.missions.onGunmanDown(gm);
  }
}

export function clearGunmen(G) {
  for (const gm of G.combat.gunmen) G.scene.remove(gm.mesh);
  G.combat.gunmen.length = 0;
}

export function updateCombat(G, dt) {
  const c = G.combat, p = G.player;
  c.cooldown = Math.max(0, c.cooldown - dt);
  c.meleeT = Math.max(0, c.meleeT - dt);
  if (c.flashT > 0) { c.flashT -= dt; if (c.flashT <= 0) c.flash.visible = false; }
  if (c.reloadT > 0) {
    c.reloadT -= dt;
    if (c.reloadT <= 0) {
      const take = Math.min(c.magSize - c.ammo, c.reserve);
      c.ammo += take; c.reserve -= take;
    }
  }
  // Swing Mari's right arm while a punch is in flight.
  const arm = p.mesh.userData.parts.armR;
  if (arm) arm.rotation.x = c.meleeT > 0.18 ? -1.9 : arm.rotation.x;
  if (c.drawn && !p.driving) {
    const parts = p.mesh.userData.parts;
    if (parts) parts.armR.rotation.x = -1.35; // pistol arm stays raised
  }

  for (let i = c.tracers.length - 1; i >= 0; i--) {
    const tr = c.tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.9;
    if (tr.life <= 0) {
      G.scene.remove(tr.line);
      tr.line.geometry.dispose();
      c.tracers.splice(i, 1);
    }
  }

  // Rival gunmen: hold a 9–17 m band, strafe, fire on a ragged rhythm.
  for (const gm of c.gunmen) {
    if (gm.dead) {
      gm.fallT -= dt;
      if (gm.fallT <= 0) gm.mesh.visible = false;
      continue;
    }
    const dx = p.x - gm.x, dz = p.z - gm.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    let mx = 0, mz = 0, speed = 0;
    if (d > 17) { mx = ux; mz = uz; speed = 3.6; }
    else if (d < 8) { mx = -ux; mz = -uz; speed = 2.6; }
    else {
      mx = -uz * gm.strafeDir; mz = ux * gm.strafeDir; speed = 1.6;
      if (G.rng.chance(dt * 0.25)) gm.strafeDir *= -1;
    }
    gm.x += mx * speed * dt;
    gm.z += mz * speed * dt;
    const [nx, nz] = collideCircle(G.city, gm.x, gm.z, 0.5);
    gm.x = clamp(nx, -266, 266); gm.z = clamp(nz, -266, 258);
    gm.heading = Math.atan2(dx, dz);
    gm.phase += dt * speed * 3.2;
    gm.mesh.position.set(gm.x, G.city.groundY(gm.x, gm.z), gm.z);
    gm.mesh.rotation.y = gm.heading;
    animateFigure(gm.mesh, gm.phase, 0);

    gm.shootT -= dt;
    if (gm.shootT <= 0 && d < 30 && G.state === 'playing') {
      gm.shootT = G.rng.range(1.3, 2.3);
      G.audio.shot();
      const from = { x: gm.x, y: G.city.groundY(gm.x, gm.z) + 1.3, z: gm.z };
      const to = { x: p.x, y: G.city.groundY(p.x, p.z) + 1.1, z: p.z };
      addTracer(G, from, to, 0xff9a7a);
      const hitChance = clamp(0.62 - d * 0.016, 0.12, 0.55);
      if (!p.driving && G.rng.chance(hitChance)) hurtPlayer(G, G.rng.range(5, 10));
      else if (p.driving && G.rng.chance(hitChance * 0.6)) hurtPlayer(G, G.rng.range(3, 7));
    }
  }
}
