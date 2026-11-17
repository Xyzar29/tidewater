// Deterministic screenshot scenes for ?shot=<name>&seed=1. Each scene
// stages a real moment from the game's own systems — a mission start, a
// staged patrol, the warehouse crew — then lets the simulation run for a
// few seconds so traffic, pedestrians and cameras settle naturally.
// main.js polls the clock; when the scene's time is up it calls finish()
// (the mission scene fires a shot for its muzzle flash) and raises
// window.__shotReady for the capture tool.

import { spawnCar } from './vehicles.js';
import { enterCar, teleport } from './player.js';
import { buildFigure } from './pedestrians.js';
import { tryShoot } from './combat.js';

function stagePed(G, x, z, axis, fixed) {
  const mesh = buildFigure(0xffd23e, 0x2e3a4a, 0xf2c79b);
  mesh.position.set(x, G.city.groundY(x, z), z);
  G.scene.add(mesh);
  G.peds.push({
    mesh, x, z, heading: 0, speed: 0, axis, fixed,
    target: null, phase: G.rng.range(0, 6), state: 'walk',
    fleeT: 0, health: 30, dead: false, fallT: 0,
  });
}

function stageTraffic(G, x, z, from, to) {
  const car = spawnCar(G, {
    type: 'sedan', color: 0x3d7bd9, x, z,
    heading: Math.atan2(to.x - from.x, to.z - from.z), kind: 'traffic',
  });
  car.occupant = 'ai';
  car.ai.from = from; car.ai.to = to; car.ai.pauseT = 0; car.ai.cruise = 10.5;
  return car;
}

function stageCop(G, x, z, heading, speed) {
  const car = spawnCar(G, { type: 'police', color: 0xf2f0eb, x, z, heading, kind: 'police' });
  car.occupant = 'ai';
  car.speed = speed;
  G.police.cars.push(car);
  return car;
}

export function initShot(G, name) {
  const p = G.player;
  G.money = 120;
  let duration = 3, finish = null;

  if (name === 'cover') {
    // Downtown, mid-mission: Mari driving Dario's first run north through
    // traffic, objective and timer on the HUD, Dario's line still up.
    const car = spawnCar(G, { type: 'sedan', color: 0xf2f0eb, x: 3.6, z: 88, heading: Math.PI, kind: 'parked' });
    car.stolen = true; // the cover car is hers for this run — no heat
    enterCar(G, car);
    G.missions.startMission(0);
    stageTraffic(G, -3.6, 30, { x: 0, z: 56 }, { x: 0, z: 112 });
    stageTraffic(G, 3.6, 6, { x: 0, z: 56 }, { x: 0, z: 0 });
    stagePed(G, -10, 18, 'z', -10);
    stagePed(G, 10, 2, 'z', 10);
    G.input.keys.add('KeyW');
    duration = 4;
  } else if (name === 'onfoot') {
    // Beachfront on foot: Mari among the strollers, palms and the sea
    // behind her, the next job's dialogue on screen.
    G.missions.done = 1;
    teleport(G, -38, 210);
    p.heading = Math.PI * 0.92;
    G.input.camYaw = Math.PI * 0.08;
    spawnCar(G, { type: 'sports', color: 0xffd21f, x: -44, z: 200, heading: Math.PI / 2, kind: 'parked' });
    stagePed(G, -30, 206, 'x', 216);
    stagePed(G, -48, 214, 'x', 216);
    stagePed(G, -24, 220, 'z', -20);
    stagePed(G, -52, 204, 'z', -64);
    G.hud.dialogue('Dario Fuentes', 'Mari — the yellow sports car by the Serena Hotel. Bring it home.', 30);
    duration = 2.6;
  } else if (name === 'chase') {
    // Four stars, three patrol cars already on her tail, more inbound.
    const car = spawnCar(G, { type: 'sedan', color: 0xf2f0eb, x: 3.6, z: 128, heading: Math.PI, kind: 'parked' });
    car.stolen = true;
    enterCar(G, car);
    car.speed = 16;
    G.police.setStarsAtLeast(4);
    // Pursuit AI brakes in convoy and falls out of the chase camera's
    // ~10 m band, so the visible units are a roadblock staged across
    // the road ahead (parked cars the AI never moves), plus one live
    // tail unit working the minimap behind her.
    spawnCar(G, { type: 'police', color: 0xf2f0eb, x: -2, z: 54, heading: 0.9, kind: 'parked' });
    spawnCar(G, { type: 'police', color: 0xf2f0eb, x: 7, z: 49, heading: -0.7, kind: 'parked' });
    stageCop(G, -2, 140, Math.PI, 17);
    G.input.keys.add('KeyW');
    duration = 3.2;
  } else if (name === 'mission') {
    // Cold Trail staged: pistol out, the rival crew in the warehouse yard,
    // objective and countdown running. finish() pulls the trigger so the
    // captured frame catches the muzzle flash and tracer.
    teleport(G, 214, 68);
    p.heading = Math.PI / 2;
    G.input.camYaw = Math.PI / 2;
    G.missions.startMission(4);
    if (!G.combat.drawn) G.combat.toggleDraw();
    p.health = 82;
    duration = 2.2;
    finish = () => { p.health = 82; tryShoot(G); };
  } else {
    return null;
  }
  return { t: 0, duration, finish };
}
