// combat.js — fists and a pistol for Mari, and the rival-crew gunmen who
// shoot back: hitscan along the camera ray, tracers, muzzle flash, strafe-
// and-cover AI with return fire.

import { buildHumanoid, poseHumanoid } from './vehicles.js';

export function createCombat(G) {
  const rng = G.rng.fork('combat');
  const enemies = [];
  const tracers = [];

  const weapon = {
    drawn: false,
    ammo: 12,
    magSize: 12,
    reserve: 120,
    cooldown: 0,
    reloadTime: 0,
  };

  // reusable muzzle flash blob
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffc46b })
  );
  flash.visible = false;
  G.scene.add(flash);
  let flashTtl = 0;

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat);
    G.scene.add(line);
    tracers.push({ line, ttl: 0.07 });
  }

  function gunTip(mesh) {
    const gun = mesh.userData.parts.gun;
    const v = new THREE.Vector3();
    gun.getWorldPosition(v);
    v.y += 0.05;
    return v;
  }

  function firePistol() {
    if (weapon.reloadTime > 0 || weapon.cooldown > 0) return;
    if (weapon.ammo <= 0) {
      weapon.cooldown = 0.3;
      G.audio.emptyClick();
      return;
    }
    weapon.ammo--;
    weapon.cooldown = 0.24;
    const p = G.player;
    G.audio.shot();
    G.police.reportCrime('gunshot', p.x, p.z, 40);
    G.pedestrians.scare(p.x, p.z, 18);
    // ray from the camera through the crosshair
    const origin = G.camera.position.clone();
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const from = gunTip(p.mesh);
    flash.position.copy(from);
    flash.visible = true;
    flashTtl = 0.05;
    let best = null, bestDist = 70;
    function testTarget(obj, cx, cy, cz, radius) {
      const to = new THREE.Vector3(cx - origin.x, cy - origin.y, cz - origin.z);
      const along = to.dot(dir);
      if (along < 0.5 || along > bestDist) return;
      const closest = origin.clone().add(dir.clone().multiplyScalar(along));
      const miss = Math.hypot(cx - closest.x, cy - closest.y, cz - closest.z);
      if (miss < radius) { best = obj; bestDist = along; }
    }
    for (const e of enemies) {
      if (e.dead) continue;
      testTarget(e, e.x, 1.15, e.z, 0.95);
    }
    let hitPed = null;
    if (!best) {
      for (const ped of G.peds) {
        if (ped.dead) continue;
        const before = bestDist;
        testTarget(ped, ped.x, 1.1, ped.z, 0.8);
        if (bestDist < before) { hitPed = ped; best = null; }
      }
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(bestDist));
    tracer(from, end);
    if (best) damageEnemy(best, 34);
    else if (hitPed) {
      hitPed.dead = true;
      hitPed.deadTimer = 25;
      hitPed.mesh.rotation.x = -Math.PI / 2;
      hitPed.mesh.position.y = 0.25;
      G.police.reportCrime('pedHit', hitPed.x, hitPed.z, 130);
    }
    if (weapon.ammo === 0 && weapon.reserve > 0) startReload();
  }

  function startReload() {
    if (weapon.reloadTime > 0 || weapon.ammo === weapon.magSize || weapon.reserve <= 0) return;
    weapon.reloadTime = 1.1;
    G.audio.reload();
  }

  function melee() {
    const p = G.player;
    if (p.car) return;
    G.audio.punch();
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz < 5.3 && dx * fx + dz * fz > 0) {
        damageEnemy(e, 45);
        return;
      }
    }
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const dx = ped.x - p.x, dz = ped.z - p.z;
      if (dx * dx + dz * dz < 5.3 && dx * fx + dz * fz > 0) {
        G.police.reportCrime('melee', ped.x, ped.z, 45);
        G.pedestrians.scare(ped.x, ped.z, 10);
        return;
      }
    }
  }

  function damageEnemy(e, n) {
    e.hp -= n;
    e.aggro = true;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      e.mesh.rotation.x = -Math.PI / 2;
      e.mesh.position.y = 0.25;
      e.mesh.userData.parts.gun.visible = false;
      if (G.missions) G.missions.onEnemyKilled(e);
    }
  }

  function spawnEnemy(x, z, opts = {}) {
    const mesh = buildHumanoid({
      shirt: opts.shirt || 0x35383f, pants: 0x22242a,
      skin: 0xc98d54, hair: 0x14100c,
    });
    mesh.userData.parts.gun.visible = true;
    G.scene.add(mesh);
    const e = {
      mesh, x, z, heading: 0, hp: opts.hp || 100,
      dead: false, aggro: !!opts.aggro,
      shootCd: rng.range(0.8, 2),
      strafeDir: rng.chance(0.5) ? 1 : -1,
      strafeTimer: rng.range(1, 2.5),
      walkPhase: rng.range(0, 6),
      tag: opts.tag || null,
    };
    mesh.position.set(x, 0, z);
    enemies.push(e);
    return e;
  }

  function clearEnemies() {
    for (const e of enemies) G.scene.remove(e.mesh);
    enemies.length = 0;
  }

  function updateEnemy(e, dt) {
    if (e.dead) return;
    const p = G.player;
    const dx = p.x - e.x, dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, dz);
    if (dist < 20) e.aggro = true;
    let speed = 0;
    if (e.aggro && dist < 55) {
      // keep a fighting distance, strafing sideways between shots
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = rng.range(1, 2.4); }
      let mx = 0, mz = 0;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      if (dist > 17) { mx += nx; mz += nz; }
      else if (dist < 9) { mx -= nx; mz -= nz; }
      mx += -nz * e.strafeDir * 0.8;
      mz += nx * e.strafeDir * 0.8;
      const ml = Math.hypot(mx, mz) || 1;
      speed = 2.6;
      e.x += (mx / ml) * speed * dt;
      e.z += (mz / ml) * speed * dt;
      e.walkPhase += dt * speed * 2.4;
      // return fire
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 42 && !p.car) {
        e.shootCd = rng.range(1.3, 2.3);
        G.audio.shot(true);
        const from = gunTip(e.mesh);
        const target = new THREE.Vector3(p.x, 1.25, p.z);
        const hitChance = Math.max(0.12, 0.62 - dist * 0.011);
        if (rng.chance(hitChance)) {
          p.damage(rng.range(5, 9));
          tracer(from, target);
        } else {
          target.x += rng.range(-1.6, 1.6);
          target.z += rng.range(-1.6, 1.6);
          target.y += rng.range(-0.4, 0.7);
          tracer(from, target);
        }
      }
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = e.heading;
    poseHumanoid(e.mesh, e.walkPhase, speed, true);
  }

  function update(dt) {
    weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    if (weapon.reloadTime > 0) {
      weapon.reloadTime -= dt;
      if (weapon.reloadTime <= 0) {
        const take = Math.min(weapon.magSize - weapon.ammo, weapon.reserve);
        weapon.ammo += take;
        weapon.reserve -= take;
      }
    }
    flashTtl -= dt;
    if (flashTtl <= 0) flash.visible = false;
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].ttl -= dt;
      if (tracers[i].ttl <= 0) {
        G.scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    const input = G.input;
    const p = G.player;
    if (G.state.screen === 'playing' && !p.car) {
      if (input.pressed.has('KeyQ')) {
        weapon.drawn = !weapon.drawn;
        p.mesh.userData.parts.gun.visible = weapon.drawn;
        G.audio.draw();
      }
      if (input.pressed.has('KeyR')) startReload();
      if (input.pressed.has('KeyF')) melee();
      if (input.mouseDown && weapon.drawn && (input.locked || G.state.shotMode)) firePistol();
      else if (input.clicked && !weapon.drawn && !input.locked) melee();
    }
    for (const e of enemies) updateEnemy(e, dt);
  }

  return {
    weapon, enemies, update, spawnEnemy, clearEnemies,
    firePistol, melee, startReload,
    aliveCount() { return enemies.filter((e) => !e.dead).length; },
  };
}
