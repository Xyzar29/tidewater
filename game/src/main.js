// main.js — boot and the heartbeat of TIDEWATER.
//
// Builds the world, wires every system together, owns the screen state
// machine (title / playing / paused / busted / wasted / mission-complete)
// and runs the simulation at a fixed 60 Hz step decoupled from the frame
// rate. A watchdog keeps game time advancing even if the browser throttles
// animation frames (headless windows, background tabs), so the world never
// silently freezes.
//
// Also exposes window.__game: a small, deliberate debug handle the
// playtest scripts (and the staged screenshot scenes) drive the game with.

import { RNG, seedFrom } from './random.js';
import { buildCity, updateCity } from './city.js';
import { initPlayer, updatePlayer, enterCar, exitCar } from './player.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { stepCar, collideCars } from './vehicles.js';
import { initPeds, updatePeds } from './pedestrians.js';
import { initPolice, updatePolice, addHeat, setWanted, clearWanted } from './police.js';
import { initCombat, updateCombat, damagePlayer } from './combat.js';
import { initMissions, updateMissions, startMission, failMission, onEnemyDown } from './missions.js';
import { initHUD, updateHUD } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';
import { initAudio } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';
import {
  START_MONEY, HOSPITAL_FEE, CRIMES, LANDMARKS, SPAWN,
} from './config.js';

const params = new URLSearchParams(location.search);
const STEP = 1 / 60;

// --- renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

// --- the shared game context --------------------------------------------------
const G = {
  scene, camera, renderer,
  rng: new RNG(seedFrom(params.get('seed'))),
  time: 0,
  state: 'title',
  keys: {},          // held keys by KeyboardEvent.code
  pressed: {},       // one-frame key edges
  look: { dx: 0, dy: 0 },
  shotPressed: false,
  money: START_MONEY,
  cars: [],
  save: loadSave(),
};
window.__game = null; // filled at the bottom, once everything exists

buildCity(G);
initPlayer(G);
initTraffic(G);
initPeds(G);
initPolice(G);
initCombat(G);
initMissions(G);
initHUD(G);
initMinimap(G);
initAudio(G);
G.saveGame = () => storeSave(G);

// --- cross-system callbacks ---------------------------------------------------
G.onStealCar = (car) => {
  if (car.type === 'police') {
    addHeat(G, 150);
    G.notify('You stole a police cruiser!');
  } else {
    addHeat(G, CRIMES.stealCar);
    G.notify('Vehicle stolen');
  }
};

G.onCarCrash = (car, other, impact) => {
  if (car.driver === 'player' && impact > 5.5) {
    // Only counts if someone could have seen it: a cruiser nearby, or the
    // other party is right there (they always are).
    addHeat(G, CRIMES.hitCar, true);
    car.hp -= impact * 1.4;
    if (G.audio) G.audio.punch();
  }
  if (other && other.driver === 'player' && impact > 5.5) {
    addHeat(G, CRIMES.hitCar, true);
  }
};

G.onPedHit = (ped, car) => {
  if (car && car.driver === 'player') {
    addHeat(G, CRIMES.hitPed, true);
    G.notify('Hit and run!');
  }
};

G.onEnemyDown = () => onEnemyDown(G);

function respawnAt(x, z) {
  const p = G.player;
  if (p.inCar) { p.inCar.driver = 'none'; p.inCar = null; p.mesh.visible = true; }
  p.x = x; p.z = z;
  p.mesh.position.set(x, 0.1, z);
  G.camPos.set(x, 4, z + 8);
}

G.onBusted = () => {
  if (G.state !== 'playing') return;
  const fine = Math.min(G.money, 100 + G.wanted.stars * 120);
  G.money -= fine;
  failMission(G, 'arrested');
  document.getElementById('busted-text').textContent =
    `Detective Calloway books you herself. Fine: $${fine}. The slate is wiped clean.`;
  setState('busted');
};

G.onWasted = () => {
  if (G.state !== 'playing') return;
  const fee = Math.min(G.money, HOSPITAL_FEE);
  G.money -= fee;
  failMission(G, 'wasted');
  document.getElementById('wasted-text').textContent =
    `You wake up at Serena General Hospital. Bill: $${fee}. Dario sent flowers. Plastic ones.`;
  setState('wasted');
};

G.onMissionComplete = (def) => {
  const last = G.progress.done;
  document.getElementById('complete-text').textContent = last
    ? `${def.title} — +$${def.reward}. The boat cuts the harbour lights and Port Serena is yours. Free roam unlocked.`
    : `${def.title} — +$${def.reward}. Dario's marker is lit for the next job.`;
  setState('complete');
};

// --- screens / state machine --------------------------------------------------
const SCREENS = {
  title: 'title-screen', paused: 'pause-screen', busted: 'busted-screen',
  wasted: 'wasted-screen', complete: 'complete-screen',
};
function setState(next) {
  G.state = next;
  for (const [state, id] of Object.entries(SCREENS)) {
    document.getElementById(id).style.display = state === next ? '' : 'none';
  }
  if (next !== 'playing' && document.pointerLockElement) document.exitPointerLock();
}

function startGame(fromSave) {
  const p = G.player;
  clearWanted(G);
  G.mission.active = false;
  p.hp = 100;
  if (p.inCar) { p.inCar.driver = 'none'; p.inCar = null; p.mesh.visible = true; }
  if (fromSave && G.save) {
    G.money = G.save.money;
    G.progress.next = G.save.next;
    G.progress.done = !!G.save.done;
    G.combat.mag = G.save.mag ?? G.combat.mag;
    G.combat.reserve = G.save.reserve ?? G.combat.reserve;
    respawnAt(G.save.x ?? SPAWN.x, G.save.z ?? SPAWN.z);
  } else {
    G.money = START_MONEY;
    G.progress.next = 0;
    G.progress.done = false;
    respawnAt(SPAWN.x, SPAWN.z);
  }
  setState('playing');
  if (G.audio) G.audio.ensure();
  G.notify(fromSave ? 'Welcome back to Port Serena' : 'Welcome to Port Serena');
}

document.getElementById('btn-new').addEventListener('click', () => { clearSave(); G.save = null; startGame(false); });
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => setState('playing'));
document.getElementById('btn-restart').addEventListener('click', () => { clearSave(); G.save = null; startGame(false); });
document.getElementById('btn-busted-ok').addEventListener('click', () => {
  respawnAt(LANDMARKS.precinct.x, LANDMARKS.precinct.z + 30);
  G.player.hp = 100;
  clearWanted(G);
  G.saveGame();
  setState('playing');
});
document.getElementById('btn-wasted-ok').addEventListener('click', () => {
  respawnAt(LANDMARKS.hospital.x, LANDMARKS.hospital.z + 30);
  G.player.hp = 100;
  clearWanted(G);
  G.saveGame();
  setState('playing');
});
document.getElementById('btn-complete-ok').addEventListener('click', () => setState('playing'));
if (G.save) document.getElementById('btn-continue').style.display = '';

// --- input ----------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) G.pressed[e.code] = true;
  G.keys[e.code] = true;
  if (G.audio) G.audio.ensure();
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });

let dragging = false;
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  if (G.state === 'playing') {
    G.shotPressed = true;
    if (G.audio) G.audio.ensure();
    if (!document.pointerLockElement && !params.get('shot')) {
      renderer.domElement.requestPointerLock()?.catch?.(() => {});
    }
  }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement) {
    G.look.dx += e.movementX || 0;
    G.look.dy += e.movementY || 0;
  } else if (dragging) {
    G.look.dx += e.movementX || 0;
    G.look.dy += e.movementY || 0;
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- the fixed-step simulation ---------------------------------------------------
function step(dt) {
  G.time += dt;
  if (G.state === 'playing') {
    if (G.pressed['KeyP'] || G.pressed['Escape']) { setState('paused'); }
    if (G.pressed['KeyM'] && G.audio) {
      G.audio.setMuted(!G.audio.muted);
      G.notify(G.audio.muted ? 'Sound off' : 'Sound on');
    }
    if (G.pressed['KeyE']) {
      if (G.player.inCar) exitCar(G);
      else if (G.nearCar) enterCar(G, G.nearCar);
    }

    updatePlayer(G, dt);
    updateTraffic(G, dt);
    updatePolice(G, dt);
    for (const car of G.cars) {
      if (car.driver === 'parked' || car.dead) continue;
      stepCar(G, car, dt);
    }
    collideCars(G);
    updateCombat(G, dt);
    updateMissions(G, dt);
    updatePeds(G, dt);
    if (G.shotUpdate) G.shotUpdate(dt);
  } else if (G.state === 'paused') {
    if (G.pressed['KeyP'] || G.pressed['Escape']) setState('playing');
  }
  updateCity(G, dt);
  if (G.audio && G.audio.update) {
    const car = G.player.inCar;
    G.audio.update(car ? Math.abs(car.speed) / 30 : 0, !!car);
  }
  G.pressed = {};
  G.shotPressed = false;
}

let lastNow = performance.now();
let acc = 0;
let lastFrameAt = performance.now();
function advance(now) {
  const elapsed = Math.min(0.25, (now - lastNow) / 1000);
  lastNow = now;
  lastFrameAt = now;
  acc += elapsed;
  let n = 0;
  while (acc >= STEP && n < 10) { step(STEP); acc -= STEP; n++; }
  if (n === 10) acc = 0;
  updateHUD(G);
  drawMinimap(G);
  renderer.render(scene, camera);
  if (G.shotMode && !window.__shotReady && G.time >= G.shotReadyAt) {
    window.__shotReady = true;
  }
}
function frame(now) {
  advance(now);
  requestAnimationFrame(frame);
}
// Watchdog: if rAF is throttled (headless/background), keep sim time moving.
setInterval(() => {
  const now = performance.now();
  if (now - lastFrameAt > 300) advance(now);
}, 250);
requestAnimationFrame(frame);

// --- staged screenshot scenes ------------------------------------------------------
const shotName = params.get('shot');
if (shotName) {
  G.shotMode = true;
  stageShot(G, shotName);
  G.shotReadyAt = G.time + (G.shotSimSeconds || 3);
}

// --- the debug handle -----------------------------------------------------------------
window.__game = {
  G,
  get state() { return G.state; },
  get time() { return G.time; },
  get money() { return G.money; },
  set money(v) { G.money = v; },
  get player() { return G.player; },
  get playerPos() { return G.playerPos; },
  get wanted() { return G.wanted; },
  get mission() { return G.mission; },
  get progress() { return G.progress; },
  get cars() { return G.cars; },
  get peds() { return G.peds; },
  get policeCars() { return G.policeCars; },
  get enemies() { return G.enemies; },
  get combat() { return G.combat; },
  startGame: (fromSave) => startGame(!!fromSave),
  setState,
  startMission: (i) => startMission(G, i),
  setWanted: (n) => setWanted(G, n),
  addHeat: (n) => addHeat(G, n),
  damagePlayer: (n) => damagePlayer(G, n),
  teleport: (x, z) => {
    const p = G.player;
    if (p.inCar) { p.inCar.x = x; p.inCar.z = z; p.inCar.speed = 0; p.inCar.mesh.position.set(x, 0, z); }
    p.x = x; p.z = z; p.mesh.position.set(x, 0.1, z);
    G.camPos.set(x, 4, z + 8);
  },
  enterNearestCar: () => { if (!G.player.inCar && G.nearCar) enterCar(G, G.nearCar); },
  exitCar: () => exitCar(G),
  saveNow: () => G.saveGame(),
  key: (code, down) => { G.keys[code] = !!down; if (down) G.pressed[code] = true; },
  press: (code) => { G.pressed[code] = true; },
  shoot: () => { G.shotPressed = true; },
};
