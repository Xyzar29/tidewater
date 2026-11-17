// combat.js — fists, the pistol, and the people shooting back.
//
// Q draws or holsters the pistol. Clicking fires it: a hitscan ray from the
// camera through the crosshair, with a tracer and a muzzle flash so the
// shot reads on screen. F (or clicking unarmed) throws a punch. Rival
// gunmen — spawned by missions — keep their distance, strafe, and fire
// back in tracers of their own. Everything that bleeds goes through
// damagePlayer / the enemy hp pool so missions can count the bodies.

import { PISTOL_MAG, PISTOL_RESERVE_START, CRIMES } from './config.js';
import { makePerson, animatePerson, scarePeds } from './pedestrians.js';
import { addHeat } from './police.js';

const PISTOL_DMG = 40;
const ENEMY_HP = 80;

export function initCombat(G) {
  G.combat = {
    drawn: false, mag: PISTOL_MAG, reserve: PISTOL_RESERVE_START,
    reloadingUntil: 0, lastShotAt: -9, meleeAt: -9,
  };
  G.enemies = [];
  G.tracers = []; // {line, until}

  // The muzzle flash: a little additive star that blinks at the gun.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffcf6e, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), flashMat);
  flash.visible = false;
  G.scene.add(flash);
  G.muzzle = { mesh: flash, mat: flashMat, until: 0, at: new THREE.Vector3() };

  // The pistol itself: a small dark shape in Mari's right hand, visible
  // only while drawn, so screenshots and players can see she is armed.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.16, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x17181c })
  );
  gun.position.set(0.31, 1.22, 0.3);
  gun.visible = false;
  G.player.mesh.add(gun);
  G.gunMesh = gun;
}

export function spawnEnemy(G, x, z) {
  const mesh = makePerson(0x30303a, 0x1e1e26, 0x8a5a3b, 0x111111);
  mesh.position.set(x, 0.1, z);
  G.scene.add(mesh);
  const e = {
    mesh, x, z, heading: G.rng.range(0, 6.28), hp: ENEMY_HP,
    dead: false, shootAt: G.time + G.rng.range(1.2, 2.6),
    strafeDir: G.rng.sign(), phase: G.rng.range(0, 6), removeAt: 0,
  };
  G.enemies.push(e);
  return e;
}

export function clearEnemies(G) {
  for (const e of G.enemies) G.scene.remove(e.mesh);
  G.enemies = [];
}

function gunPos(G, out) {
  const p = G.player;
  out.set(p.x + Math.sin(p.heading) * 0.45, 1.38, p.z + Math.cos(p.heading) * 0.45);
  return out;
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
function addTracer(G, from, to, colour) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: colour, transparent: true, opacity: 0.9,
  }));
  G.scene.add(line);
  G.tracers.push({ line, until: G.time + 0.09 });
}

function showMuzzle(G, at) {
  G.muzzle.at.copy(at);
  G.muzzle.mesh.position.copy(at);
  G.muzzle.mesh.visible = true;
  G.muzzle.mat.opacity = 0.95;
  G.muzzle.until = G.time + 0.055;
}

export function damagePlayer(G, amt) {
  const p = G.player;
  if (G.state !== 'playing') return;
  if (p.inCar) amt *= 0.55;
  p.hp -= amt;
  p.flash = 0.4;
  if (p.hp <= 0) {
    p.hp = 0;
    if (G.onWasted) G.onWasted();
  }
}

// One enemy takes a shot at the player. Also used by shots.js to stage a
// visible tracer in the mission screenshot.
export function enemyShoot(G, e) {
  const p = G.player;
  _from.set(e.x + Math.sin(e.heading) * 0.4, 1.35, e.z + Math.cos(e.heading) * 0.4);
  const spread = 0.9;
  _to.set(
    p.x + G.rng.range(-spread, spread),
    1.2 + G.rng.range(-0.3, 0.3),
    p.z + G.rng.range(-spread, spread)
  );
  addTracer(G, _from, _to, 0xff9d5c);
  showMuzzle(G, _from);
  if (G.audio) G.audio.shot(true);
  const dist = Math.hypot(p.x - e.x, p.z - e.z);
  const hitChance = Math.max(0.12, 0.62 - dist * 0.012);
  if (G.rng.chance(hitChance)) damagePlayer(G, G.rng.range(5, 10));
}

function playerShoot(G) {
  const c = G.combat;
  const p = G.player;
  if (c.mag <= 0) {
    if (G.audio) G.audio.click();
    c.lastShotAt = G.time;
    return;
  }
  c.mag--;
  c.lastShotAt = G.time;
  if (G.audio) G.audio.shot(false);
  scarePeds(G, p.x, p.z, 26);
  addHeat(G, CRIMES.gunshot);

  // Ray from the camera, through the crosshair.
  const cam = G.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const origin = cam.position.clone();
  gunPos(G, _from);
  showMuzzle(G, _from);

  let bestT = 70, bestEnemy = null, bestPed = null;
  const test = (x, y, z) => {
    // Distance from the point to the ray; the ray parameter of the closest point.
    const ox = x - origin.x, oy = y - origin.y, oz = z - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 1 || t > 70) return -1;
    const px = origin.x + dir.x * t - x, py = origin.y + dir.y * t - y, pz = origin.z + dir.z * t - z;
    const d2 = px * px + py * py + pz * pz;
    return d2 < 1.1 ? t : -1;
  };
  for (const e of G.enemies) {
    if (e.dead) continue;
    const t = test(e.x, 1.15, e.z);
    if (t > 0 && t < bestT) { bestT = t; bestEnemy = e; bestPed = null; }
  }
  if (!bestEnemy) {
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const t = test(ped.x, 1.1, ped.z);
      if (t > 0 && t < bestT) { bestT = t; bestPed = ped; bestEnemy = null; }
    }
  }
  _to.copy(origin).addScaledVector(dir, bestT);
  addTracer(G, _from, _to, 0xffe9a8);

  if (bestEnemy) {
    bestEnemy.hp -= PISTOL_DMG;
    addHeat(G, CRIMES.shotHit);
    if (bestEnemy.hp <= 0 && !bestEnemy.dead) {
      bestEnemy.dead = true;
      bestEnemy.removeAt = G.time + 7;
      bestEnemy.mesh.rotation.x = -Math.PI / 2;
      bestEnemy.mesh.position.y = 0.25;
      if (G.onEnemyDown) G.onEnemyDown(bestEnemy);
    }
  } else if (bestPed) {
    bestPed.dead = true;
    bestPed.mesh.rotation.x = -Math.PI / 2;
    bestPed.mesh.position.y = 0.25;
    addHeat(G, CRIMES.shotHit + 20);
    if (G.onPedHit) G.onPedHit(bestPed, null);
  }
}

function playerMelee(G) {
  const c = G.combat;
  c.meleeAt = G.time;
  if (G.audio) G.audio.punch();
  const p = G.player;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  let hit = false;
  const inArc = (x, z) => {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    return d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.4;
  };
  for (const e of G.enemies) {
    if (!e.dead && inArc(e.x, e.z)) {
      e.hp -= 26; hit = true;
      if (e.hp <= 0) {
        e.dead = true; e.removeAt = G.time + 7;
        e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.25;
        if (G.onEnemyDown) G.onEnemyDown(e);
      }
    }
  }
  if (!hit) {
    for (const ped of G.peds) {
      if (!ped.dead && inArc(ped.x, ped.z)) {
        ped.mode = 'flee'; ped.fleeFrom = { x: p.x, z: p.z }; ped.fleeUntil = G.time + 3;
        hit = true;
      }
    }
  }
  if (hit) addHeat(G, CRIMES.melee);
}

export function updateCombat(G, dt) {
  const c = G.combat;
  const p = G.player;

  // Draw / holster.
  if (G.pressed['KeyQ'] && !p.inCar) {
    c.drawn = !c.drawn;
    if (G.audio) G.audio.click();
  }
  if (p.inCar) c.drawn = false;
  if (G.gunMesh) G.gunMesh.visible = c.drawn && !p.inCar;

  // Reload completion.
  if (c.reloadingUntil && G.time >= c.reloadingUntil) {
    const take = Math.min(PISTOL_MAG - c.mag, c.reserve);
    c.mag += take; c.reserve -= take;
    c.reloadingUntil = 0;
  }
  if (G.pressed['KeyR'] && c.drawn && !c.reloadingUntil && c.mag < PISTOL_MAG && c.reserve > 0) {
    c.reloadingUntil = G.time + 1.15;
    if (G.audio) G.audio.click();
  }

  // Fire / punch. G.shotPressed is a one-frame edge set by main.js on click.
  if (G.shotPressed && !p.inCar && G.time - c.lastShotAt > 0.16) {
    if (c.drawn) { if (!c.reloadingUntil) playerShoot(G); }
    else if (G.time - c.meleeAt > 0.3) playerMelee(G);
  }
  if (G.pressed['KeyF'] && !p.inCar && G.time - c.meleeAt > 0.3) playerMelee(G);

  // Enemies: keep a firing distance, strafe, shoot back.
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) {
      if (G.time > e.removeAt) { G.scene.remove(e.mesh); G.enemies.splice(i, 1); }
      continue;
    }
    const dx = p.x - e.x, dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, dz);
    let mx = 0, mz = 0;
    if (dist > 17) { mx = dx / dist; mz = dz / dist; }
    else if (dist < 8) { mx = -dx / dist; mz = -dz / dist; }
    else {
      mx = (dz / dist) * e.strafeDir; mz = (-dx / dist) * e.strafeDir;
      if (G.rng.chance(0.004)) e.strafeDir *= -1;
    }
    const spd = 2.6;
    e.x += mx * spd * dt;
    e.z += mz * spd * dt;
    e.phase += dt * spd * 3.2;
    e.mesh.position.x = e.x;
    e.mesh.position.z = e.z;
    e.mesh.rotation.y = e.heading;
    animatePerson(e.mesh, e.phase, 0.9);
    if (dist < 36 && G.time >= e.shootAt && G.state === 'playing') {
      e.shootAt = G.time + G.rng.range(1.5, 2.7);
      enemyShoot(G, e);
    }
  }

  // Tracers fade; muzzle flash blinks out.
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    if (G.time > G.tracers[i].until) {
      G.scene.remove(G.tracers[i].line);
      G.tracers[i].line.geometry.dispose();
      G.tracers.splice(i, 1);
    }
  }
  if (G.muzzle.mesh.visible && G.time > G.muzzle.until) G.muzzle.mesh.visible = false;
}
