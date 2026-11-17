// missions.js — Dario's six-job story arc on a data-driven stage engine
// (goto / steal / collect / checkpoints / fight / pickup / rob / escape), the
// gold marker beam, free-roam cash pickups, and the "next job" garage marker
// that chains the story together.
import { S, LANDMARKS as L } from './config.js';
import { createCar } from './vehicles.js';
import { saveGame } from './save.js';

const MISSIONS = [
  {
    name: 'First Run', reward: 300,
    intro: [
      ['DARIO FUENTES', 'Package is in the back, Mari. Take it to the marina — and the clock is not your friend.'],
      ['MARI VEGA', 'When is it ever. On my way.'],
    ],
    outro: [['DARIO FUENTES', 'Clean run. There is more work where that came from.']],
    stages: [
      { type: 'goto', x: L.marina.x, z: L.marina.z, time: 150, text: 'Drive the package to the marina' },
    ],
  },
  {
    name: 'Hot Wheels', reward: 350,
    intro: [
      ['DARIO FUENTES', 'A yellow sports car is sitting at the Serena Hotel. Its owner owes me. Bring it to my garage.'],
    ],
    outro: [['DARIO FUENTES', 'Beautiful. She is mine now — and so is the debt.']],
    stages: [
      { type: 'steal', text: 'Steal the yellow sports car at the Serena Hotel', say: null },
      { type: 'goto', x: L.garage.x, z: L.garage.z, text: "Deliver the car to Dario's garage", say: ['MARI VEGA', 'That is the one. Now bring her home — carefully.'] },
    ],
  },
  {
    name: 'Night Deposit', reward: 450,
    intro: [
      ['DARIO FUENTES', 'Three cash bags walked off a boat at the docks tonight. Bring them back, then disappear.'],
    ],
    outro: [['DARIO FUENTES', 'Bags are home and nobody saw a thing. Good ghost work.']],
    stages: [
      { type: 'collect', points: [[112, 140], [170, 112], [112, 196]], text: 'Collect the cash bags at the docks' },
      { type: 'escape', x: L.safehouse.x, z: L.safehouse.z, text: 'Reach the safehouse', say: ['DET. CALLOWAY', 'All units, suspect has gone dark. Keep searching.'] },
    ],
  },
  {
    name: 'Harbor Lights', reward: 400,
    intro: [
      ['DARIO FUENTES', 'A client wants to see the whole city, fast. Hit every checkpoint — the PSPD will notice, ignore them.'],
    ],
    outro: [['DARIO FUENTES', 'Every light, green. The client is impressed.']],
    onStart(g) { g.police.setWanted(1); },
    stages: [
      { type: 'checkpoints', points: [[-120, -120], [120, -180], [180, 0], [60, 120], [-120, 60], [30, 180]], time: 200, text: 'Hit every checkpoint' },
    ],
  },
  {
    name: 'Cold Trail', reward: 600,
    intro: [
      ['DARIO FUENTES', 'Rivals are holding my briefcase at Pier 9. Ask them for it back — with the pistol I gave you.'],
      ['MARI VEGA', 'Then I will ask with the pistol you gave me.'],
    ],
    outro: [['DARIO FUENTES', 'Briefcase, no leaks, one legend growing. Rest now.']],
    stages: [
      { type: 'goto', x: L.warehouse.x, z: L.warehouse.z, text: 'Go to Pier 9 Warehouse' },
      { type: 'fight', text: 'Clear the rival crew', say: ['MARI VEGA', 'Four of them. Okay. Loud it is.'] },
      { type: 'pickup', x: 150, z: 142, text: 'Take the briefcase' },
      { type: 'goto', x: L.garage.x, z: L.garage.z, text: "Escape — bring the briefcase to Dario's garage" },
    ],
  },
  {
    name: 'Last Tide', reward: 1000,
    intro: [
      ['DARIO FUENTES', 'Last job. The casino van sits at the kerb — rob it, and a boat waits at the marina. Then we are even.'],
    ],
    outro: [['DARIO FUENTES', 'We are even, Mari. Port Serena is yours now.']],
    stages: [
      { type: 'goto', x: L.casino.x, z: L.casino.z, text: 'Go to Casino Serena' },
      { type: 'rob', text: 'Rob the armoured van', say: ['MARI VEGA', 'Nice and easy. Nobody move.'] },
      { type: 'goto', x: L.boat.x, z: L.boat.z, text: 'Escape to the boat at the marina', say: ['DET. CALLOWAY', 'All units — do not let her reach the water.'] },
    ],
  },
];

const PICKUP_SPOTS = [
  [-125, -35], [-35, -125], [65, 35], [125, -95], [-95, 65], [35, 95],
  [155, -35], [-155, -95], [95, 155], [-35, 155], [185, 65], [-185, -155],
];

export function createMissions(g) {
  const M = {
    active: false, idx: 0, stage: 0, timer: null,
    bags: [], cpIdx: 0, van: null, robT: 0, briefcase: null,
    hotelCar: null, objective: { text: '', x: null, z: null, timer: null },
    pickups: [],
  };

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 64, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 32;
  g.scene.add(beam);

  // the yellow sports car waits at the hotel from the very start
  const hotelCar = createCar('sports', 0xffd21f);
  hotelCar.driver = 'parked';
  hotelCar.mesh.position.set(L.hotelCar.x, 0, L.hotelCar.z);
  hotelCar.heading = Math.PI / 2; hotelCar.mesh.rotation.y = Math.PI / 2;
  g.scene.add(hotelCar.mesh); g.cars.push(hotelCar);
  M.hotelCar = hotelCar;

  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.16, 14);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0x6a4d00 });
  for (const [x, z] of PICKUP_SPOTS) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 0.95, z);
    g.scene.add(mesh);
    M.pickups.push({ mesh, taken: false, respawnT: 0 });
  }

  function say(lines) {
    if (!lines) return;
    for (const [who, text] of lines) g.hud.showDialogue(who, text, 4.2);
  }
  function cleanupStage() {
    for (const b of M.bags) g.scene.remove(b.mesh);
    M.bags = [];
    if (M.briefcase) { g.scene.remove(M.briefcase); M.briefcase = null; }
  }
  function enterStage() {
    cleanupStage();
    const sd = MISSIONS[M.idx].stages[M.stage];
    M.timer = sd.time || null;
    M.cpIdx = 0; M.robT = 0;
    if (sd.say) say([sd.say]);
    if (sd.type === 'collect') {
      for (const [x, z] of sd.points) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.42),
          new THREE.MeshLambertMaterial({ color: 0x3f7a3a, emissive: 0x0d2a0d }));
        mesh.position.set(x, 0.5, z);
        g.scene.add(mesh);
        M.bags.push({ mesh, got: false });
      }
    } else if (sd.type === 'fight') {
      g.combat.spawnSquad([[142, 140], [158, 140], [146, 147], [154, 147]]);
    } else if (sd.type === 'pickup') {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.58),
        new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
      mesh.position.set(sd.x, 0.45, sd.z);
      g.scene.add(mesh);
      M.briefcase = mesh;
    } else if (sd.type === 'rob') {
      if (!M.van) {
        const van = createCar('armoured', 0x707a84);
        van.driver = 'parked';
        van.mesh.position.set(L.vanSpot.x, 0, L.vanSpot.z);
        van.heading = Math.PI / 2; van.mesh.rotation.y = Math.PI / 2;
        g.scene.add(van.mesh); g.cars.push(van);
        M.van = van;
      }
    }
  }
  function completeStage() {
    M.stage++;
    if (M.stage >= MISSIONS[M.idx].stages.length) completeMission();
    else enterStage();
  }
  function completeMission() {
    const def = MISSIONS[M.idx];
    M.active = false;
    cleanupStage();
    g.combat.clearSquad();
    S.money += def.reward;
    S.missionIndex = M.idx + 1;
    say(def.outro);
    g.audioSfx('sting');
    saveGame(g);
    if (M.idx === MISSIONS.length - 1) g.showEnding();
    else g.showComplete(def.name, def.reward);
  }
  function failMission() {
    M.active = false;
    cleanupStage();
    g.combat.clearSquad();
    g.hud.showDialogue('DARIO FUENTES', 'Too slow, Mari. Come back to the garage and we run it again.', 4.5);
    g.hud.notify('Mission failed');
  }

  const api = {
    M,
    missionDefs: MISSIONS,
    fightActive() {
      return M.active && MISSIONS[M.idx].stages[M.stage].type === 'fight';
    },
    startMission(idx) {
      M.active = true; M.idx = idx; M.stage = 0;
      const def = MISSIONS[idx];
      say(def.intro);
      if (def.onStart) def.onStart(g);
      enterStage();
    },
    debugSetStage(n) {
      if (!M.active) return;
      M.stage = n;
      enterStage();
    },
    currentObjective() { return M.objective; },
    currentTarget() {
      return M.objective.x === null ? null : { x: M.objective.x, z: M.objective.z };
    },
    update(dt) {
      const pp = g.player.pos();
      // free-roam cash pickups
      for (const p of M.pickups) {
        if (p.taken) {
          p.respawnT -= dt;
          if (p.respawnT <= 0) { p.taken = false; p.mesh.visible = true; }
          continue;
        }
        p.mesh.rotation.z += dt * 2.4;
        if (Math.hypot(pp.x - p.mesh.position.x, pp.z - p.mesh.position.z) < 2.3) {
          p.taken = true; p.mesh.visible = false; p.respawnT = 45;
          S.money += 25;
          g.audioSfx('pickup');
          g.hud.notify('+$25');
        }
      }
      let target = null, text = '', timer = null;
      if (!M.active) {
        if (S.missionIndex < MISSIONS.length) {
          target = { x: L.garage.x, z: L.garage.z };
          text = 'Meet Dario at his garage';
          if (Math.hypot(pp.x - target.x, pp.z - target.z) < 5 && S.screen === 'playing') {
            api.startMission(S.missionIndex);
          }
        } else {
          text = 'Free roam — Port Serena is yours';
        }
      } else {
        const sd = MISSIONS[M.idx].stages[M.stage];
        text = sd.text; timer = M.timer;
        if (M.timer !== null) {
          M.timer -= dt;
          if (M.timer <= 0) { failMission(); return; }
        }
        const distTo = (x, z) => Math.hypot(pp.x - x, pp.z - z);
        if (sd.type === 'goto') {
          target = { x: sd.x, z: sd.z };
          if (distTo(sd.x, sd.z) < 9) completeStage();
        } else if (sd.type === 'steal') {
          target = { x: M.hotelCar.mesh.position.x, z: M.hotelCar.mesh.position.z };
          if (S.inCar === M.hotelCar) completeStage();
        } else if (sd.type === 'collect') {
          let nearest = null, nd = Infinity, left = 0;
          for (const b of M.bags) {
            if (b.got) continue;
            left++;
            const d = distTo(b.mesh.position.x, b.mesh.position.z);
            if (d < nd) { nd = d; nearest = b; }
            if (d < 3.2) {
              b.got = true; g.scene.remove(b.mesh);
              g.audioSfx('pickup');
              g.hud.notify('Cash bag recovered');
              if (S.wanted < 2) g.police.setWanted(2);
            }
          }
          if (nearest) target = { x: nearest.mesh.position.x, z: nearest.mesh.position.z };
          text = `Collect the cash bags at the docks (${M.bags.filter(b => b.got).length}/3)`;
          if (left === 0) completeStage();
        } else if (sd.type === 'checkpoints') {
          const cp = sd.points[M.cpIdx];
          if (cp) {
            target = { x: cp[0], z: cp[1] };
            text = `Hit every checkpoint (${M.cpIdx}/${sd.points.length})`;
            if (distTo(cp[0], cp[1]) < 7.5) {
              M.cpIdx++;
              S.money += 10;
              g.audioSfx('pickup');
              if (M.cpIdx >= sd.points.length) completeStage();
            }
          }
        } else if (sd.type === 'fight') {
          target = { x: 150, z: 142 };
          text = `Clear the rival crew (${4 - g.combat.aliveCount()}/4)`;
          if (g.combat.aliveCount() === 0) completeStage();
        } else if (sd.type === 'pickup') {
          target = { x: sd.x, z: sd.z };
          if (distTo(sd.x, sd.z) < 2.6) completeStage();
        } else if (sd.type === 'rob') {
          target = { x: M.van.mesh.position.x, z: M.van.mesh.position.z };
          if (distTo(target.x, target.z) < 9) {
            M.robT += dt;
            text = `Rob the armoured van (${Math.min(99, Math.floor(M.robT / 5 * 100))}%)`;
            if (M.robT >= 5) {
              S.money += 400;
              g.reportCrime('rob');
              g.police.setWanted(4);
              completeStage();
            }
          }
        } else if (sd.type === 'escape') {
          target = { x: sd.x, z: sd.z };
          if (S.wanted > 0) text = 'Lose the heat, then reach the safehouse';
          else if (distTo(sd.x, sd.z) < 8) completeStage();
        }
      }
      M.objective = { text, x: target ? target.x : null, z: target ? target.z : null, timer };
      beam.visible = !!target && S.screen !== 'title';
      if (target) beam.position.set(target.x, 32, target.z);
    },
  };
  return api;
}
