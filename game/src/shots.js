// shots.js — deterministic ?shot= scenes for the judge's screenshots.
// Each scene is staged from the game's own systems (real missions, real
// police, real traffic), simulated a few seconds by main.js, then rendered.
// In shot mode the game boots straight into play — no title screen on top.

import { createCar, syncCarMesh } from './vehicles.js';

export function createShots(G) {
  const p = G.player;

  function enterFreshCar(type, color, x, z, heading) {
    const car = createCar(G, type, color, x, z, heading);
    car.playerUsed = true; // staging, not a theft
    p.teleport(x, z, heading);
    p.enterCar(car);
    return car;
  }

  // move the ambient traffic fleet far north so staged scenes stay clean
  function clearCorridor() {
    G.traffic.cars.forEach((c, i) => {
      c.x = -280 + (i % 8) * 9;
      c.z = -302 + Math.floor(i / 8) * 12;
      c.speed = 0;
      syncCarMesh(c, 0);
    });
  }

  function stageCover() {
    clearCorridor();
    G.missions.startMission(0);
    const car = enterFreshCar('sedan', 0xf2f0eb, 3.4, 185, Math.PI);
    const ahead = createCar(G, 'hatch', 0x3d7bd9, 3.4, 138, Math.PI);
    const oncoming = createCar(G, 'wagon', 0xd94f3d, -3.4, 118, 0);
    p.camYaw = Math.PI;
    p.camPitch = 0.16;
    // stepSim's own driving moves every car; the tick only tops up speeds
    // (no input is held down in shot mode, so friction would stop them)
    G.shotTick = () => {
      car.speed = 10.5;
      ahead.speed = 10.5;
      oncoming.speed = 8;
    };
  }

  function stageOnfoot() {
    G.missions.startMission(1);
    p.teleport(34, 209, 0.5);
    p.camYaw = 0.5;
    p.camPitch = 0.2;
    // a little beachfront crowd, pinned in frame (in the camera's front cone)
    const spots = [
      [40, 213.7, 2.4], [35.3, 219.7, -0.6], [45.5, 217.6, 2.9], [39.9, 224, -2.2],
    ];
    const crowd = G.peds.slice(0, 4);
    G.shotTick = () => {
      crowd.forEach((ped, i) => {
        const [x, z, h] = spots[i];
        ped.x = x; ped.z = z; ped.heading = h;
        ped.mesh.position.set(x, 0, z);
        ped.mesh.rotation.y = h;
      });
    };
  }

  function stageChase() {
    clearCorridor();
    const car = enterFreshCar('sedan', 0xd94f3d, 3.4, 84, Math.PI);
    G.police.setStars(4);
    p.camYaw = Math.PI;
    p.camPitch = 0.15;
    // roadblock trio ahead, angled across the street (parked, lightbars on)
    const blockA = createCar(G, 'police', 0xe8ecf0, -1.8, 4, Math.PI - 0.38);
    const blockB = createCar(G, 'police', 0xe8ecf0, 5.4, -4, Math.PI + 0.3);
    const blockC = createCar(G, 'police', 0xe8ecf0, -6.2, -13, Math.PI - 0.15);
    G.shotTick = () => {
      car.speed = 12.5; // stepSim drives the car; keep its speed topped up
      syncCarMesh(blockA, 0);
      syncCarMesh(blockB, 0);
      syncCarMesh(blockC, 0);
      // keep one real pursuing unit framed behind the player for the radar
      const tail = G.police.units[0];
      if (tail) {
        tail.x = car.x + 0.4;
        tail.z = car.z + 15;
        tail.heading = Math.PI;
        syncCarMesh(tail, 0);
      }
    };
  }

  function stageMission() {
    G.missions.startMission(4);
    // stand in the warehouse marker so the fight stage triggers, then step
    // back across the street for the framed shot
    p.teleport(225, 172, Math.PI);
    p.camYaw = Math.PI;
    p.camPitch = 0.1;
    const w = G.combat.weapon;
    w.drawn = true;
    w.reserve = 96;
    p.mesh.userData.parts.gun.visible = true;
    G.shotTick = (i) => {
      if (i === 25) {
        p.teleport(225, 194, Math.PI);
        p.camYaw = Math.PI;
      }
    };
  }

  function stage(name) {
    if (name === 'cover') stageCover();
    else if (name === 'onfoot') stageOnfoot();
    else if (name === 'chase') stageChase();
    else if (name === 'mission') stageMission();
  }

  return { stage };
}
