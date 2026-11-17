// missions.js — Dario Fuentes' six jobs for Mari: a data-driven stage engine
// (go-to, steal, collect, checkpoints, fight, hold-to-rob, lose-the-cops)
// with markers, timers, dialogue and cash rewards, plus free-roam pickups.

import { LANDMARKS, SPORTS_SPOT, CASH_BAGS, CHECKPOINTS } from './config.js';
import { createCar } from './vehicles.js';

function beacon(color) {
  const grp = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 34, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
    })
  );
  cyl.position.y = 17;
  grp.add(cyl);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.14, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  grp.add(ring);
  grp.userData.ring = ring;
  grp.visible = false;
  return grp;
}

export function createMissions(G) {
  const startMarker = beacon(0x39d0ff);
  const objMarker = beacon(0xffc93d);
  G.scene.add(startMarker);
  G.scene.add(objMarker);
  startMarker.position.set(LANDMARKS.garage.x, 0, LANDMARKS.garage.z);

  const api = {
    nextIndex: 0,
    active: null,
    objective: null,
    update,
    startNext,
    startMission,
    onEnterCar,
    onEnemyKilled() {},
    failActive,
  };

  // ---- free-roam cash pickups -------------------------------------------
  const pickupSpots = [
    [-88, -100], [12, -178], [178, 12], [-178, 88], [88, 178], [-12, 88],
    [240, -60], [-240, 40], [60, -260], [-120, 240], [200, 232], [-60, -60],
    [150, -150], [-190, -240],
  ];
  const pickups = pickupSpots.map(([x, z]) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.35, 0.45),
      new THREE.MeshLambertMaterial({ color: 0x53b06a, emissive: 0x1d5c2e })
    );
    m.position.set(x, 0.6, z);
    G.scene.add(m);
    return { mesh: m, x, z, taken: 0 };
  });

  // ---- mission definitions ------------------------------------------------
  function defs() {
    const L = LANDMARKS;
    return [
      {
        name: 'First Run',
        reward: 300,
        intro: [
          ['DARIO FUENTES', 'Mari. A package, the marina, no questions. The clock is the only cop you cannot outrun.'],
          ['MARI VEGA', 'Fast and clean is the only way I drive, Dario.'],
        ],
        setup() {
          const car = createCar(G, 'sedan', 0xf2f0eb, 124, 94, Math.PI / 2);
          car.missionTag = 'm1-car';
        },
        stages: [
          { type: 'goto', x: L.marina.x, z: L.marina.z, r: 8, needCar: true, timer: 130, text: 'Drive the package to the marina' },
        ],
      },
      {
        name: 'Hot Wheels',
        reward: 450,
        intro: [
          ['DARIO FUENTES', 'Mari — the yellow sports car by the Serena Hotel. Bring it home.'],
          ['MARI VEGA', 'Stealing from tourists now? …Fine. But I keep the sunglasses.'],
        ],
        setup() {
          const car = createCar(G, 'sports', 0xf2d21d, SPORTS_SPOT.x, SPORTS_SPOT.z, SPORTS_SPOT.heading);
          car.missionTag = 'steal-target';
        },
        stages: [
          { type: 'goto', x: SPORTS_SPOT.x, z: SPORTS_SPOT.z, r: 11, text: 'Go to the yellow sports car at the Serena Hotel' },
          { type: 'steal', tag: 'steal-target', x: SPORTS_SPOT.x, z: SPORTS_SPOT.z, text: 'Steal the yellow sports car' },
          { type: 'goto', x: L.garage.x, z: L.garage.z, r: 8, needCar: true, text: "Deliver the car to Dario's garage" },
        ],
      },
      {
        name: 'Night Deposit',
        reward: 600,
        intro: [
          ['DARIO FUENTES', 'Three cash bags walked off a boat tonight. They are scattered around the docks. Collect them.'],
          ['DARIO FUENTES', 'When you have all three, the PSPD will care. Lose them, then go home.'],
        ],
        stages: [
          { type: 'collect', points: CASH_BAGS, text: 'Collect the cash bags at the docks' },
          {
            type: 'loseCops', x: L.safehouse.x, z: L.safehouse.z, r: 7,
            text: 'Lose the police, then reach your safehouse',
            onStart() {
              G.police.setStars(2);
              G.hud.showDialogue('DET. CALLOWAY', 'All units — courier suspect fleeing the docks. Bring her in.', 3.5);
            },
          },
        ],
      },
      {
        name: 'Harbor Lights',
        reward: 500,
        intro: [
          ['DARIO FUENTES', 'A little tour, Mari. Six lights across my city, against the clock. Try not to scratch the paint.'],
        ],
        setup() { G.police.addHeat(100); },
        stages: [
          { type: 'checkpoints', points: CHECKPOINTS, timer: 60, perPoint: 15, text: 'Hit the checkpoints across the city' },
        ],
      },
      {
        name: 'Cold Trail',
        reward: 800,
        intro: [
          ['DARIO FUENTES', 'A rival crew is holding my briefcase at the warehouse. Go on foot. Go ready.'],
          ['MARI VEGA', 'Four of them, one of me. You owe me hazard pay, Dario.'],
        ],
        stages: [
          { type: 'goto', x: 225, z: 172, r: 9, text: 'Go to the Pier 9 warehouse' },
          {
            type: 'fight', x: 228, z: 162, text: 'Clear the rival crew at the warehouse',
            onStart() {
              const spots = [[206, 158], [220, 166], [240, 157], [249, 167]];
              for (const [x, z] of spots) G.combat.spawnEnemy(x, z, { tag: 'crew' });
              G.hud.showDialogue('RIVAL CREW', 'Wrong warehouse, courier!', 2.5);
            },
          },
          { type: 'pickup', x: 232, z: 161, r: 2.6, text: 'Take the briefcase' },
          { type: 'goto', x: L.garage.x, z: L.garage.z, r: 8, needCar: true, text: "Escape to Dario's garage" },
        ],
      },
      {
        name: 'Last Tide',
        reward: 1500,
        intro: [
          ['DARIO FUENTES', 'Last job, Mari. The casino van, then the boat at the marina. After this, we are both ghosts.'],
          ['DET. CALLOWAY', 'Vega. Whatever he promised you — it is not worth the tide coming in.'],
        ],
        setup() {
          const van = createCar(G, 'van', 0x8f9aa4, 206, 4, Math.PI / 2);
          van.missionTag = 'cash-van';
        },
        stages: [
          { type: 'goto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, r: 11, text: 'Go to the armoured van at Casino Serena' },
          {
            type: 'rob', tag: 'cash-van', r: 5.5, hold: 3, text: 'Rob the armoured van',
            onDone() {
              G.police.setStars(4);
              G.hud.showDialogue('DET. CALLOWAY', 'All units, all units — casino van hit. Do not let her reach the water.', 3.5);
            },
          },
          { type: 'goto', x: LANDMARKS.pier.x, z: LANDMARKS.pier.z, r: 7, text: 'Reach the boat at the marina pier', final: true },
        ],
      },
    ];
  }

  // ---- stage runtime --------------------------------------------------------

  function startMission(i) {
    if (api.active || i < 0 || i >= 6) return false;
    const def = defs()[i];
    api.active = {
      def, index: i, stageIdx: -1, stage: null,
      timer: null, collected: 0, cpIndex: 0, holdT: 0, items: [],
    };
    if (def.setup) def.setup();
    for (const [name, text] of def.intro) G.hud.showDialogue(name, text, 3.6);
    G.hud.banner('MISSION: ' + def.name);
    nextStage();
    return true;
  }

  function startNext() {
    return startMission(api.nextIndex);
  }

  function nextStage() {
    const a = api.active;
    if (!a) return;
    // clean up previous stage props
    for (const m of a.items) G.scene.remove(m);
    a.items = [];
    a.stageIdx++;
    if (a.stageIdx >= a.def.stages.length) {
      completeMission();
      return;
    }
    const s = a.def.stages[a.stageIdx];
    a.stage = s;
    a.timer = s.timer || null;
    a.collected = 0;
    a.cpIndex = 0;
    a.holdT = 0;
    if (s.type === 'collect') {
      for (const pt of s.points) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.5, 0.55),
          new THREE.MeshLambertMaterial({ color: 0x53b06a, emissive: 0x2a7a3d })
        );
        m.position.set(pt.x, 0.7, pt.z);
        G.scene.add(m);
        a.items.push(m);
      }
    }
    if (s.type === 'pickup') {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.25, 0.45),
        new THREE.MeshLambertMaterial({ color: 0x8a5a2b, emissive: 0x3a2408 })
      );
      m.position.set(s.x, 0.6, s.z);
      G.scene.add(m);
      a.items.push(m);
    }
    if (s.onStart) s.onStart();
    refreshObjective();
  }

  function refreshObjective() {
    const a = api.active;
    if (!a || !a.stage) { api.objective = null; return; }
    const s = a.stage;
    let target = null;
    if (s.type === 'collect') target = s.points[a.collected];
    else if (s.type === 'checkpoints') target = s.points[a.cpIndex];
    else if (s.type === 'rob') {
      const van = G.cars.find((c) => c.missionTag === s.tag);
      if (van) target = van;
    } else if (s.x !== undefined) target = s;
    let text = s.text;
    if (s.type === 'collect') text += ` (${a.collected}/${s.points.length})`;
    if (s.type === 'checkpoints') text += ` (${a.cpIndex}/${s.points.length})`;
    if (s.type === 'fight') text += ` (${(a.def.stages[a.stageIdx].total || 4) - G.combat.aliveCount()}/4)`;
    api.objective = {
      text,
      x: target ? target.x : null,
      z: target ? target.z : null,
      timer: a.timer,
    };
    if (target) objMarker.position.set(target.x, 0, target.z);
    objMarker.visible = !!target;
  }

  function completeMission() {
    const a = api.active;
    const def = a.def;
    api.active = null;
    api.objective = null;
    objMarker.visible = false;
    G.state.money += def.reward;
    api.nextIndex = a.index + 1;
    G.audio.sting();
    G.saveGame();
    if (def.stages.some((s) => s.final)) {
      G.showEnding(def);
    } else {
      G.showComplete(def);
    }
  }

  function failActive(reason) {
    if (!api.active) return;
    for (const m of api.active.items) G.scene.remove(m);
    api.active = null;
    api.objective = null;
    objMarker.visible = false;
    G.combat.clearEnemies();
    G.hud.toast(reason || 'Mission failed — return to the blue marker to retry.');
  }

  function onEnterCar(car) {
    const a = api.active;
    if (!a || !a.stage) return;
    if (a.stage.type === 'steal' && car.missionTag === a.stage.tag) {
      G.hud.showDialogue('MARI VEGA', 'Got it. Now — home, before Calloway wakes up.', 3);
      nextStage();
    }
  }

  function distTo(x, z) {
    return Math.hypot(G.player.x - x, G.player.z - z);
  }

  function update(dt) {
    // marker animations
    const t = G.state.time;
    for (const mk of [startMarker, objMarker]) {
      if (mk.visible) mk.userData.ring.rotation.z = t * 1.5;
    }
    startMarker.visible = !api.active && api.nextIndex < 6 && G.state.screen === 'playing';
    // free-roam pickups
    for (const pk of pickups) {
      if (pk.taken > 0) { pk.taken -= dt; pk.mesh.visible = pk.taken <= 0; continue; }
      pk.mesh.rotation.y = t * 2;
      pk.mesh.position.y = 0.6 + Math.sin(t * 3 + pk.x) * 0.12;
      if (distTo(pk.x, pk.z) < 2) {
        pk.taken = 90;
        G.state.money += 25;
        G.audio.pickup();
        G.hud.toast('+$25 — finders keepers');
      }
    }
    // mission start trigger
    if (!api.active && api.nextIndex < 6 && G.state.screen === 'playing') {
      if (distTo(LANDMARKS.garage.x, LANDMARKS.garage.z) < 3.6) startNext();
    }
    const a = api.active;
    if (!a || G.state.screen !== 'playing') return;
    const s = a.stage;
    if (!s) return;
    // timers
    if (a.timer !== null && s.type !== 'checkpoints') {
      a.timer -= dt;
      if (a.timer <= 0) { failActive('Out of time.'); return; }
    }
    refreshObjective();
    const p = G.player;
    switch (s.type) {
      case 'goto': {
        if (distTo(s.x, s.z) < s.r && (!s.needCar || p.car)) nextStage();
        break;
      }
      case 'steal': {
        objMarker.position.set(s.x, 0, s.z);
        break;
      }
      case 'collect': {
        const pt = s.points[a.collected];
        if (pt && distTo(pt.x, pt.z) < 2.4) {
          const m = a.items[a.collected];
          if (m) m.visible = false;
          a.collected++;
          G.audio.pickup();
          G.state.money += 40;
          if (a.collected >= s.points.length) nextStage();
        }
        break;
      }
      case 'checkpoints': {
        a.timer -= dt;
        if (a.timer <= 0) { failActive('Out of time.'); return; }
        const pt = s.points[a.cpIndex];
        if (pt && p.car && distTo(pt.x, pt.z) < 9) {
          a.cpIndex++;
          a.timer += s.perPoint;
          G.audio.pickup();
          if (a.cpIndex >= s.points.length) nextStage();
        }
        break;
      }
      case 'fight': {
        if (G.combat.aliveCount() === 0) nextStage();
        break;
      }
      case 'pickup': {
        if (distTo(s.x, s.z) < s.r && !p.car) nextStage();
        break;
      }
      case 'rob': {
        const van = G.cars.find((c) => c.missionTag === s.tag);
        if (van && distTo(van.x, van.z) < s.r && !p.car) {
          a.holdT += dt;
          api.objective.text = `Robbing the van… ${Math.ceil(s.hold - a.holdT)}s`;
          if (a.holdT >= s.hold) {
            if (s.onDone) s.onDone();
            nextStage();
          }
        } else {
          a.holdT = Math.max(0, a.holdT - dt * 2);
        }
        break;
      }
      case 'loseCops': {
        api.objective.text = G.police.stars > 0
          ? 'Lose the police!'
          : 'Reach your safehouse';
        api.objective.x = G.police.stars > 0 ? null : s.x;
        api.objective.z = G.police.stars > 0 ? null : s.z;
        objMarker.visible = G.police.stars === 0;
        if (G.police.stars === 0) objMarker.position.set(s.x, 0, s.z);
        if (G.police.stars === 0 && distTo(s.x, s.z) < s.r) nextStage();
        break;
      }
    }
  }

  return api;
}
