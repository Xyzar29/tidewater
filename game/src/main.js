// main.js — TIDEWATER's boot and wiring. Builds the renderer, the golden-
// hour sky and every system, then runs a fixed-timestep simulation (60 Hz)
// pumped both by requestAnimationFrame and by a watchdog interval, so the
// game advances at the same rate even when a headless browser throttles
// rAF to a crawl. Owns the screen state machine (title / playing / paused /
// busted / wasted / complete / ending), input, the chase and foot cameras,
// crime detection, cash pickups, and the window.__game debug handle.

import { STEP, START_MONEY, LANDMARKS, districtAt } from './config.js';
import { RNG, seedFromUrl } from './random.js';
import { buildCity } from './city.js';
import { createCar, placeCar } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD, showScreen } from './hud.js';
import { drawMinimap } from './minimap.js';
import { AudioSys } from './audio.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';
import { stageShot } from './shots.js';

// ------------------------------------------------------------------ boot
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2c184, 130, 640);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 30, 80);

// Gradient sky dome, painted on a canvas.
{
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7fb2e8');
  grad.addColorStop(0.55, '#cfe4f7');
  grad.addColorStop(0.8, '#ffe3ae');
  grad.addColorStop(1, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(880, 20, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);
}

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0xffe0b3, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ world
const rng = new RNG(seedFromUrl());
const city = buildCity(scene, rng);
const traffic = new Traffic(scene, rng, city.colliders);
const peds = new Pedestrians(scene, rng, city.colliders);
const player = new Player(scene, city.colliders);
const police = new Police(scene, rng, city.colliders);
const combat = new Combat(scene, rng, city.colliders);
const hud = new HUD();
const audio = new AudioSys();

const G = {
  scene, camera, renderer, rng, city, traffic, peds, player, police, combat, hud, audio,
  time: 0,
  screen: 'title',
  money: START_MONEY,
  weapon: { drawn: false, mag: 12, reserve: 96, reloadT: 0, cooldown: 0 },
  addMoney(n) { G.money += n; },
  saveProgress() {
    saveGame({
      money: G.money,
      mission: missions.nextIndex,
      x: Math.round(player.pos.x * 10) / 10,
      z: Math.round(player.pos.z * 10) / 10,
    });
  },
  // --- staging helpers (used by shots.js and the debug handle) ---
  stageCar(kind, color, x, z, heading, speed) {
    const car = createCar(kind, color);
    placeCar(car, x, z, heading);
    car.speed = speed || 0;
    car.occupied = true;
    scene.add(car.mesh);
    traffic.cars.push(car);
    return car;
  },
  placePolice(x, z, heading) {
    const car = createCar('police', 0xf2f4f6);
    placeCar(car, x, z, heading);
    car.occupied = true;
    car.leaving = false;
    scene.add(car.mesh);
    police.cars.push(car);
    return car;
  },
  teleportPlayer(x, z, heading = 0) {
    if (player.mode === 'car' && player.car) {
      placeCar(player.car, x, z, heading);
    } else {
      player.setPosition(x, z);
    }
    player.heading = heading;
    camYaw = heading;
  },
  // Aim the foot camera directly (the playtest's mouse, effectively).
  debugSetCam(yaw, pitch) {
    camYaw = yaw;
    camPitch = pitch;
  },
};

const missions = new Missions(G, scene);
G.missions = missions;

combat.onPlayerHit = () => hud.flashDamage();
combat.onEnemyDown = () => { /* missions poll the alive count */ };

// Free-roam cash pickups: little gold caches that respawn.
const pickups = [];
{
  const spots = [
    [-84, 84], [112, 56], [-112, -112], [84, -84], [0, 168],
    [168, 112], [-168, -56], [56, -168], [-56, 112], [140, -140],
  ];
  const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0x6b5200 });
  for (const [x, z] of spots) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.9, z);
    scene.add(mesh);
    pickups.push({ mesh, x, z, active: true, respawnT: 0 });
  }
}

// ------------------------------------------------------------------ input
const keys = {};
let camYaw = 0;
let camPitch = 0.32;
let firing = false;
let dragging = false;
let lastMouse = null;

const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyP') {
    if (G.screen === 'playing') pauseGame();
    else if (G.screen === 'paused') resumeGame();
  }
  if (e.code === 'KeyM') {
    audio.setMuted(!audio.muted);
    hud.notify(audio.muted ? 'Sound off' : 'Sound on', 1.4);
  }
  if (G.screen !== 'playing') return;
  if (e.code === 'KeyE') tryEnterOrExit();
  if (e.code === 'KeyQ') togglePistol();
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF') doMelee();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('mousedown', (e) => {
  if (G.screen !== 'playing') return;
  audio.unlock();
  if (document.pointerLockElement === canvas) {
    firing = true;
  } else {
    dragging = true;
    lastMouse = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.requestPointerLock?.();
  }
});
window.addEventListener('mouseup', (e) => {
  if (dragging && lastMouse && lastMouse.moved < 5 && G.screen === 'playing') {
    // A clean click (not a drag): shoot / punch.
    if (G.weapon.drawn) firingPulse();
  }
  dragging = false;
  firing = false;
});
window.addEventListener('mousemove', (e) => {
  if (G.screen !== 'playing') return;
  let dx = 0, dy = 0;
  if (document.pointerLockElement === canvas) {
    dx = e.movementX || 0;
    dy = e.movementY || 0;
  } else if (dragging && lastMouse) {
    dx = e.clientX - lastMouse.x;
    dy = e.clientY - lastMouse.y;
    lastMouse.moved += Math.abs(dx) + Math.abs(dy);
    lastMouse.x = e.clientX;
    lastMouse.y = e.clientY;
  } else {
    return;
  }
  camYaw -= dx * 0.0028;
  camPitch = Math.max(-0.12, Math.min(1.0, camPitch + dy * 0.0028));
});

function inputState() {
  return {
    f: !!(keys.KeyW || keys.ArrowUp),
    b: !!(keys.KeyS || keys.ArrowDown),
    l: !!(keys.KeyA || keys.ArrowLeft),
    r: !!(keys.KeyD || keys.ArrowRight),
    run: !!(keys.ShiftLeft || keys.ShiftRight),
    brake: !!keys.Space,
  };
}

// ------------------------------------------------------------------ actions
function tryEnterOrExit() {
  if (player.mode === 'car') {
    player.exitCar();
    return;
  }
  const allCars = traffic.cars.concat(police.cars);
  const car = player.nearestCar(allCars);
  if (!car) return;
  const firstSteal = !car.stolen && car !== null && (car.parked || car.occupied);
  player.enterCar(car);
  if (firstSteal) {
    car.stolen = true;
    police.reportCrime(1);
    peds.alarm(car.mesh.position.x, car.mesh.position.z, 16);
    hud.notify('Vehicle stolen — the PSPD has been notified');
  }
}

function togglePistol() {
  if (player.mode !== 'foot') return;
  G.weapon.drawn = !G.weapon.drawn;
  audio.click();
}

function startReload() {
  const w = G.weapon;
  if (!w.drawn || w.reloadT > 0 || w.mag >= 12 || w.reserve <= 0) return;
  w.reloadT = 1.15;
}

function firingPulse() {
  // One shot per click when not using pointer-lock auto-repeat.
  tryShoot();
}

function tryShoot() {
  const w = G.weapon;
  if (!w.drawn || player.mode !== 'foot' || w.cooldown > 0 || w.reloadT > 0) return;
  if (w.mag <= 0) {
    audio.click();
    startReload();
    return;
  }
  w.mag -= 1;
  w.cooldown = 0.17;
  player.heading = camYaw;
  combat.playerShoot(camera, player.pos);
  audio.gunshot();
  peds.alarm(player.pos.x, player.pos.z, 30);
  police.reportCrime(2);
}

function doMelee() {
  if (player.mode !== 'foot') return;
  player.heading = camYaw;
  const hit = combat.melee(player.pos, camYaw);
  audio.punch();
  if (hit) police.reportCrime(1);
}

// ------------------------------------------------------------------ screens
function pauseGame() {
  G.screen = 'paused';
  showScreen('pause');
  document.exitPointerLock?.();
}
function resumeGame() {
  G.screen = 'playing';
  showScreen(null);
}
function toTitle() {
  G.screen = 'title';
  showScreen('title');
  document.exitPointerLock?.();
  refreshContinue();
  missions.marker.visible = false;
}
function refreshContinue() {
  document.getElementById('btn-continue').disabled = !hasSave();
}

function busted() {
  const fine = Math.min(G.money, 100 + police.stars * 40);
  G.money -= fine;
  if (player.mode === 'car') player.exitCar();
  police.clearWanted();
  player.hp = Math.max(player.hp, 55);
  player.setPosition(LANDMARKS.precinct.x, LANDMARKS.precinct.z + 8);
  document.getElementById('busted-text').textContent =
    `Detective Calloway finally got her hands on you. The fine is $${fine}; your car stays where you left it.`;
  G.screen = 'busted';
  showScreen('busted');
  document.exitPointerLock?.();
  G.saveProgress();
}

function wasted() {
  const fee = Math.min(G.money, 100);
  G.money -= fee;
  if (player.mode === 'car') player.exitCar();
  police.clearWanted();
  player.hp = 100;
  G.weapon.drawn = false;
  player.setPosition(LANDMARKS.hospital.x, LANDMARKS.hospital.z + 10);
  document.getElementById('wasted-text').textContent =
    `You wake up at Serena General with a headache and a $${fee} hospital bill.`;
  G.screen = 'wasted';
  showScreen('wasted');
  document.exitPointerLock?.();
  G.saveProgress();
}

missions.onComplete = (mission) => {
  // completeMission() has already advanced nextIndex past this mission.
  const idx = missions.nextIndex - 1;
  if (idx === 5) {
    G.screen = 'ending';
    showScreen('ending');
  } else {
    document.getElementById('complete-text').textContent =
      `${mission.title} — $${mission.reward} earned. Dario will have another job at the garage.`;
    G.screen = 'complete';
    showScreen('complete');
  }
  document.exitPointerLock?.();
};

document.getElementById('btn-new').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  clearSave();
  G.money = START_MONEY;
  player.hp = 100;
  G.weapon = { drawn: false, mag: 12, reserve: 96, reloadT: 0, cooldown: 0 };
  if (player.mode === 'car') player.exitCar();
  if (missions.active) missions.cleanupStage();
  missions.active = null;
  missions.nextIndex = 0;
  combat.clearCrew();
  police.clearWanted();
  player.setPosition(-146, 12);
  camYaw = 0;
  G.screen = 'playing';
  showScreen(null);
  hud.notify('Welcome to Port Serena');
});
document.getElementById('btn-continue').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  const data = loadGame();
  if (!data) return;
  G.money = data.money;
  missions.nextIndex = Math.min(6, data.mission);
  if (player.mode === 'car') player.exitCar();
  player.setPosition(data.x, data.z);
  player.hp = 100;
  G.screen = 'playing';
  showScreen(null);
  hud.notify('Welcome back to Port Serena');
});
document.getElementById('btn-resume').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-quit').addEventListener('click', () => { audio.click(); toTitle(); });
document.getElementById('btn-busted-ok').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-wasted-ok').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-complete-ok').addEventListener('click', () => { audio.click(); resumeGame(); });
document.getElementById('btn-ending-ok').addEventListener('click', () => { audio.click(); resumeGame(); });

// Crime: running a pedestrian down is reported by the peds system.
peds.onHit = (ped, car) => {
  if (player.mode === 'car' && player.car === car) {
    police.reportCrime(2);
    hud.notify('Hit and run!');
  }
};

// ------------------------------------------------------------------ sim step
let crimeCd = 0;
let saveT = 0;

function step(dt) {
  G.time += dt;
  city.update(dt);

  if (G.screen === 'title') {
    // A slow living backdrop behind the title card.
    traffic.update(dt, player.pos, police.cars);
    peds.update(dt, traffic.cars, player.pos);
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 95, 42, Math.cos(t) * 95 - 20);
    camera.lookAt(0, 6, -10);
    return;
  }
  if (G.screen !== 'playing') return;

  const input = inputState();
  const allCars = traffic.cars.concat(police.cars);

  player.update(dt, input, camYaw, allCars);
  traffic.update(dt, player.pos, police.cars);
  police.update(dt, player, allCars);
  peds.update(dt, allCars, player.pos);
  combat.update(dt, player, audio);
  missions.update(dt);

  // Weapon housekeeping.
  const w = G.weapon;
  if (w.cooldown > 0) w.cooldown -= dt;
  if (firing) tryShoot();
  if (w.reloadT > 0) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) {
      const take = Math.min(12 - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
  }
  if (w.drawn) player.mesh.rotation.y = camYaw;

  // Crimes from collisions: ramming things at speed draws attention.
  crimeCd -= dt;
  if (player.mode === 'car' && player.car && crimeCd <= 0) {
    if ((player.car.hitWall || player.car.hitCar) && Math.abs(player.car.speed) > 6) {
      police.reportCrime(1);
      crimeCd = 4;
    }
  }

  // Cash pickups.
  for (const p of pickups) {
    if (!p.active) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) { p.active = true; p.mesh.visible = true; }
      continue;
    }
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 0.9 + Math.sin(G.time * 2.4 + p.x) * 0.15;
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < 2.4) {
      p.active = false;
      p.mesh.visible = false;
      p.respawnT = 45;
      G.addMoney(25);
      audio.pickup();
      hud.notify('+$25 — cash stash found');
    }
  }

  // Consequences.
  if (police.bustedEvent) {
    police.bustedEvent = false;
    busted();
    return;
  }
  if (player.hp <= 0) {
    wasted();
    return;
  }

  // Periodic autosave.
  saveT += dt;
  if (saveT > 15) {
    saveT = 0;
    G.saveProgress();
  }

  // HUD sync.
  hud.setHealth(player.hp, 100);
  hud.setMoney(G.money);
  hud.setDistrict(districtAt(player.pos.x, player.pos.z));
  hud.setStars(police.stars);
  hud.setAmmo(w.mag, w.reserve, w.drawn && player.mode === 'foot');
  hud.setBusted(police.stars > 0 ? police.bustedMeter : null);
  hud.update(dt);
  if (player.mode === 'car') {
    hud.setHint('W A S D drive · Space brake · E exit');
  } else {
    const near = player.nearestCar(allCars, 3.4);
    hud.setHint(near ? 'E — enter car' : null);
  }

  // Audio: engine from the player's speed, siren from the nearest cruiser.
  const speedRatio = player.mode === 'car' && player.car ? player.car.speed / 30 : 0;
  audio.update(dt, speedRatio, police.nearestDist(player.pos), G.time);

  if (!G.fixedShotCam) updateCamera(dt);
}

function updateCamera(dt) {
  if (player.mode === 'car' && player.car) {
    const car = player.car;
    const cp = car.mesh.position;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const dist = 10.5 + Math.abs(car.speed) * 0.12;
    const tx = cp.x - fx * dist;
    const tz = cp.z - fz * dist;
    const ty = 3.4 + Math.abs(car.speed) * 0.02;
    const k = 1 - Math.exp(-dt * 7);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.lookAt(cp.x + fx * 7, 1.3, cp.z + fz * 7);
    camYaw = car.heading;
    return;
  }
  // On foot: orbit camera behind Mari, driven by the mouse.
  const p = player.mesh.position;
  const dist = 6.8;
  const cx = p.x - Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = p.z - Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = 1.7 + Math.sin(camPitch) * dist;
  camera.position.set(cx, Math.max(0.7, cy), cz);
  camera.lookAt(p.x, 1.35, p.z);
  void dt;
}

// Keep the sun (and its shadow box) centred on the action.
function updateSun() {
  const p = player.pos;
  sun.position.set(p.x + 70, 110, p.z - 45);
  sun.target.position.set(p.x, 0, p.z);
}

// ------------------------------------------------------------------ loop
let lastNow = performance.now();
let acc = 0;
function pump() {
  const now = performance.now();
  let dt = (now - lastNow) / 1000;
  lastNow = now;
  if (dt > 0.3) dt = 0.3;
  if (dt < 0) dt = 0;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 24) {
    step(STEP);
    acc -= STEP;
    n++;
  }
  if (n === 24) acc = 0; // hopelessly behind: drop the backlog
}
function frame() {
  pump();
  updateSun();
  if (G.screen === 'playing') drawMinimap(document.getElementById('minimap'), G);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ shots
const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) {
  G.screen = 'playing';
  showScreen(null);
  const spec = stageShot(shotName, G);
  const simSeconds = spec && spec.sim ? spec.sim : 2;
  const steps = Math.round(simSeconds / STEP);
  for (let i = 0; i < steps; i++) step(STEP);
  if (spec && spec.cam === 'fixed') {
    G.fixedShotCam = true;
    camera.position.set(spec.camPos.x, spec.camPos.y, spec.camPos.z);
    camera.lookAt(spec.camTarget.x, spec.camTarget.y, spec.camTarget.z);
  } else if (spec && spec.cam === 'chase') {
    // Snap the chase camera into place behind the car.
    const car = player.car;
    const cp = car.mesh.position;
    camera.position.set(
      cp.x - Math.sin(car.heading) * 10.5,
      3.4,
      cp.z - Math.cos(car.heading) * 10.5,
    );
    camera.lookAt(cp.x + Math.sin(car.heading) * 7, 1.3, cp.z + Math.cos(car.heading) * 7);
  } else {
    updateCamera(1);
  }
  if (G.pendingShot) {
    G.pendingShot = false;
    combat.playerShoot(camera, player.pos);
    for (const t of combat.tracers) t.ttl = 30;
    combat.flashT = 30;
    combat.flash.visible = true;
  }
  updateSun();
  drawMinimap(document.getElementById('minimap'), G);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  showScreen('title');
  refreshContinue();
}

window.__game = G;
requestAnimationFrame(frame);
// Watchdog: if rAF is throttled (headless), the sim still advances.
setInterval(pump, 90);
