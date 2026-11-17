// main.js — TIDEWATER boot: builds every system, owns the screen state
// machine (title / playing / paused / busted / wasted / complete / ending),
// the input layer, and the fixed-timestep loop. A watchdog timer keeps the
// simulation advancing even where a headless browser throttles rAF.

import { STEP, PLAYER, LANDMARKS } from './config.js';
import { RNG, seedFromQuery } from './random.js';
import { createCity, collideCircle } from './city.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { createShots } from './shots.js';
import { driveCar, syncCarMesh } from './vehicles.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);
camera.position.set(-225, 4, -170);

const G = {
  THREE, scene, camera, renderer,
  rng: new RNG(seedFromQuery()),
  state: {
    screen: 'title',
    time: 0,
    money: PLAYER.startMoney,
    shotMode: shotName,
    frozen: false, // shot mode: set once the staged scene is rendered
  },
  input: {
    keys: new Set(),
    pressed: new Set(),
    lookDX: 0, lookDY: 0,
    mouseDown: false,
    clicked: false,
    get locked() { return document.pointerLockElement === canvas; },
  },
  colliders: [],
  colliderGrid: new Map(),
  cars: [],
  peds: [],
  boats: [],
  camOverride: null,
  shotTick: null,
};
window.__game = G;

// ---- systems ---------------------------------------------------------------
G.audio = createAudio(G);
G.hud = createHud(G);
G.city = createCity(G);
G.player = createPlayer(G);
G.traffic = createTraffic(G);
G.pedestrians = createPedestrians(G);
G.police = createPolice(G);
G.combat = createCombat(G);
G.missions = createMissions(G);
G.minimap = createMinimap(G);
G.save = createSave(G);
G.saveGame = () => G.save.save();

// ---- screens -----------------------------------------------------------------
const SCREEN_IDS = {
  title: 'screen-title',
  paused: 'screen-pause',
  busted: 'screen-busted',
  wasted: 'screen-wasted',
  complete: 'screen-complete',
  ending: 'screen-ending',
};

function setScreen(name) {
  G.state.screen = name;
  for (const [key, id] of Object.entries(SCREEN_IDS)) {
    document.getElementById(id).classList.toggle('hidden', key !== name);
  }
  document.getElementById('hud').style.display =
    (name === 'playing' || name === 'paused') ? 'block' : 'none';
  if (name !== 'playing' && document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}
G.setScreen = setScreen;

function leaveCarBehind() {
  const p = G.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
    p.mesh.visible = true;
  }
}

function respawnAt(landmark) {
  leaveCarBehind();
  G.police.clearWanted();
  G.combat.clearEnemies();
  if (G.missions.active) G.missions.failActive('The job fell apart — return to the blue marker to retry.');
  G.player.health = 100;
  G.player.teleport(landmark.x, landmark.z + 6, Math.PI);
  G.saveGame();
  setScreen('playing');
}

G.onBusted = () => {
  if (G.state.screen !== 'playing') return;
  const fine = 60 + G.police.stars * 40;
  G.state.money = Math.max(0, G.state.money - fine);
  document.getElementById('busted-text').textContent =
    `Detective Calloway books you herself. Fine: $${fine}. Your wheels and your heat stay behind.`;
  G.audio.fail();
  setScreen('busted');
};

G.onWasted = () => {
  if (G.state.screen !== 'playing') return;
  const fee = Math.max(50, Math.floor(G.state.money * PLAYER.hospitalFeeRate));
  G.state.money = Math.max(0, G.state.money - fee);
  document.getElementById('wasted-text').textContent =
    `You wake up at Serena General with a $${fee} bill and a nurse who has seen worse.`;
  G.audio.fail();
  setScreen('wasted');
};

G.showComplete = (def) => {
  document.getElementById('complete-text').textContent =
    `"${def.name}" is done. Dario wires you $${def.reward}. ` +
    (G.missions.nextIndex < 6 ? 'The blue marker at his garage has your next job.' : 'That was the last job on his list.');
  setScreen('complete');
};

G.showEnding = (def) => {
  document.getElementById('ending-text').textContent =
    `The boat clears the harbour as the sirens fade. $${def.reward} richer, Mari Vega is a ghost — ` +
    'and Port Serena is hers to roam. (Free roam unlocked: the city, the cars and the PSPD remain.)';
  setScreen('ending');
};

function newGame() {
  G.save.clear();
  G.state.money = PLAYER.startMoney;
  G.missions.nextIndex = 0;
  if (G.missions.active) G.missions.failActive('');
  G.police.clearWanted();
  G.combat.clearEnemies();
  G.combat.weapon.ammo = 12;
  G.combat.weapon.reserve = 120;
  G.combat.weapon.drawn = false;
  G.player.mesh.userData.parts.gun.visible = false;
  leaveCarBehind();
  G.player.health = 100;
  G.player.teleport(-225, -192, 0);
  G.audio.init();
  setScreen('playing');
  G.hud.toast('Head to the blue marker at Dario\'s Garage');
}

function continueGame() {
  const data = G.save.load();
  if (!data) return;
  G.audio.init();
  G.save.apply(data);
  setScreen('playing');
  G.hud.toast('Welcome back to Port Serena');
}

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', () => setScreen('playing'));
document.getElementById('btn-quit-title').addEventListener('click', () => setScreen('title'));
document.getElementById('btn-busted').addEventListener('click', () => respawnAt(LANDMARKS.precinct));
document.getElementById('btn-wasted').addEventListener('click', () => respawnAt(LANDMARKS.hospital));
document.getElementById('btn-complete').addEventListener('click', () => setScreen('playing'));
document.getElementById('btn-ending').addEventListener('click', () => setScreen('playing'));
document.getElementById('btn-continue').disabled = !G.save.has();

// ---- input -------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  G.input.keys.add(e.code);
  G.input.pressed.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP') {
    if (G.state.screen === 'playing') setScreen('paused');
    else if (G.state.screen === 'paused') setScreen('playing');
  }
  if (e.code === 'Escape' && G.state.screen === 'playing' && !G.input.locked) setScreen('paused');
  if (G.state.screen === 'playing') G.audio.init();
});
window.addEventListener('keyup', (e) => G.input.keys.delete(e.code));
window.addEventListener('blur', () => G.input.keys.clear());
canvas.addEventListener('mousedown', (e) => {
  if (G.state.screen !== 'playing') return;
  G.audio.init();
  if (!G.input.locked && !G.state.shotMode) {
    canvas.requestPointerLock();
    return; // the locking click never fires a shot
  }
  if (e.button === 0) {
    G.input.mouseDown = true;
    G.input.clicked = true;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) G.input.mouseDown = false;
});
window.addEventListener('mousemove', (e) => {
  if (G.state.screen !== 'playing') return;
  if (G.input.locked) {
    G.input.lookDX += e.movementX || 0;
    G.input.lookDY += e.movementY || 0;
  } else if (G.input.mouseDown) {
    G.input.lookDX += (e.movementX || 0) * 1.5;
    G.input.lookDY += (e.movementY || 0) * 1.5;
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- simulation ----------------------------------------------------------------
function stepSim(dt) {
  G.state.time += dt;
  G.player.update(dt);
  G.traffic.update(dt);
  G.pedestrians.update(dt);
  G.police.update(dt);
  G.combat.update(dt);
  G.missions.update(dt);
  // driverless cars still rolling coast to a stop
  for (const car of G.cars) {
    if (!car.driver && car.speed !== 0) {
      driveCar(car, dt, 0, 0, false);
      collideCircle(G, car, 1.35);
      syncCarMesh(car, dt);
    }
  }
  G.city.update(dt, G.state.time);
  G.audio.update(dt);
  G.input.pressed.clear();
  G.input.clicked = false;
}

let lastPump = performance.now();
let accumulator = 0;
function pump(now) {
  let elapsed = (now - lastPump) / 1000;
  lastPump = now;
  if (elapsed > 0.5) elapsed = 0.5;
  if (G.state.screen === 'playing' && !G.state.frozen) {
    accumulator += elapsed;
    let n = 0;
    while (accumulator >= STEP && n < 30) {
      stepSim(STEP);
      accumulator -= STEP;
      n++;
    }
    if (n === 30) accumulator = 0;
  } else {
    accumulator = 0;
  }
  G.hud.update();
  if (G.state.screen === 'playing' || G.state.screen === 'paused') G.minimap.update();
}

function frame(now) {
  pump(now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// watchdog: if rAF is throttled (headless), keep the world moving + rendered
let lastWatchdogRender = 0;
setInterval(() => {
  const now = performance.now();
  if (now - lastPump > 110) {
    pump(now);
    if (now - lastWatchdogRender > 90) {
      lastWatchdogRender = now;
      renderer.render(scene, camera);
    }
  }
}, 60);

// ---- boot ------------------------------------------------------------------------
if (shotName) {
  G.state.screen = 'playing';
  for (const id of Object.values(SCREEN_IDS)) document.getElementById(id).classList.add('hidden');
  document.getElementById('hud').style.display = 'block';
  const shots = createShots(G);
  shots.stage(shotName);
  const STEPS = 300;
  for (let i = 0; i < STEPS; i++) {
    stepSim(STEP);
    if (G.shotTick) G.shotTick(i);
    G.hud.update();
    G.minimap.update();
  }
  renderer.render(scene, camera);
  G.state.frozen = true; // the watchdog must not advance the staged scene
  window.__shotReady = true;
} else {
  setScreen('title');
  requestAnimationFrame(frame);
}

// debug / playtest handle
G.debug = {
  newGame, continueGame, setScreen,
  startMission: (i) => G.missions.startMission(i),
  teleport: (x, z, h) => G.player.teleport(x, z, h),
  setWanted: (n) => G.police.setStars(n),
  addHeat: (n) => G.police.addHeat(n),
  giveCash: (n) => { G.state.money += n; },
  hurt: (n) => G.player.damage(n),
  shoot: () => { if (!G.combat.weapon.drawn) { G.combat.weapon.drawn = true; G.player.mesh.userData.parts.gun.visible = true; } G.combat.firePistol(); },
  step: (n) => { for (let i = 0; i < n; i++) stepSim(STEP); },
};
