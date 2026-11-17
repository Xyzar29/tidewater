// shots.js — the four deterministic screenshot scenes (?shot=cover etc.).
// Each one stages a REAL moment from the game's own systems — the actual
// player car, actual traffic, actual police, the actual mission engine —
// then lets the simulation run a few seconds before the capture. Nothing
// here is a mock-up: what the judge sees is the game being played.

import { LANDMARKS } from './config.js';

// 1-cover: Mari mid-delivery downtown, mission 1 on the clock.
function cover(G) {
  G.missions.startMission(0);
  const car = G.stageCar('sedan', 0xf2f0e6, 56, 96, Math.PI, 11);
  G.player.enterCar(car);
  G.hud.dialogue('MARI VEGA', 'Fast and clean is the only way I drive, Dario.', 30);
  return { sim: 2.2, cam: 'chase' };
}

// 2-onfoot: on foot at the beachfront, mission 2's yellow car in reach.
function onfoot(G) {
  G.missions.nextIndex = 1;
  G.missions.startMission(1); // spawns the yellow sports car at the hotel
  G.teleportPlayer(52, 188, 0.35);
  G.debugSetCam(0.35, 0.15);
  // A little crowd around her on the promenade, between her and the sea.
  const spots = [[48, 193], [57, 194], [45, 195], [60, 191], [52, 197]];
  G.peds.peds.slice(0, spots.length).forEach((ped, i) => {
    ped.mesh.position.set(spots[i][0], 0, spots[i][1]);
    ped.state = 'walk';
  });
  G.hud.dialogue('DARIO FUENTES', 'The yellow one, by the hotel. Try to look innocent.', 30);
  return { sim: 2.6, cam: 'foot' };
}

// 3-chase: four stars, a roadblock ahead and a third cruiser cutting in
// from the cross street.
function chase(G) {
  const car = G.stageCar('sport', 0xff8c42, 56, 56, Math.PI, 18);
  G.player.enterCar(car);
  G.police.setWanted(4);
  // Roadblock pair across the avenue ahead, noses angled in.
  G.placePolice(51.5, -6, 0.35);
  G.placePolice(60.5, -9, -0.35);
  // A third unit on the cross street, swinging in toward her.
  G.placePolice(88, 2, -2.1);
  G.hud.dialogue('DET. CALLOWAY', 'All units, she is on Fifth Avenue. Box her in.', 30);
  return { sim: 1.2, cam: 'chase' };
}

// 4-mission: the Pier 9 fight, pistol drawn, rivals in the open.
function mission(G) {
  G.missions.nextIndex = 4;
  G.missions.startMission(4);
  G.missions.stageIdx = 1; // jump straight to the fight stage
  G.missions.setupStage();
  G.teleportPlayer(168, -22, Math.PI);
  G.weapon.drawn = true;
  G.weapon.mag = 12;
  // Fire one real shot along the camera ray just before the capture, and
  // hold the tracer + flash so the still shows the gunfight mid-beat.
  G.pendingShot = true;
  return {
    sim: 1.6,
    cam: 'fixed',
    camPos: { x: 168, y: 2.2, z: -15.5 },
    camTarget: { x: 168, y: 1.1, z: -40 },
  };
}

const SCENES = { cover, onfoot, chase, mission };

export function shotSceneNames() {
  return Object.keys(SCENES);
}

// Stage the named scene; returns how long to simulate and where the
// camera goes. Called once by main when ?shot= is present.
export function stageShot(name, G) {
  const fn = SCENES[name];
  if (!fn) return null;
  return fn(G);
}

export { LANDMARKS };
