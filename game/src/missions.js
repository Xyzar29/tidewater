// The story: six jobs for fixer Dario Fuentes, from a first courier run
// to the cash-van score that ends the arc. Between jobs the next start
// marker glows across town; during a job a stage machine drives the
// objective text, the countdown, the beacon and the minimap target.
// Failing (or getting busted / wasted) cleans the stage props up and
// leaves the job available to retry.

import { LANDMARKS } from './config.js';
import { spawnCar, removeCar } from './vehicles.js';
import { spawnGunman, clearGunmen } from './combat.js';
import { teleport } from './player.js';
import { dist2 } from './random.js';

const L = LANDMARKS;
const STARTS = [
  { x: -184, z: -56 },   // 1 First Run — outside the garage
  { x: -46, z: 188 },    // 2 Hot Wheels — the Serena Hotel forecourt
  { x: 188, z: 112 },    // 3 Night Deposit — the docks
  { x: 184, z: 222 },    // 4 Harbor Lights — the marina
  { x: 220, z: 62 },     // 5 Cold Trail — the warehouse yard
  { x: 66, z: -180 },    // 6 Last Tide — outside the casino
];
export const MISSION_DEFS = [
  { title: 'First Run', reward: 300 },
  { title: 'Hot Wheels', reward: 450 },
  { title: 'Night Deposit', reward: 600 },
  { title: 'Harbor Lights', reward: 500 },
  { title: 'Cold Trail', reward: 750 },
  { title: 'Last Tide', reward: 1200 },
];

export function createMissions(G) {
  // The objective beacon: a column of gold light with a ground ring.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.y = 17;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.3, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(column, ring);
  G.scene.add(beacon);

  const missions = {
    done: 0,
    current: null,   // { index, stage, timer, data }
    target: null,    // {x, z} for minimap + beacon
    beacon,
    onGunmanDown(gm) {
      const cur = this.current;
      if (cur && cur.index === 4 && cur.stage === 0) {
        cur.data.remaining--;
        if (cur.data.remaining <= 0) this.advance(1);
      }
      void gm;
    },
    startMission(i) { begin(G, i); },
    abort() { cleanup(G); this.current = null; },
    update(dt) { update(G, dt); },
  };
  G.missions = missions;
  return missions;
}

function setTarget(G, x, z) {
  G.missions.target = { x, z };
  const b = G.missions.beacon;
  b.visible = true;
  b.position.set(x, G.city.groundY(x, z), z);
}

function hideTarget(G) {
  G.missions.target = null;
  G.missions.beacon.visible = false;
}

function cleanup(G) {
  const cur = G.missions.current;
  if (!cur) return;
  const d = cur.data;
  if (d.props) for (const mesh of d.props) G.scene.remove(mesh);
  if (d.cars) for (const car of d.cars) if (!car.dead && G.player.driving !== car) removeCar(G, car);
  if (cur.index === 4) clearGunmen(G);
  G.police.setFloor(0);
  hideTarget(G);
  G.hud.setObjective('', null);
}

function complete(G) {
  const cur = G.missions.current;
  const def = MISSION_DEFS[cur.index];
  cleanup(G);
  G.missions.current = null;
  G.missions.done = cur.index + 1;
  G.money += def.reward;
  G.audio.success();
  G.hud.banner(`MISSION COMPLETE — ${def.title}  +$${def.reward}`, 3.4);
  G.hud.dialogue('Dario Fuentes', 'Good work, Mari. Lie low a minute — I will have something new soon.', 4);
  G.saveGame();
  if (cur.index === 5 && G.onStoryComplete) G.onStoryComplete();
}

function fail(G, reason) {
  const cur = G.missions.current;
  if (!cur) return;
  cleanup(G);
  G.missions.current = null;
  G.audio.fail();
  G.hud.banner('MISSION FAILED', 2.4);
  G.hud.notify(reason + ' — the job is still on the board.');
  G.saveGame();
}

function begin(G, i) {
  cleanup(G);
  const def = MISSION_DEFS[i];
  const cur = { index: i, stage: 0, timer: null, data: { props: [], cars: [] } };
  G.missions.current = cur;
  G.hud.banner('MISSION: ' + def.title, 3);
  const D = (text) => G.hud.dialogue('Dario Fuentes', text, 5.5);
  switch (i) {
    case 0:
      D('Mari. Simple job: this package goes to the marina. Fast, clean, no questions.');
      cur.timer = 100;
      setTarget(G, L.marina.x, 222);
      break;
    case 1: {
      D('Mari — the yellow sports car by the Serena Hotel. Bring it home to my garage.');
      const car = spawnCar(G, { type: 'sports', color: 0xffd21f, x: -44, z: 206, heading: Math.PI / 2, kind: 'mission' });
      cur.data.cars.push(car);
      cur.data.targetCar = car;
      setTarget(G, car.x, car.z);
      break;
    }
    case 2: {
      D('Three cash bags sitting at the docks with my name on them. Collect, then go dark.');
      const bagGeo = new THREE.BoxGeometry(0.9, 0.55, 0.6);
      const bagMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
      cur.data.bags = [];
      for (const [x, z] of [[182, 104], [208, 130], [188, 142]]) {
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.set(x, G.city.groundY(x, z) + 0.6, z);
        bag.castShadow = true;
        G.scene.add(bag);
        cur.data.props.push(bag);
        cur.data.bags.push({ x, z, mesh: bag, taken: false });
      }
      cur.data.collected = 0;
      setTarget(G, 182, 104);
      break;
    }
    case 3:
      D('A little tour, against the clock. Six lights around the harbor. Try not to bend anything.');
      cur.data.checkpoints = [
        [112, 168], [56, 56], [0, -56], [-56, -112], [56, -168], [168, -56],
      ];
      cur.data.cp = 0;
      cur.timer = 80;
      G.police.setFloor(1);
      setTarget(G, 112, 168);
      break;
    case 4: {
      D('A rival crew is holding my briefcase at the warehouse. Go on foot. Go ready.');
      G.combat.addAmmo(48);
      if (!G.combat.drawn) G.hud.notify('Q draws your pistol');
      cur.data.remaining = 4;
      cur.timer = 120;
      for (const [x, z] of [[240, 40], [250, 70], [230, 76], [254, 46]]) spawnGunman(G, x, z);
      setTarget(G, 240, 58);
      break;
    }
    case 5: {
      D('Last one, Mari. The casino cash van, then the boat at the marina. Whatever happens — keep driving.');
      const van = spawnCar(G, { type: 'cashvan', color: 0x5f7161, x: 74, z: -166, heading: 0, kind: 'mission' });
      cur.data.cars.push(van);
      cur.data.van = van;
      cur.data.robT = 0;
      setTarget(G, van.x, van.z);
      break;
    }
  }
}

// Stage transitions that need side effects beyond a number bump.
function advance(G, stage) {
  const cur = G.missions.current;
  cur.stage = stage;
  if (cur.index === 4 && stage === 1) {
    cur.timer = null;
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x6e4f2a })
    );
    caseMesh.position.set(246, G.city.groundY(246, 56) + 0.4, 56);
    G.scene.add(caseMesh);
    cur.data.props.push(caseMesh);
    cur.data.briefcase = { x: 246, z: 56 };
    G.hud.dialogue('Dario Fuentes', 'Crew is down. Grab my briefcase and bring it home.', 4.5);
    setTarget(G, 246, 56);
  }
  if (cur.index === 4 && stage === 2) setTarget(G, -184, -56);
  if (cur.index === 1 && stage === 1) setTarget(G, -184, -56);
  if (cur.index === 2 && stage === 1) {
    G.police.setStarsAtLeast(2);
    G.hud.dialogue('Detective Ruth Calloway', 'All units — the docks job just went loud. Bring her in.', 4.5);
  }
  if (cur.index === 2 && stage === 2) setTarget(G, -184, -196);
  if (cur.index === 5 && stage === 1) {
    G.police.setFloor(4);
    G.police.setStarsAtLeast(4);
    setTarget(G, L.marina.x, 244);
  }
}

function reached(G, x, z, r) {
  return dist2(G.player.x, G.player.z, x, z) < r * r;
}
function metres(G, x, z) {
  return Math.round(Math.sqrt(dist2(G.player.x, G.player.z, x, z)));
}

function update(G, dt) {
  const M = G.missions;
  const p = G.player;
  const cur = M.current;

  if (!cur) {
    // Between jobs: point at the next start marker.
    if (M.done < MISSION_DEFS.length && G.state === 'playing') {
      const s = STARTS[M.done];
      setTarget(G, s.x, s.z);
      const def = MISSION_DEFS[M.done];
      G.hud.setObjective(`Next job: "${def.title}" — meet Dario's contact at the marker`, null);
      if (reached(G, s.x, s.z, 3.4)) begin(G, M.done);
    } else if (M.done >= MISSION_DEFS.length) {
      hideTarget(G);
      G.hud.setObjective('Free roam — Port Serena is yours', null);
    }
    return;
  }

  if (cur.timer !== null) {
    cur.timer -= dt;
    if (cur.timer <= 0) { fail(G, 'Out of time'); return; }
  }
  const timer = cur.timer;

  switch (cur.index) {
    case 0: {
      G.hud.setObjective(`Drive the package to the marina — ${metres(G, L.marina.x, 222)}m`, timer);
      if (!p.driving) G.hud.hint('You need a car for this run — press E by any car', 0.2);
      if (p.driving && reached(G, L.marina.x, 222, 7)) complete(G);
      break;
    }
    case 1: {
      const car = cur.data.targetCar;
      if (cur.stage === 0) {
        setTarget(G, car.x, car.z);
        G.hud.setObjective('Steal the yellow sports car at the Serena Hotel', null);
        if (p.driving === car) {
          G.police.setStarsAtLeast(1);
          advance(G, 1);
        }
      } else {
        G.hud.setObjective(`Deliver the sports car to Dario's garage — ${metres(G, -184, -56)}m`, null);
        if (p.driving === car && reached(G, -184, -56, 8)) complete(G);
        else if (p.driving !== car) G.hud.hint('Get back in the yellow sports car', 0.2);
      }
      break;
    }
    case 2: {
      if (cur.stage === 0) {
        let nearest = null, nd = Infinity;
        for (const bag of cur.data.bags) {
          if (bag.taken) continue;
          const d = dist2(p.x, p.z, bag.x, bag.z);
          if (d < nd) { nd = d; nearest = bag; }
          bag.mesh.rotation.y += dt * 1.5;
          if (d < 7.3) {
            bag.taken = true;
            bag.mesh.visible = false;
            cur.data.collected++;
            G.audio.pickup();
            G.money += 40;
            G.hud.notify(`Cash bag collected (${cur.data.collected}/3)`);
          }
        }
        if (nearest) setTarget(G, nearest.x, nearest.z);
        G.hud.setObjective(`Collect the cash bags at the docks (${cur.data.collected}/3)`, null);
        if (cur.data.collected >= 3) advance(G, 1);
      } else if (cur.stage === 1) {
        hideTarget(G);
        G.hud.setObjective('Lose the police — break their line of sight', null);
        if (G.police.stars === 0) advance(G, 2);
      } else {
        G.hud.setObjective(`Reach your safehouse — ${metres(G, -184, -196)}m`, null);
        if (reached(G, -184, -196, 6)) complete(G);
      }
      break;
    }
    case 3: {
      const [cx, cz] = cur.data.checkpoints[cur.data.cp];
      setTarget(G, cx, cz);
      G.hud.setObjective(`Checkpoint ${cur.data.cp + 1} of 6 — ${metres(G, cx, cz)}m`, timer);
      if (!p.driving) G.hud.hint('Stay in a car — this is a driving run', 0.2);
      if (p.driving && reached(G, cx, cz, 9)) {
        G.audio.pickup();
        cur.data.cp++;
        cur.timer += 16;
        if (cur.data.cp >= cur.data.checkpoints.length) {
          G.police.setFloor(0);
          complete(G);
        }
      }
      break;
    }
    case 4: {
      if (cur.stage === 0) {
        G.hud.setObjective(`Clear the rival crew at the warehouse (${4 - cur.data.remaining}/4)`, timer);
      } else if (cur.stage === 1) {
        G.hud.setObjective('Grab the briefcase', null);
        if (reached(G, 246, 56, 2.6) && !p.driving) {
          G.audio.pickup();
          const mesh = cur.data.props[cur.data.props.length - 1];
          if (mesh) mesh.visible = false;
          advance(G, 2);
        }
      } else {
        G.hud.setObjective(`Escape — deliver the briefcase to Dario's garage — ${metres(G, -184, -56)}m`, null);
        if (reached(G, -184, -56, 7)) complete(G);
      }
      break;
    }
    case 5: {
      const van = cur.data.van;
      if (cur.stage === 0) {
        setTarget(G, van.x, van.z);
        const near = reached(G, van.x, van.z, 6.5);
        const still = p.driving ? Math.abs(p.car.speed) < 2 : true;
        if (near && still) {
          cur.data.robT += dt;
          G.hud.setObjective(`Robbing the cash van… ${Math.min(100, Math.round(cur.data.robT / 4 * 100))}%`, null);
          if (cur.data.robT >= 4) {
            G.money += 150;
            advance(G, 1);
            G.hud.banner('VAN HIT — GO!', 2);
          }
        } else {
          cur.data.robT = Math.max(0, cur.data.robT - dt * 2);
          G.hud.setObjective('Get to the armoured cash van at the casino and hold still beside it', null);
        }
      } else {
        G.hud.setObjective(`Escape to the boat at the marina — ${metres(G, L.marina.x, 244)}m`, null);
        if (reached(G, L.marina.x, 244, 6)) {
          G.police.setFloor(0);
          complete(G);
        }
      }
      break;
    }
  }
  void teleport;
}
