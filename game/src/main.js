// main.js — TIDEWATER's boot and wiring: renderer, the fixed-step simulation
// loop (with a watchdog pump for throttled headless frames), input, the
// screen state machine (title / playing / pause / busted / wasted /
// mission-complete / ending), respawns, and the window.__game debug handle.
import { S, CFG, LANDMARKS as L } from './config.js';
import { makeRng } from './random.js';
import { createCity } from './city.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import * as audio from './audio.js';
import { hasSave, loadSave, clearSave, saveGame } from './save.js';
import { stageShot, updateShots } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
S.seed = seed;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-146, 42, -40);

const g = {
  scene, camera, renderer,
  rng: makeRng(seed),
  cars: [], keys: new Set(), lastShot: null,
};
g.reportCrime = (kind) => { if (g.police) g.police.reportCrime(kind); };
g.audioSfx = (name) => audio.sfx(name);
g.damagePlayer = (amt) => {
  if (S.screen !== 'playing') return;
  S.hp -= amt;
  g.hud.flashDamage();
  if (S.hp <= 0) onWasted();
};

g.city = createCity(scene, g.rng);
g.colliders = g.city.colliders; // driveCar() reads world.colliders / world.cars
g.hud = createHud(g);
g.player = createPlayer(g);
g.traffic = createTraffic(g);
g.peds = createPedestrians(g);
g.police = createPolice(g);
g.combat = createCombat(g);
g.missions = createMissions(g);
g.minimap = createMinimap(g);

// ——— screens ———
const el = (id) => document.getElementById(id);
const SCREEN_IDS = {
  title: 'screen-title', pause: 'screen-pause', busted: 'screen-busted',
  wasted: 'screen-wasted', complete: 'screen-complete', ending: 'screen-ending',
};
function showScreen(name) {
  S.screen = name;
  for (const key of Object.keys(SCREEN_IDS)) {
    el(SCREEN_IDS[key]).classList.toggle('hidden', key !== name);
  }
  el('hud').classList.toggle('hidden', name === 'title');
  if (name === 'title') el('btn-continue').disabled = !hasSave();
  if (document.pointerLockElement && name !== 'playing') document.exitPointerLock();
}
function respawnAt(spot) {
  if (g.player.mode === 'car') g.player.exitCar();
  g.police.clearWanted();
  g.combat.setDrawn(false);
  S.hp = CFG.playerHp;
  S.bustedMeter = 0;
  g.player.teleport(spot.x, spot.z);
  showScreen('playing');
  saveGame(g);
}
function onWasted() {
  if (S.screen !== 'playing') return;
  const fee = 200;
  S.money = Math.max(0, S.money - fee);
  el('wasted-text').textContent = `Serena General patched you up — the bill was $${fee}.`;
  audio.sfx('busted');
  showScreen('wasted');
}
g.onBusted = () => {
  if (S.screen !== 'playing') return;
  const fine = 150 + S.wanted * 100;
  S.money = Math.max(0, S.money - fine);
  el('busted-text').textContent = `Detective Calloway finally has her photo. The fine was $${fine}, and the precinct coffee is terrible.`;
  audio.sfx('busted');
  showScreen('busted');
};
g.showComplete = (name, reward) => {
  el('complete-text').textContent = `"${name}" is done. Dario wires the money, no questions asked.`;
  el('complete-reward').textContent = '+$' + reward;
  showScreen('complete');
};
g.showEnding = () => showScreen('ending');

el('btn-new').addEventListener('click', () => {
  audio.initAudio(); audio.sfx('click');
  clearSave();
  S.money = CFG.startMoney; S.hp = CFG.playerHp; S.missionIndex = 0;
  g.police.clearWanted();
  g.player.teleport(-146, -114);
  showScreen('playing');
});
el('btn-continue').addEventListener('click', () => {
  audio.initAudio(); audio.sfx('click');
  const data = loadSave();
  if (data) {
    S.money = data.money; S.missionIndex = data.missionIndex || 0;
    g.player.teleport(data.x, data.z);
  }
  showScreen('playing');
});
el('btn-resume').addEventListener('click', () => { audio.sfx('click'); showScreen('playing'); });
el('btn-busted').addEventListener('click', () => { audio.sfx('click'); respawnAt(L.precinct); });
el('btn-wasted').addEventListener('click', () => { audio.sfx('click'); respawnAt(L.hospital); });
el('btn-complete').addEventListener('click', () => { audio.sfx('click'); showScreen('playing'); });
el('btn-ending').addEventListener('click', () => { audio.sfx('click'); showScreen('playing'); });

// ——— input ———
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  g.keys.add(e.code);
  if (S.screen === 'playing') {
    if (e.code === 'KeyE') g.player.toggleVehicle();
    else if (e.code === 'KeyQ') g.combat.toggleDraw();
    else if (e.code === 'KeyR') g.combat.startReload();
    else if (e.code === 'KeyF') g.combat.tryMelee();
    else if (e.code === 'KeyM') audio.setMuted(!S.muted);
    else if (e.code === 'KeyP' || e.code === 'Escape') showScreen('pause');
  } else if (S.screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) {
    showScreen('playing');
  }
});
window.addEventListener('keyup', (e) => g.keys.delete(e.code));
window.addEventListener('blur', () => g.keys.clear());

let dragging = false;
const cvs = renderer.domElement;
cvs.addEventListener('mousedown', (e) => {
  audio.initAudio();
  if (S.screen !== 'playing') return;
  dragging = true;
  if (e.button === 0) {
    if (cvs.requestPointerLock) {
      try {
        const p = cvs.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (err) { /* headless — drag-look still works */ }
    }
    if (!g.combat.tryShoot()) g.combat.tryMelee();
  }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (S.screen !== 'playing') return;
  const locked = document.pointerLockElement === cvs;
  if (!locked && !dragging) return;
  g.player.yaw -= e.movementX * 0.0031;
  g.player.pitch = Math.max(-0.12, Math.min(1.05, g.player.pitch + e.movementY * 0.0028));
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ——— simulation ———
const STEP = 1 / 60;
function step(dt) {
  if (S.screen === 'title') {
    S.time += dt;
    const t = S.time * 0.045;
    camera.position.set(Math.sin(t) * 135, 56, Math.cos(t) * 135);
    camera.lookAt(0, 0, 25);
    g.traffic.update(dt);
    g.peds.update(dt);
    g.city.update(dt, S.time);
    return;
  }
  if (S.screen !== 'playing') return;
  S.time += dt;
  g.player.update(dt);
  g.traffic.update(dt);
  g.peds.update(dt);
  g.police.update(dt);
  g.combat.update(dt);
  g.missions.update(dt);
  g.city.update(dt, S.time);
  g.hud.update();
  g.minimap.draw();
  audio.updateAudio(g);
  updateShots();
  if (S.hp > 0 && S.hp < CFG.playerHp && S.wanted === 0) {
    S.hp = Math.min(CFG.playerHp, S.hp + dt * 1.1); // calm streets heal
  }
}

let last = performance.now(), acc = 0;
function pump(now) {
  let el = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += el;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  renderer.render(scene, camera);
}
function frame(now) { requestAnimationFrame(frame); pump(now); }
requestAnimationFrame(frame);
// Watchdog: headless Chromium throttles rAF hard; keep sim time advancing.
setInterval(() => {
  const now = performance.now();
  if (now - last > 160) pump(now);
}, 90);

// ——— boot ———
const shotName = params.get('shot');
if (shotName) {
  stageShot(g, shotName);
  showScreen('playing');
} else {
  showScreen('title');
}

window.__game = {
  S, g,
  player: g.player, police: g.police, missions: g.missions, combat: g.combat,
  teleport: (x, z) => g.player.teleport(x, z),
  setWanted: (n) => g.police.setWanted(n),
  startMission: (i) => g.missions.startMission(i),
  setStage: (n) => g.missions.debugSetStage(n),
  shoot: () => g.combat.tryShoot(),
  draw: () => g.combat.setDrawn(true),
  press: (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), 60);
  },
  state: () => ({
    screen: S.screen, money: S.money, hp: Math.round(S.hp), wanted: S.wanted,
    missionIndex: S.missionIndex, pos: g.player.pos(), inCar: !!S.inCar,
    drawn: S.drawn, time: Math.round(S.time * 10) / 10,
    mission: { active: g.missions.M.active, idx: g.missions.M.idx, stage: g.missions.M.stage },
    objective: g.missions.currentObjective(),
    policeCount: g.police.cars.length,
  }),
};
