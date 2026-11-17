// TIDEWATER — boot and wiring. Builds the renderer and every system,
// owns the screen state machine (title / playing / paused / busted /
// wasted / story-complete), the keyboard + mouse input, the fixed-step
// 60 Hz simulation loop, saving, and the window.__game debug handle the
// playtests drive. A ?shot=<name> scene short-circuits the title and
// stages a screenshot instead.

import { buildCity } from './city.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPeds, updatePeds } from './pedestrians.js';
import { createPlayer, updatePlayer, enterCar, nearestCar, teleport } from './player.js';
import { createPolice, updatePolice } from './police.js';
import { createCombat, updateCombat, tryShoot, tryMelee, startReload } from './combat.js';
import { collideCars } from './vehicles.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { makeRng } from './random.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { initShot } from './shots.js';
import { LANDMARKS } from './config.js';

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotName = params.get('shot');

const G = {
  time: 0, money: 120, state: 'title',
  cars: [], peds: [],
  input: { keys: new Set(), pressed: new Set(), camYaw: Math.PI * 0.75, camPitch: 0.32 },
  rng: makeRng(seed),
  seed,
};
window.__game = null;

// --- renderer / scene ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById('game').appendChild(renderer.domElement);
G.renderer = renderer;
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
G.camera.position.set(-60, 40, 120);
G.audio = createAudio();

buildCity(G);
createTraffic(G);
createPeds(G);
createPlayer(G);
createPolice(G);
createCombat(G);
createMissions(G);
createHud(G);
const minimap = createMinimap(G);

// --- screens --------------------------------------------------------------
const SCREENS = ['title', 'pause', 'busted', 'wasted', 'complete'];
function setScreen(name) {
  for (const s of SCREENS) {
    document.getElementById('screen-' + s).classList.toggle('on', s === name);
  }
  document.getElementById('hud').classList.toggle('on', name === 'none');
}
G.setScreen = setScreen;

let pendingSave = loadSave();
const continueBtn = document.getElementById('btn-continue');
continueBtn.disabled = !pendingSave;

function saveGame() {
  if (shotName) return;
  writeSave({
    money: G.money,
    missionsDone: G.missions.done,
    x: Math.round(G.player.x), z: Math.round(G.player.z),
  });
}
G.saveGame = saveGame;

function startPlaying() {
  G.audio.unlock();
  G.state = 'playing';
  setScreen('none');
}

document.getElementById('btn-new').addEventListener('click', () => {
  clearSave();
  pendingSave = null;
  G.money = 120;
  G.missions.done = 0;
  G.player.health = 100;
  teleport(G, -178, -44);
  startPlaying();
});
continueBtn.addEventListener('click', () => {
  if (pendingSave) {
    G.money = pendingSave.money;
    G.missions.done = Math.min(6, pendingSave.missionsDone);
    if (typeof pendingSave.x === 'number') teleport(G, pendingSave.x, pendingSave.z);
  }
  startPlaying();
});
document.getElementById('btn-resume').addEventListener('click', startPlaying);
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  G.state = 'title';
  setScreen('title');
  pendingSave = loadSave();
  continueBtn.disabled = !pendingSave;
});
document.getElementById('btn-busted-ok').addEventListener('click', startPlaying);
document.getElementById('btn-wasted-ok').addEventListener('click', startPlaying);
document.getElementById('btn-complete-ok').addEventListener('click', startPlaying);

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  setScreen('pause');
  G.audio.engine(false, 0);
  G.audio.siren(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

G.onBusted = function () {
  if (G.state !== 'playing') return;
  const fine = Math.min(G.money, 100 + G.police.stars * 75);
  G.money -= fine;
  G.missions.abort();
  G.police.clear();
  if (G.player.driving) {
    const car = G.player.driving;
    G.player.driving = null;
    car.occupant = null;
    G.player.mesh.visible = true;
  }
  teleport(G, LANDMARKS.precinct.x - 14, LANDMARKS.precinct.z + 10);
  G.player.health = Math.max(40, G.player.health);
  document.getElementById('busted-text').textContent =
    `Detective Calloway finally gets her collar. The precinct takes $${fine} and your afternoon.`;
  G.state = 'busted';
  setScreen('busted');
  G.audio.fail();
  G.audio.engine(false, 0);
  G.audio.siren(false);
  saveGame();
};

G.onWasted = function () {
  if (G.state !== 'playing') return;
  const fee = Math.min(G.money, 150);
  G.money -= fee;
  G.missions.abort();
  G.police.clear();
  if (G.player.driving) {
    G.player.driving = null;
    G.player.mesh.visible = true;
  }
  document.getElementById('wasted-text').textContent =
    `You wake up at Port Serena General, lighter by a $${fee} hospital fee.`;
  G.state = 'wasted';
  setScreen('wasted');
  G.audio.fail();
  G.audio.engine(false, 0);
  G.audio.siren(false);
  saveGame();
};

G.onStoryComplete = function () {
  if (G.state !== 'playing') return;
  G.state = 'complete';
  setScreen('complete');
};

// Buttons on the end screens respawn Mari where she belongs.
document.getElementById('btn-wasted-ok').addEventListener('click', () => {
  teleport(G, 8, 6);
  G.player.health = 100;
});

// --- input ------------------------------------------------------------------
const canvas = renderer.domElement;
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) G.input.pressed.add(e.code);
  G.input.keys.add(e.code);
  if (G.state === 'playing') {
    if (e.code === 'KeyP') pauseGame();
    if (e.code === 'KeyM') {
      const m = !G.audio.isMuted();
      G.audio.setMuted(m);
      G.hud.notify(m ? 'Sound off' : 'Sound on');
    }
    if (e.code === 'KeyQ') G.combat.toggleDraw();
    if (e.code === 'KeyR') startReload(G);
    if (e.code === 'KeyF') tryMelee(G);
  } else if (G.state === 'paused' && e.code === 'KeyP') startPlaying();
});
window.addEventListener('keyup', (e) => G.input.keys.delete(e.code));
window.addEventListener('blur', () => { G.input.keys.clear(); });

canvas.addEventListener('mousedown', (e) => {
  if (G.state !== 'playing') return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
    return; // the capturing click doesn't also fire a punch
  }
  if (e.button === 0) {
    if (G.combat.drawn && !G.player.driving) tryShoot(G);
    else if (!G.player.driving) tryMelee(G);
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.state !== 'playing') return;
  G.input.camYaw -= e.movementX * 0.0026;
  G.input.camPitch = Math.max(-0.15, Math.min(1.0, G.input.camPitch + e.movementY * 0.002));
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.state === 'playing' && !shotName) {
    // Escaping pointer lock is the natural pause gesture — but not when
    // a modal screen (busted/wasted) already owns the moment.
    pauseGame();
  }
});
window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- simulation ---------------------------------------------------------------
let lastDistrict = '';
let saveT = 0;

function stepSim(dt) {
  G.time += dt;
  // Order matters: the player moves, traffic and police react, missions
  // read the world, then cosmetics (city life, combat effects) settle.
  updatePlayer(G, dt);
  updateTraffic(G, dt);
  updatePolice(G, dt);
  G.missions.update(dt);
  updatePeds(G, dt);
  updateCombat(G, dt);
  collideCars(G);
  G.city.update(dt);
  if (!G.player.driving) G.audio.engine(false, 0);

  // Free-roam cash pickups.
  for (const pk of G.city.pickups) {
    if (pk.taken) continue;
    const dx = pk.x - G.player.x, dz = pk.z - G.player.z;
    if (dx * dx + dz * dz < 10) {
      pk.taken = true;
      pk.mesh.visible = false;
      G.money += 25;
      G.audio.pickup();
      G.hud.notify('+$25 — found cash');
    }
  }
  // District flavour.
  const district = G.city.districtAt(G.player.x, G.player.z);
  if (district !== lastDistrict) {
    lastDistrict = district;
    G.hud.setDistrict(district);
  }
  // Periodic autosave.
  saveT += dt;
  if (saveT > 20) { saveT = 0; saveGame(); }
  G.hud.update(dt);
  G.input.pressed.clear();
}

// Ambient life behind the title screen: traffic and crowds keep moving,
// the sea keeps shining, but no systems that can hurt anyone run.
function stepAmbient(dt) {
  G.time += dt;
  updateTraffic(G, dt);
  updatePeds(G, dt);
  G.city.update(dt);
  const t = G.time * 0.05;
  G.camera.position.set(Math.sin(t) * 170, 62, Math.cos(t) * 170 - 20);
  G.camera.lookAt(0, 6, 0);
}

// --- shot mode ------------------------------------------------------------------
let shot = null;
if (shotName) {
  shot = initShot(G, shotName);
  if (shot) {
    G.state = 'playing';
    setScreen('none');
  }
}

// --- main loop ------------------------------------------------------------------
let last = performance.now();
let lastFrameAt = last;
let acc = 0;
const STEP = 1 / 60;

let rafPending = false;
function kick() {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(frame);
  }
}

function frame(now) {
  rafPending = false;
  lastFrameAt = now;
  let dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  if (G.state === 'playing') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 32) {
      stepSim(STEP);
      acc -= STEP;
      n++;
      if (shot) {
        shot.t += STEP;
        if (shot.t >= shot.duration) {
          if (shot.finish) shot.finish();
          window.__shotReady = true;
          shot = null;
          G.state = 'shot-done';
          break;
        }
      }
    }
    if (n === 32) acc = 0;
  } else if (G.state === 'title') {
    stepAmbient(dt);
  }
  if (G.state === 'playing' || G.state === 'shot-done') minimap.draw();
  renderer.render(G.scene, G.camera);
  kick();
}
kick();
// Watchdog: some headless / occluded environments starve
// requestAnimationFrame entirely, which would freeze the simulation and
// the screenshot scenes. If no frame has run for 90 ms, a plain timer
// drives the same frame function until rAF recovers. In a normal browser
// rAF fires every ~16 ms and the watchdog never triggers.
setInterval(() => {
  const now = performance.now();
  if (now - lastFrameAt > 150) frame(now);
}, 100);
// In shot mode the scene setup above already hid every screen; the title
// screen must not be re-shown over the staged scene.
if (!shotName) setScreen('title');

// --- debug / playtest handle ------------------------------------------------------
window.__game = {
  G,
  state: () => G.state,
  player: () => ({
    x: G.player.x, z: G.player.z, health: G.player.health,
    driving: !!G.player.driving, money: G.money,
    stars: G.police.stars, missionsDone: G.missions.done,
    mission: G.missions.current ? G.missions.current.index : -1,
    stage: G.missions.current ? G.missions.current.stage : -1,
    ammo: G.combat.ammo, drawn: G.combat.drawn,
    gunmen: G.combat.gunmen.filter((g) => !g.dead).length,
    cops: G.police.cars.length,
    bustedMeter: G.police.bustedMeter,
  }),
  newGame: () => document.getElementById('btn-new').click(),
  continueGame: () => document.getElementById('btn-continue').click(),
  teleport: (x, z) => teleport(G, x, z),
  enterNearestCar: () => { const c = nearestCar(G, 6); if (c) enterCar(G, c); return !!c; },
  exitCar: () => { G.input.pressed.add('KeyE'); },
  startMission: (i) => G.missions.startMission(i),
  setWanted: (n) => G.police.setStarsAtLeast(n),
  clearWanted: () => G.police.clear(),
  setHealth: (n) => { G.player.health = n; },
  setMoney: (n) => { G.money = n; },
  draw: () => { if (!G.combat.drawn) G.combat.toggleDraw(); },
  shoot: () => tryShoot(G),
  melee: () => tryMelee(G),
  press: (code) => {
    G.input.keys.add(code);
    G.input.pressed.add(code);
  },
  release: (code) => G.input.keys.delete(code),
  clickButton: (id) => document.getElementById(id).click(),
};
