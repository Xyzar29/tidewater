// TIDEWATER — boot, screen state machine, fixed-step loop wiring all systems.
// Marisol "Mari" Vega's Port Serena: city, traffic, peds, police, combat,
// missions, HUD, minimap, audio and saves — one deterministic 60 Hz world.

import { PLAYER, PRICES } from './config.js';
import { createRNG, parseSeed } from './random.js';
import { buildCity } from './city.js';
import { TrafficSystem } from './traffic.js';
import { PedSystem } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionSystem } from './missions.js';
import { HUD } from './hud.js';
import { drawMinimap } from './minimap.js';
import { AudioSys } from './audio.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';
import { setupShot } from './shots.js';

const seed = parseSeed();
const rng = createRNG(seed * 7919 + 13);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.className = 'webgl';
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffc98a);
scene.fog = new THREE.Fog(0xffc98a, 90, 260);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 6, -12);

const hemi = new THREE.HemisphereLight(0xfff2d8, 0x5b7d94, 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb066, 1.15);
sun.position.set(-60, 55, 80); scene.add(sun);
const amb = new THREE.AmbientLight(0xffe3b3, 0.35); scene.add(amb);

// ---------- world systems ----------
const city = buildCity(scene, rng);
const traffic = new TrafficSystem(scene, rng, city.colliders);
const peds = new PedSystem(scene, rng, city.colliders);
const player = new Player(scene, { x: PLAYER.startPos.x, z: PLAYER.startPos.z });
// hero visual anchor follows the Player (mesh already added by Player)
const police = new PoliceSystem(scene, city.colliders);
const audio = new AudioSys();
const combat = new CombatSystem(scene, audio);
const hud = new HUD();
const missions = new MissionSystem(scene, city.landmarks, hud, audio);
const minimapCanvas = document.getElementById('minimap');

// gun prop on the hero
const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x181a1d }));
gunMesh.position.set(0.36, 1.15, 0.25); gunMesh.visible = false; player.mesh.add(gunMesh);

// ---------- input ----------
const input = { keys: {} };
let pointerLocked = false;
window.addEventListener('keydown', e => {
  input.keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
  handleKey(e.key.toLowerCase());
});
window.addEventListener('keyup', e => { input.keys[e.key.toLowerCase()] = false; });
renderer.domElement.addEventListener('click', () => {
  audio.ensure();
  if (state === 'playing') {
    if (!pointerLocked) renderer.domElement.requestPointerLock();
    attack();
  }
});
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === renderer.domElement; });
document.addEventListener('mousemove', e => {
  if (state !== 'playing') return;
  if (pointerLocked) {
    player.yaw -= e.movementX * 0.0026;
    player.pitch = Math.max(-0.15, Math.min(0.65, player.pitch + e.movementY * 0.002));
  }
});
renderer.domElement.addEventListener('contextmenu', e => { e.preventDefault(); if (state === 'playing') toggleGun(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- game state ----------
let state = 'menu'; // menu | playing | paused | busted | wasted | end
let lastCar = null;
let saveTimer = 0;

const screens = { menu: 'menuScreen', paused: 'pauseScreen', busted: 'bustedScreen', wasted: 'wastedScreen', end: 'endScreen' };
function showScreen(name) {
  for (const id of Object.values(screens)) document.getElementById(id).classList.add('hidden');
  document.getElementById('hud').style.display = (name === null || name === 'playing') ? 'block' : 'none';
  if (name && screens[name]) document.getElementById(screens[name]).classList.remove('hidden');
  if (name === 'menu') document.getElementById('hud').style.display = 'none';
}

const ctx = {
  player, police, combat, traffic, hud,
  addMoney(n) { player.money += n; },
  save() { persist(); },
  onStoryEnd() { setState('end'); showScreen('end'); },
};
combat.onCrime = kind => { police.commitCrime(kind); peds.scare(player.pos.x, player.pos.z, 12); };
combat.onKill = t => { if (!t.isEnemy) police.commitCrime('assault'); };
police.onBusted = () => { if (state === 'playing') { setState('busted'); showScreen('busted'); } };

function persist() {
  saveGame({ money: player.money, nextIndex: missions.nextIndex, x: player.pos.x, z: player.pos.z, health: player.health });
}
function setState(s) { state = s; }

function startGame(fromSave) {
  audio.ensure();
  if (fromSave) {
    const s = loadGame();
    if (s) { player.money = s.money; missions.nextIndex = s.nextIndex || 0; player.x = s.x; player.z = s.z; player.health = s.health || 100; }
  }
  setState('playing'); showScreen('playing');
  hud.notify(missions.nextIndex > 0 ? 'Welcome back to Port Serena, Mari.' : 'Port Serena — find Dario\'s marker to start work.', 4200);
}
function newGame() { clearSave(); player.money = PLAYER.startMoney; player.health = 100; missions.nextIndex = 0; player.x = PLAYER.startPos.x; player.z = PLAYER.startPos.z; startGame(false); }

function respawnAtHospital(fee) {
  player.money = Math.max(0, player.money - fee);
  player.health = 100; police.clear();
  if (player.mode === 'car') player.exitCar();
  player.x = city.landmarks.hospital.x + 10; player.z = city.landmarks.hospital.z + 10;
  setState('playing'); showScreen('playing'); persist();
}

function handleKey(k) {
  if (k === 'm') { const m = audio.toggleMute(); hud.notify(m ? 'Muted' : 'Sound on', 1200); return; }
  if (state === 'playing') {
    if (k === 'escape' || k === 'p') { setState('paused'); showScreen('paused'); document.getElementById('pauseStats').textContent = 'Money $' + Math.floor(player.money) + ' · Missions done: ' + missions.nextIndex + '/6 · Wanted: ' + police.stars + ' stars'; if (document.exitPointerLock) document.exitPointerLock(); }
    else if (k === 'e') tryEnterExit();
    else if (k === 'f') { if (player.mode === 'foot') combat.melee(player, peds.peds); }
    else if (k === 'q') toggleGun();
    else if (k === 'r') { combat.reload(); hud.notify('Reloaded', 900); }
  } else if (state === 'paused' && (k === 'escape' || k === 'p')) { setState('playing'); showScreen('playing'); }
}
function toggleGun() { combat.gunOut = !combat.gunOut; gunMesh.visible = combat.gunOut && player.mode === 'foot'; }
function attack() {
  if (player.mode !== 'foot') return;
  if (combat.gunOut) { const hit = combat.shoot(player, camera, peds.peds, traffic.cars); if (hit) hud.notify('Hit!', 700); }
  else combat.melee(player, peds.peds);
}
function tryEnterExit() {
  if (player.mode === 'car') { lastCar = player.exitCar(); gunMesh.visible = combat.gunOut; return; }
  let best = null, bd = 3.4;
  for (const c of traffic.cars) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  for (const c of police.cars) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  if (missions.van) { const d = Math.hypot(missions.van.x - player.x, missions.van.z - player.z); if (d < bd) { bd = d; best = missions.van; } }
  if (best) {
    const wasParked = best.parked;
    player.enterCar(best); gunMesh.visible = false;
    if (wasParked && best !== lastCar) { police.commitCrime('theft'); hud.notify('Vehicle stolen!', 1800); }
    audio.ensure();
  }
}

// ---------- per-step update ----------
let elapsed = 0;
function step(dt) {
  elapsed += dt;
  if (state !== 'playing') { renderer.render(scene, camera); return; }
  player.update(dt, input, city.colliders, camera);
  traffic.update(dt, player.pos);
  const danger = { x: player.pos.x, z: player.pos.z, fast: player.mode === 'car' && player.car && Math.abs(player.car.speed) > 9 };
  peds.update(dt, danger, elapsed);
  police.update(dt, player, elapsed);
  combat.update(dt, player);
  missions.update(dt, ctx);
  city.update(dt, elapsed);

  // car vs pedestrian + car vs car consequences while driving
  if (player.mode === 'car' && player.car) {
    const c = player.car;
    if (Math.abs(c.speed) > 5) {
      for (const p of peds.peds) {
        if (p.dead) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 1.9) { p.health = 0; p.dead = true; police.commitCrime('hitPed'); hud.notify('Pedestrian hit!', 1500); }
      }
    }
    for (const o of traffic.cars) {
      if (o === c) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < 3.4 && Math.abs(c.speed) > 4) { o.speed = c.speed * 0.4; c.speed *= 0.55; if (Math.random() < 0.3) police.commitCrime('hitCar'); }
    }
  }
  // player death
  if (player.health <= 0) { setState('wasted'); showScreen('wasted'); if (document.exitPointerLock) document.exitPointerLock(); }

  // audio + HUD
  audio.setEngine(player.speedRatio, player.mode === 'car');
  audio.setSiren(police.stars > 0 && police.cars.length > 0);
  let prompt = '';
  if (player.mode === 'foot') {
    for (const c of traffic.cars) { if (Math.hypot(c.x - player.x, c.z - player.z) < 3.4) { prompt = 'Press E — ' + (c.parked ? 'steal car' : 'enter car'); break; } }
  } else prompt = 'Press E — exit car';
  const timerText = missions.active && missions.timer > 0 ? '⏱ ' + Math.ceil(missions.timer) + 's' : '';
  hud.update({ health: player.health, money: player.money, stars: police.stars, objective: missions.objectiveText(), timerText, busted: police.busted, ammo: combat.ammo, gunOut: combat.gunOut, prompt });
  drawMinimap(minimapCanvas, { player: { x: player.pos.x, z: player.pos.z }, heading: player.headingNow, traffic: traffic.cars, police: police.cars, marker: missions.markerPos() });

  saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; persist(); }
  renderer.render(scene, camera);
}

// fixed-timestep loop (60 Hz simulation)
let last = performance.now(), acc = 0; const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
}
requestAnimationFrame(frame);

// ---------- menu wiring ----------
document.getElementById('newGameBtn').addEventListener('click', newGame);
document.getElementById('continueBtn').addEventListener('click', () => startGame(true));
document.getElementById('resumeBtn').addEventListener('click', () => { setState('playing'); showScreen('playing'); });
document.getElementById('restartBtn').addEventListener('click', () => { newGame(); });
document.getElementById('bustedBtn').addEventListener('click', () => respawnAtHospital(PRICES.bustedFine));
document.getElementById('wastedBtn').addEventListener('click', () => respawnAtHospital(PRICES.hospitalFee));
document.getElementById('endBtn').addEventListener('click', () => { setState('playing'); showScreen('playing'); });
if (hasSave()) document.getElementById('continueBtn').classList.remove('hidden');
showScreen('menu');

// ---------- test / shot hooks ----------
const game = {
  player, police, missions, traffic, combat, peds, city, hud, audio, ctx, camera, scene,
  startGame: silent => { if (silent === true) { setState('playing'); showScreen('playing'); } else startGame(false); },
  get state() { return state; },
  setState,
};
window.__game = game;
const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) setupShot(game, shotName);
