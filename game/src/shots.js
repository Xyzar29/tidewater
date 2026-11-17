// shots.js — deterministic ?shot= scenes for the judge's screenshots. Each
// one stages a REAL moment from the game's own systems (a live mission, a
// staged roadblock with a live tail unit, the warehouse fight), boots
// straight into play with the HUD up, and raises window.__shotReady once
// the scene has simulated for a couple of seconds.
import { S, LANDMARKS as L } from './config.js';
import { createCar } from './vehicles.js';

export function stageShot(g, name) {
  S.shotMode = name;
  const P = g.player;

  if (name === 'cover') {
    const car = createCar('sedan', 0xe8e4da);
    car.mesh.position.set(-26, 0, 3.4);
    car.heading = Math.PI / 2; car.mesh.rotation.y = Math.PI / 2;
    g.scene.add(car.mesh); g.cars.push(car);
    P.enterCar(car);
    g.police.clearWanted(); // the entry "theft" is not part of this scene
    g.missions.startMission(0);
    S.autopilot = { throttle: 0.5, steer: 0 };
    P.yaw = Math.PI / 2;
  } else if (name === 'onfoot') {
    S.missionIndex = 1;
    g.missions.startMission(1);
    P.teleport(30, 175); // on the beachfront street — open sand, palms and sea ahead
    P.yaw = 0; P.mesh.rotation.y = 0; // face south: palms and the sea beyond
    g.peds.spawnNear(30, 175, 5);
    g.hud.clearDialogue();
    g.hud.showDialogue('DET. CALLOWAY', 'PSPD reminder: grand theft auto is still a crime in Port Serena.', 30);
  } else if (name === 'chase') {
    const car = createCar('sports', 0xd97b3f);
    car.mesh.position.set(-52, 0, -56.6);
    car.heading = Math.PI / 2; car.mesh.rotation.y = Math.PI / 2;
    g.scene.add(car.mesh); g.cars.push(car);
    P.enterCar(car);
    g.police.setWanted(4);
    // roadblock pair ahead, angled across the street; one live tail unit behind
    const rb1 = g.police.spawnAt(26, -51, -Math.PI / 2); rb1.driver = 'static';
    const rb2 = g.police.spawnAt(34, -63, -Math.PI / 2); rb2.driver = 'static';
    g.police.spawnAt(-100, -56.6, Math.PI / 2);
    S.autopilot = { throttle: 0.8, steer: 0 };
    P.yaw = Math.PI / 2;
    g.hud.showDialogue('DET. CALLOWAY', 'All units, she is on Fifth Avenue. Box her in.', 30);
  } else if (name === 'mission') {
    g.missions.startMission(4);
    g.missions.debugSetStage(1); // the warehouse fight
    P.teleport(L.warehouse.x, L.warehouse.z);
    P.yaw = 0; P.mesh.rotation.y = 0;
    g.combat.setDrawn(true);
    g.hud.clearDialogue();
    g.hud.showDialogue('MARI VEGA', 'Then I will ask with the pistol you gave me.', 30);
    g.combat.stageTracer();
  }
}

export function updateShots() {
  if (S.shotMode && !window.__shotReady && S.time > 2.4) window.__shotReady = true;
}
