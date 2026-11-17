// shots.js — the four staged scenes behind ?shot=<name>&seed=1.
//
// Each scene is built from the game's own systems (real cars, real police,
// the real mission runner), never from mock-ups: the cover is mission 1
// mid-drive, the chase is a live 4-star pursuit with a staged roadblock,
// the mission shot is Cold Trail's warehouse fight with a real enemy
// tracer in the air. The scene simulates a few seconds of game time, then
// main.js raises window.__shotReady for the screenshot tooling.
//
// Note the boot rule: a shot scene goes straight into the playing state —
// the title screen must never cover a staged scene.

import { createCar } from './vehicles.js';
import { enterCar } from './player.js';
import { setWanted } from './police.js';
import { startMission, forceStage } from './missions.js';
import { enemyShoot } from './combat.js';
import { LANDMARKS } from './config.js';

function beginPlay(G) {
  G.state = 'playing';
  const title = document.getElementById('title-screen');
  if (title) title.style.display = 'none';
}

// Put Mari in a fresh car that the game won't treat as stolen.
function stageCar(G, type, colour, x, z, heading, speed) {
  const car = createCar(G, type, colour, x, z, heading, 'none');
  car.stolen = true;
  enterCar(G, car);
  car.speed = speed;
  G.camPos.set(x - Math.sin(heading) * 9, 3.4, z - Math.cos(heading) * 9);
  return car;
}

// A driver for staged scenes: hold a speed, aim at a point far ahead.
function holdRoad(G, car, laneX, speed) {
  G.shotUpdate = () => {
    const target = { x: laneX, z: car.z + 60 * Math.cos(car.heading) };
    const desired = Math.atan2(target.x - car.x, target.z - car.z);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.input.steer = Math.max(-1, Math.min(1, diff * 2));
    car.input.throttle = car.speed < speed ? 0.85 : 0;
    car.input.brake = car.speed > speed + 2;
  };
}

// Walk a few pedestrians over to where the camera will be.
function scatterPeds(G, x, z, n) {
  for (let i = 0; i < n && i < G.peds.length; i++) {
    const ped = G.peds[i * 3];
    if (!ped || ped.dead) continue;
    ped.x = x + G.rng.range(-9, 9);
    ped.z = z + G.rng.range(-9, 9);
    ped.mesh.position.set(ped.x, 0.1, ped.z);
  }
}

export function stageShot(G, name) {
  beginPlay(G);
  const p = G.player;

  if (name === 'cover') {
    // Downtown, golden hour, mid-mission-1: Mari driving south on the
    // central avenue, package bound for the marina, traffic around her.
    const car = stageCar(G, 'sedan', 0xe8e4da, -4.5, -64, 0, 10);
    startMission(G, 0);
    holdRoad(G, car, -4.5, 10);
    scatterPeds(G, -12, -30, 3);
    G.shotSimSeconds = 2.6;
  } else if (name === 'onfoot') {
    // Beachfront on foot: Mari by the Serena Hotel, the yellow job car in
    // view, palms and the sea behind her, Dario's line on screen.
    p.x = 255; p.z = -44;
    p.heading = Math.PI + 0.55; // face away, toward the job car
    p.mesh.position.set(p.x, 0.1, p.z);
    p.mesh.rotation.y = p.heading;
    G.camYaw = 0.55;          // look south-east: job car ahead, sea beyond
    G.camPitch = 0.3;
    G.camPos.set(p.x - Math.sin(G.camYaw) * 5.6, 2.4, p.z - Math.cos(G.camYaw) * 5.6);
    startMission(G, 1);       // "Hot Wheels": beacon sits on the sports car
    scatterPeds(G, 262, -34, 4);
    G.shotSimSeconds = 2.2;
  } else if (name === 'chase') {
    // A live 4-star pursuit: a roadblock pair staged across the avenue
    // ahead, one cruiser in live pursuit on her tail, two more inbound.
    const car = stageCar(G, 'sedan', 0xd64545, 79.5, 26, 0, 13);
    setWanted(G, 4);
    const blockA = createCar(G, 'police', 0x1d2733, 74, 80, 0.85, 'police');
    blockA.ai = { mode: 'staged' };
    const blockB = createCar(G, 'police', 0x1d2733, 87, 85, -0.7, 'police');
    blockB.ai = { mode: 'staged' };
    // The tail unit runs a fixed slot in the next lane, abreast of her
    // rear quarter. A free pursuer always ends its approach on her bumper
    // — exactly where the camera sits — and hides the hero car, so the
    // slot is driven from here instead of by the pursuit AI.
    const tail = createCar(G, 'police', 0x1d2733, 88.5, 17, 0, 'police');
    tail.ai = { mode: 'staged' };
    tail.speed = 13;
    G.policeCars.push(blockA, blockB, tail);
    holdRoad(G, car, 79.5, 13);
    const drivePlayer = G.shotUpdate;
    G.shotUpdate = () => {
      drivePlayer();
      const slot = { x: 88.5, z: car.z + 5 };
      const desired = Math.atan2(slot.x - tail.x, slot.z - tail.z);
      let diff = desired - tail.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      tail.input.steer = Math.max(-1, Math.min(1, diff * 2));
      tail.input.throttle = tail.speed < 13.5 ? 0.85 : 0;
      tail.input.brake = tail.speed > 15;
    };
    G.shotSimSeconds = 2.4;
  } else if (name === 'mission') {
    // Cold Trail, mid-fight: Mari at the warehouse yard, pistol drawn,
    // four rivals in front of her — and one of them fires during the
    // scene so a tracer and muzzle flash are in the air at capture time.
    const W = LANDMARKS.warehouse;
    p.x = W.x + 6; p.z = W.z + 50;
    p.heading = Math.PI;      // face north, into the yard
    p.mesh.position.set(p.x, 0.1, p.z);
    p.mesh.rotation.y = p.heading;
    G.camYaw = Math.PI;
    G.camPitch = 0.3;
    G.camPos.set(p.x, 2.6, p.z + 5.6);
    startMission(G, 4);
    forceStage(G, 4, 1);      // the fight itself
    G.combat.drawn = true;
    let fired = false;
    G.shotUpdate = () => {
      if (!fired && G.time > 2.1) {
        fired = true;
        const e = G.enemies.find((en) => !en.dead);
        if (e) {
          e.heading = Math.atan2(p.x - e.x, p.z - e.z);
          enemyShoot(G, e);
        }
        G.shotReadyAt = G.time + 0.05; // capture while the tracer lives
      }
    };
    G.shotSimSeconds = 2.3;
  } else {
    // Unknown scene name: fall back to a calm free-roam frame at spawn.
    G.shotSimSeconds = 1.2;
  }
}
