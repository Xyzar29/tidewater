// missions.js — Dario's six jobs: the story of TIDEWATER.
//
// A small stage runner. Each mission is a list of stages (drive somewhere,
// steal a specific car, collect the bags, lose the heat, clear the yard…)
// with intro dialogue, an objective line for the HUD, an optional countdown
// and a cash reward. Between missions Mari free-roams; a gold beacon at
// Dario's garage starts the next job. Timers that run dry, arrests and
// hospital trips fail the active job — it can always be retried.

import {
  LANDMARKS, STORY_MARKER, SPORTS_CAR_SPOT, BOAT_SPOT, CRIMES,
} from './config.js';
import { makeBeacon } from './city.js';
import { createCar } from './vehicles.js';
import { spawnEnemy, clearEnemies } from './combat.js';
import { setWanted, addHeat } from './police.js';

const M = LANDMARKS;

// The six jobs. Stage fields: kind, x/z, timer, say (dialogue on stage
// start), text (objective; a function of stage scratch where it counts).
export const MISSIONS = [
  {
    title: 'First Run', reward: 300,
    intro: [
      ['Dario Fuentes', 'Mari. Simple job: this package goes to the marina. Fast, clean, no questions.'],
      ['Mari Vega', 'Fast and clean is the only way I drive, Dario.'],
    ],
    stages: [
      { kind: 'goto', x: 318, z: 252, needCar: true, timer: 105,
        text: 'Drive the package to the marina' },
    ],
    outro: [['Dario Fuentes', 'Package received. You drive like you mean it. I have more work.']],
  },
  {
    title: 'Hot Wheels', reward: 450,
    intro: [
      ['Dario Fuentes', 'Mari — the yellow sports car by the Serena Hotel. Bring it home.'],
      ['Mari Vega', 'Stealing from tourists now? Classy.'],
    ],
    stages: [
      { kind: 'steal', text: 'Steal the yellow sports car at the Serena Hotel' },
      { kind: 'goto', x: M.garage.x, z: 188, carRef: 'sports',
        text: "Deliver the sports car to Dario's garage",
        say: [['Mari Vega', 'One star. Shake it or park it — garage first.']] },
    ],
    outro: [['Dario Fuentes', 'Beautiful. The buyer pays tonight; you eat tonight.']],
  },
  {
    title: 'Night Deposit', reward: 650,
    intro: [
      ['Dario Fuentes', 'Three cash bags walked off a boat at the docks. Bring them back.'],
      ['Dario Fuentes', 'And Mari — the PSPD watch the docks. Two stars if they spot you.'],
    ],
    stages: [
      { kind: 'collect', text: 'Collect the cash bags at the docks' },
      { kind: 'escape', text: 'Lose the police',
        say: [['Mari Vega', 'Heat is on. Break their line of sight.']] },
      { kind: 'goto', x: M.safehouse.x, z: 104, text: 'Reach your safehouse' },
    ],
    outro: [['Dario Fuentes', 'All three bags. Ruth Calloway is asking questions, but not about you. Yet.']],
  },
  {
    title: 'Harbor Lights', reward: 550,
    intro: [
      ['Dario Fuentes', 'A courier route, timed. Six lights around the harbor. Beat the clock.'],
      ['Mari Vega', 'And the one star of police attention?'],
      ['Dario Fuentes', 'Consider it ambience.'],
    ],
    stages: [
      { kind: 'checkpoints', timer: 160, text: 'Hit every checkpoint before the clock runs out' },
    ],
    outro: [['Dario Fuentes', 'Route proven. The harbor boys are impressed.']],
  },
  {
    title: 'Cold Trail', reward: 800,
    intro: [
      ['Dario Fuentes', 'A rival crew is holding my briefcase at the warehouse. Go on foot. Go ready.'],
      ['Mari Vega', 'Q draws your pistol, Dario. I know.'],
    ],
    stages: [
      { kind: 'goto', x: M.warehouse.x, z: 246, onFoot: true, text: 'Go to the Pier 9 warehouse on foot' },
      { kind: 'fight', text: 'Clear the rival crew at the warehouse',
        say: [['Rival Crew', 'Wrong warehouse, courier!']] },
      { kind: 'pickup', text: 'Grab the briefcase' },
      { kind: 'goto', x: M.garage.x, z: 188, text: "Escape to Dario's garage" },
    ],
    outro: [['Dario Fuentes', 'My briefcase, and a message sent. One last job after this, Mari. The big one.']],
  },
  {
    title: 'Last Tide', reward: 1500,
    intro: [
      ['Dario Fuentes', 'The casino van, Mari. Take it, survive Calloway, and reach the boat at the marina.'],
      ['Detective Calloway', 'PSPD! Vega, we know the car, the face, the boat. Give it up.'],
      ['Mari Vega', 'Then come and take it, Detective.'],
    ],
    stages: [
      { kind: 'goto', x: M.casino.x, z: -182, text: 'Go to the casino cash van' },
      { kind: 'robvan', text: 'Rob the armoured van',
        say: [['Mari Vega', 'Four stars. Now we find out how fast an armoured van goes.']] },
      { kind: 'goto', x: BOAT_SPOT.x, z: BOAT_SPOT.z, carRef: 'van', timer: 150,
        text: 'Reach the boat at the marina' },
    ],
    outro: [['Mari Vega', 'Tide is out, Dario. So am I. Port Serena is mine now.']],
  },
];

const CHECKPOINTS = [
  { x: 0, z: -168 }, { x: 168, z: -252 }, { x: 252, z: 0 },
  { x: 84, z: 168 }, { x: -84, z: 252 }, { x: -252, z: 84 },
];
const CASH_BAGS = [
  { x: 252, z: 196 }, { x: 196, z: 252 }, { x: 300, z: 150 },
];

export function initMissions(G) {
  G.mission = { active: false, idx: 0, stage: 0, timer: null, scratch: {}, failed: false };
  G.progress = { next: 0, done: false };
  G.beacon = makeBeacon(G, 0xffd166);
  G.smallBeacons = [makeBeacon(G, 0x7be495), makeBeacon(G, 0x7be495), makeBeacon(G, 0x7be495)];
  G.pickups = [];

  // The yellow sports car waits by the hotel from the very start.
  G.sportsCar = createCar(G, 'sports', 0xf7c948, SPORTS_CAR_SPOT.x, SPORTS_CAR_SPOT.z, SPORTS_CAR_SPOT.heading, 'parked');
  G.sportsCar.ai = { parked: true };

  // Free-roam cash: a little money for explorers, respawning slowly.
  const spots = [
    [-84, -60], [120, 84], [-190, -84], [84, -190], [230, 60],
    [-40, 250], [150, -120], [-250, 200],
  ];
  for (const [x, z] of spots) G.pickups.push(makePickup(G, x, z, 'cash'));
  G.objectiveText = '';
  G.objectiveTimer = null;
}

function makePickup(G, x, z, kind) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.55, 0.85),
    new THREE.MeshLambertMaterial({ color: kind === 'cash' ? 0x3fae5a : 0x8a5a2e, emissive: 0x1d5c2e })
  );
  mesh.position.set(x, 0.75, z);
  mesh.castShadow = true;
  G.scene.add(mesh);
  return { mesh, x, z, kind, taken: false, respawnAt: 0, spin: G.rng.range(0, 6) };
}

function stageDef(G) {
  return MISSIONS[G.mission.idx].stages[G.mission.stage];
}

function setBeacon(G, x, z, show = true) {
  G.beacon.position.set(x, 0, z);
  G.beacon.visible = show;
}
function hideSmallBeacons(G) {
  for (const b of G.smallBeacons) b.visible = false;
}

export function startMission(G, idx) {
  const m = G.mission;
  m.active = true; m.idx = idx; m.stage = 0; m.failed = false;
  m.scratch = {};
  const def = MISSIONS[idx];
  if (G.showDialogue) G.showDialogue(def.intro);
  if (G.notify) G.notify(`MISSION: ${def.title}`);
  if (idx === 3) setWanted(G, 1);                       // Harbor Lights runs hot
  if (idx === 4) { G.combat.reserve += 48; }            // Dario tops up her ammo
  enterStage(G);
}

function enterStage(G) {
  const m = G.mission;
  const st = stageDef(G);
  m.scratch = {};
  m.timer = st.timer || null;
  if (st.say && G.showDialogue) G.showDialogue(st.say);
  hideSmallBeacons(G);

  if (st.kind === 'collect') {
    m.scratch.bags = CASH_BAGS.map((b, i) => {
      const pk = makePickup(G, b.x, b.z, 'cash');
      pk.missionBag = true;
      G.smallBeacons[i].position.set(b.x, 0, b.z);
      G.smallBeacons[i].visible = true;
      return pk;
    });
    m.scratch.got = 0;
    setBeacon(G, 0, 0, false);
  } else if (st.kind === 'checkpoints') {
    m.scratch.next = 0;
    const cp = CHECKPOINTS[0];
    setBeacon(G, cp.x, cp.z);
  } else if (st.kind === 'fight') {
    const W = M.warehouse;
    spawnEnemy(G, W.x - 14, W.z + 30);
    spawnEnemy(G, W.x + 12, W.z + 33);
    spawnEnemy(G, W.x - 4, W.z + 40);
    spawnEnemy(G, W.x + 20, W.z + 26);
    m.scratch.left = 4;
    setBeacon(G, 0, 0, false);
  } else if (st.kind === 'pickup') {
    const pk = makePickup(G, M.warehouse.x, M.warehouse.z + 30, 'case');
    pk.missionBag = true;
    m.scratch.case = pk;
    setBeacon(G, pk.x, pk.z);
  } else if (st.kind === 'robvan') {
    // The van and its guards have been waiting since the goto stage.
    setBeacon(G, G.vanCar.x, G.vanCar.z);
  } else if (st.kind === 'steal') {
    setBeacon(G, G.sportsCar.x, G.sportsCar.z);
  } else if (st.kind === 'escape') {
    setBeacon(G, 0, 0, false);
  } else { // goto
    setBeacon(G, st.x, st.z);
  }

  // Mission 6's van + guards appear as soon as she heads for the casino.
  if (MISSIONS[m.idx].title === 'Last Tide' && m.stage === 0 && !G.vanCar) {
    G.vanCar = createCar(G, 'armoured', 0x8a8f96, M.casino.x + 16, M.casino.z + 14, Math.PI, 'parked');
    G.vanCar.ai = { parked: true };
    spawnEnemy(G, M.casino.x + 10, M.casino.z + 20);
    spawnEnemy(G, M.casino.x + 22, M.casino.z + 8);
  }
  updateObjective(G);
}

function updateObjective(G) {
  const m = G.mission;
  if (!m.active) {
    G.objectiveText = G.progress.done
      ? 'Free roam — Port Serena is yours'
      : `Next job: "${MISSIONS[G.progress.next].title}" — meet Dario's contact at the marker`;
    G.objectiveTimer = null;
    return;
  }
  const st = stageDef(G);
  let text = st.text;
  if (st.kind === 'collect') text = `Collect the cash bags at the docks (${m.scratch.got}/3)`;
  if (st.kind === 'checkpoints') text = `Checkpoint ${Math.min(m.scratch.next + 1, 6)}/6 — beat the clock`;
  if (st.kind === 'fight') text = `Clear the rival crew at the warehouse (${4 - (m.scratch.left || 0)}/4)`;
  const dist = currentTargetDist(G);
  G.objectiveText = dist !== null ? `${text} — ${Math.round(dist)}m` : text;
  G.objectiveTimer = m.timer;
}

function currentTargetDist(G) {
  const m = G.mission;
  if (!m.active) return Math.hypot(G.playerPos.x - STORY_MARKER.x, G.playerPos.z - STORY_MARKER.z);
  const st = stageDef(G);
  const p = G.playerPos;
  if (st.kind === 'goto') return Math.hypot(p.x - st.x, p.z - st.z);
  if (st.kind === 'steal') return Math.hypot(p.x - G.sportsCar.x, p.z - G.sportsCar.z);
  if (st.kind === 'checkpoints') {
    const cp = CHECKPOINTS[Math.min(m.scratch.next, 5)];
    return Math.hypot(p.x - cp.x, p.z - cp.z);
  }
  if (st.kind === 'robvan' && G.vanCar) return Math.hypot(p.x - G.vanCar.x, p.z - G.vanCar.z);
  return null;
}

function completeStage(G) {
  const m = G.mission;
  m.stage++;
  if (m.stage >= MISSIONS[m.idx].stages.length) completeMission(G);
  else enterStage(G);
}

function completeMission(G) {
  const m = G.mission;
  const def = MISSIONS[m.idx];
  m.active = false;
  setBeacon(G, 0, 0, false);
  hideSmallBeacons(G);
  clearEnemies(G);
  G.money += def.reward;
  G.progress.next = m.idx + 1;
  if (m.idx === MISSIONS.length - 1) G.progress.done = true;
  if (def.outro && G.showDialogue) G.showDialogue(def.outro);
  if (G.audio) G.audio.sting();
  if (G.onMissionComplete) G.onMissionComplete(def);
  if (G.saveGame) G.saveGame();
  updateObjective(G);
}

// Jump straight into a mission stage (used by the staged screenshot
// scenes, and handy for debugging). Assumes the mission is active.
export function forceStage(G, idx, stage) {
  const m = G.mission;
  m.active = true; m.idx = idx; m.stage = stage; m.failed = false;
  enterStage(G);
}

export function failMission(G, why) {
  const m = G.mission;
  if (!m.active) return;
  m.active = false;
  setBeacon(G, 0, 0, false);
  hideSmallBeacons(G);
  clearEnemies(G);
  if (G.notify) G.notify(`Mission failed — ${why}. Dario's marker is waiting.`);
  updateObjective(G);
}

// Called by combat when a rival goes down.
export function onEnemyDown(G) {
  const m = G.mission;
  if (m.active && stageDef(G).kind === 'fight') {
    m.scratch.left = Math.max(0, (m.scratch.left || 4) - 1);
    updateObjective(G);
    if (m.scratch.left <= 0) completeStage(G);
  }
}

export function updateMissions(G, dt) {
  // Idle pickups spin; free-roam cash respawns.
  for (const pk of G.pickups) {
    if (pk.taken) {
      if (G.time > pk.respawnAt) { pk.taken = false; pk.mesh.visible = true; }
      continue;
    }
    pk.mesh.rotation.y += dt * 1.8;
    pk.mesh.position.y = 0.75 + Math.sin(G.time * 2.4 + pk.spin) * 0.12;
    if (Math.hypot(G.playerPos.x - pk.x, G.playerPos.z - pk.z) < 2.9) {
      pk.taken = true; pk.mesh.visible = false; pk.respawnAt = G.time + 75;
      G.money += 40;
      if (G.audio) G.audio.pickup();
      if (G.notify) G.notify('Found cash +$40');
      if (G.saveGame) G.saveGame();
    }
  }

  const m = G.mission;
  if (!m.active) {
    // Free roam: the gold beacon marks Dario's contact.
    if (!G.progress.done) {
      setBeacon(G, STORY_MARKER.x, STORY_MARKER.z);
      if (Math.hypot(G.playerPos.x - STORY_MARKER.x, G.playerPos.z - STORY_MARKER.z) < 4.2) {
        startMission(G, G.progress.next);
      }
    } else setBeacon(G, 0, 0, false);
    updateObjective(G);
    return;
  }

  // Mission pickups (bags / briefcase).
  const st = stageDef(G);
  const p = G.playerPos;
  if (st.kind === 'collect') {
    for (const bag of m.scratch.bags) {
      if (bag.taken) continue;
      bag.mesh.rotation.y += dt * 1.8;
      if (Math.hypot(p.x - bag.x, p.z - bag.z) < 3) {
        bag.taken = true; bag.mesh.visible = false;
        m.scratch.got++;
        if (G.audio) G.audio.pickup();
        if (G.notify) G.notify(`Cash bag ${m.scratch.got}/3`);
        const i = m.scratch.bags.indexOf(bag);
        if (G.smallBeacons[i]) G.smallBeacons[i].visible = false;
        if (m.scratch.got === 2) setWanted(G, 2);   // spotted at the docks
        updateObjective(G);
        if (m.scratch.got >= 3) completeStage(G);
      }
    }
    return;
  }
  if (st.kind === 'pickup') {
    const pk = m.scratch.case;
    if (pk && !pk.taken) {
      pk.mesh.rotation.y += dt * 1.8;
      if (Math.hypot(p.x - pk.x, p.z - pk.z) < 3) {
        pk.taken = true; pk.mesh.visible = false;
        if (G.audio) G.audio.pickup();
        completeStage(G);
      }
    }
    return;
  }

  // Countdowns.
  if (m.timer !== null && m.timer !== undefined) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(G, 'out of time'); return; }
  }

  const dist = currentTargetDist(G);
  switch (st.kind) {
    case 'goto': {
      const inCarOk = !st.needCar || !!G.player.inCar;
      const carOk = !st.carRef || G.player.inCar === (st.carRef === 'sports' ? G.sportsCar : G.vanCar);
      const footOk = !st.onFoot || !G.player.inCar;
      if (dist !== null && dist < 7 && inCarOk && carOk && footOk) completeStage(G);
      break;
    }
    case 'steal':
      if (G.player.inCar === G.sportsCar) {
        setWanted(G, 1);
        completeStage(G);
      } else setBeacon(G, G.sportsCar.x, G.sportsCar.z);
      break;
    case 'escape':
      if (G.wanted.stars === 0) completeStage(G);
      break;
    case 'checkpoints': {
      if (G.player.inCar && dist !== null && dist < 8) {
        m.scratch.next++;
        if (G.audio) G.audio.pickup();
        if (m.scratch.next >= CHECKPOINTS.length) { completeStage(G); break; }
        const cp = CHECKPOINTS[m.scratch.next];
        setBeacon(G, cp.x, cp.z);
        updateObjective(G);
      }
      break;
    }
    case 'robvan':
      if (!G.player.inCar && dist !== null && dist < 4.6) {
        setWanted(G, 4);
        addHeat(G, 0); // refresh the sighting clock
        completeStage(G);
      }
      break;
    default:
      break; // 'fight' advances from onEnemyDown
  }
  updateObjective(G);
}
