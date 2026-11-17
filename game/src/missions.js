// missions.js — the six-mission story arc, run by a small data-driven
// stage engine. Stage types: goto, steal, collect, checkpoints, fight,
// pickup, rob and escape. Between missions Mari free-roams; walking into
// the gold marker at Dario's garage starts the next job.

import { LANDMARKS } from './config.js';

const M = LANDMARKS;

export const MISSIONS = [
  {
    title: 'First Run', reward: 300,
    intro: [
      ['DARIO FUENTES', 'Package is in the back, Mari. Take it to the marina — and the clock is not your friend.'],
      ['MARI VEGA', 'Fast and clean is the only way I drive, Dario.'],
    ],
    stages: [
      { type: 'goto', at: M.marina, label: 'Drive the package to the marina', timer: 150 },
    ],
    outro: [['DARIO FUENTES', 'Clean. Very clean. There will be more work like this.']],
  },
  {
    title: 'Hot Wheels', reward: 250,
    intro: [
      ['DARIO FUENTES', 'A yellow sports car is sitting outside the Serena Hotel. Its owner owes me. Bring it home.'],
      ['DET. CALLOWAY', 'PSPD reminder: grand theft auto is still a crime in Port Serena.'],
    ],
    stages: [
      { type: 'steal', label: 'Steal the yellow sports car at the Serena Hotel' },
      { type: 'goto', at: M.garage, label: "Deliver the sports car to Dario's garage" },
    ],
    outro: [['DARIO FUENTES', 'Beautiful. He can walk to the beach from now on.']],
  },
  {
    title: 'Night Deposit', reward: 400,
    intro: [
      ['DARIO FUENTES', 'Three cash bags are sitting on the docks with my name on them. Collect, then disappear.'],
    ],
    stages: [
      {
        type: 'collect', label: 'Collect the cash bags on the docks', count: 3,
        points: [{ x: 168, z: -18 }, { x: 188, z: -52 }, { x: 146, z: -70 }],
      },
      { type: 'escape', label: 'Lose the police' },
      { type: 'goto', at: M.safehouse, label: 'Reach your safehouse' },
    ],
    outro: [['MARI VEGA', 'Docks, cash, no witnesses. A good night.']],
  },
  {
    title: 'Harbor Lights', reward: 350,
    intro: [
      ['DARIO FUENTES', 'Six lights around the harbour run, in order, against the clock. Any car. Go.'],
    ],
    stages: [
      {
        type: 'checkpoints', label: 'Hit every checkpoint', timer: 175,
        points: [
          { x: 56, z: -56 }, { x: 112, z: 0 }, { x: 56, z: 112 },
          { x: -56, z: 56 }, { x: -112, z: -56 }, { x: 0, z: -168 },
        ],
      },
    ],
    outro: [['DARIO FUENTES', 'Every light, on time. The harbour approves.']],
  },
  {
    title: 'Cold Trail', reward: 500,
    intro: [
      ['DARIO FUENTES', 'A rival crew is holding my briefcase at Pier 9. Take it back — they will not hand it over politely.'],
      ['MARI VEGA', 'Then I will ask with the pistol you gave me.'],
    ],
    stages: [
      { type: 'goto', at: { x: 168, z: -38 }, label: 'Get to Pier 9 Warehouse', radius: 15 },
      { type: 'fight', at: { x: 168, z: -40 }, label: 'Clear the rival crew', count: 4 },
      { type: 'pickup', at: { x: 176, z: -44 }, label: 'Take the briefcase' },
      { type: 'goto', at: M.garage, label: 'Escape — bring the briefcase to Dario' },
    ],
    outro: [['DARIO FUENTES', 'The case, intact. You are worth every cent, Mari.']],
  },
  {
    title: 'Last Tide', reward: 1000,
    intro: [
      ['DARIO FUENTES', 'Last job, biggest prize: the armoured van outside Casino Serena. Rob it, then run for the boat.'],
      ['DET. CALLOWAY', 'Mari Vega — whatever you are planning, I will be there at the end of it.'],
    ],
    stages: [
      { type: 'goto', at: { x: 110, z: -136 }, label: 'Find the armoured van at Casino Serena', radius: 16 },
      { type: 'rob', label: 'Rob the armoured van (stay close)' },
      { type: 'goto', at: { x: 148, z: 212 }, label: 'Escape to the boat at the marina' },
    ],
    outro: [['MARI VEGA', 'One last tide, and Port Serena is mine.']],
  },
];

export class Missions {
  constructor(G, scene) {
    this.G = G;
    this.scene = scene;
    this.nextIndex = 0;      // next mission to offer
    this.active = null;      // mission definition being run
    this.stageIdx = 0;
    this.stage = null;
    this.stageT = 0;         // time left on a timed stage
    this.robT = 0;
    this.collected = 0;
    this.checkpointIdx = 0;
    this.props = [];         // meshes spawned for the current stage
    this.specialCar = null;
    this.dlgQueue = [];
    this.dlgT = 0;
    this.onComplete = null;  // (mission) => {} set by main
    this.onFail = null;

    // The gold objective marker: a beam of light + a ground ring.
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd21f, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 34, 12, 1, true), beamMat);
    this.beam.position.y = 17;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd21f, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.15;
    const markerGroup = new THREE.Group();
    markerGroup.add(this.beam);
    markerGroup.add(this.ring);
    this.marker = markerGroup;
    scene.add(markerGroup);
  }

  get busy() { return this.active !== null; }
  get allDone() { return this.nextIndex >= MISSIONS.length && !this.active; }

  stageDef() { return this.active.stages[this.stageIdx]; }

  // Where the gold marker currently stands (null: no objective).
  markerPos() {
    if (!this.active) {
      if (this.allDone) return null;
      return { x: M.garage.x, z: M.garage.z };
    }
    const s = this.stageDef();
    switch (s.type) {
      case 'goto': return s.at;
      case 'steal': return this.specialCar ? this.specialCar.mesh.position : M.hotel;
      case 'collect': return s.points[Math.min(this.collected, s.points.length - 1)];
      case 'checkpoints': return s.points[this.checkpointIdx];
      case 'fight': return s.at;
      case 'pickup': return s.at;
      case 'rob': return this.specialCar ? this.specialCar.mesh.position : M.casino;
      case 'escape': return null;
      default: return null;
    }
  }

  say(lines) {
    for (const [speaker, text] of lines) this.dlgQueue.push([speaker, text]);
  }

  startMission(index) {
    this.nextIndex = index;
    this.active = MISSIONS[index];
    this.stageIdx = 0;
    this.say(this.active.intro);
    this.G.hud.notify(`MISSION: ${this.active.title}`);
    this.setupStage();
  }

  setupStage() {
    const s = this.stageDef();
    const G = this.G;
    this.stageT = s.timer || 0;
    this.robT = 0;
    // Clear props from the previous stage.
    for (const p of this.props) this.scene.remove(p);
    this.props = [];

    if (s.type === 'steal') {
      this.specialCar = G.traffic.spawnSpecialSportscar(66, 174, Math.PI / 2);
    }
    if (this.active === MISSIONS[5] && this.stageIdx === 0 && !this.specialCar) {
      this.specialCar = G.traffic.spawnCashVan(110, -136, -Math.PI / 2);
    }
    if (s.type === 'collect') {
      this.collected = 0;
      const bagGeo = new THREE.BoxGeometry(0.8, 0.5, 0.35);
      const bagMat = new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x0d5c26 });
      s.points.forEach((pt, i) => {
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.set(pt.x, 0.8, pt.z);
        bag.userData.index = i;
        bag.userData.taken = false;
        this.scene.add(bag);
        this.props.push(bag);
      });
    }
    if (s.type === 'checkpoints') this.checkpointIdx = 0;
    if (s.type === 'fight') {
      G.combat.spawnCrew(s.at.x, s.at.z, s.count);
      this.say([['RIVAL CREW', 'Wrong pier, courier. Walk away or fall down.']]);
    }
    if (s.type === 'pickup') {
      const caseMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.25, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x8a5a2b, emissive: 0x2a1a05 }),
      );
      caseMesh.position.set(s.at.x, 0.5, s.at.z);
      this.scene.add(caseMesh);
      this.props.push(caseMesh);
    }
    if (s.type === 'escape') {
      // Heat is already on from the collect stage; nothing to spawn.
    }
  }

  cleanupStage() {
    for (const p of this.props) this.scene.remove(p);
    this.props = [];
    if (this.specialCar && this.specialCar.special) {
      // The special car stays in the world only while its mission runs.
      if (this.G.player.car !== this.specialCar) this.G.traffic.removeCar(this.specialCar);
      this.specialCar = null;
    }
    this.G.combat.clearCrew();
  }

  failMission() {
    const title = this.active.title;
    this.cleanupStage();
    this.active = null;
    this.G.hud.notify(`Mission failed: ${title} — return to Dario's garage to retry`);
    this.G.hud.setObjective(null);
    this.G.audio.fail();
    if (this.onFail) this.onFail(title);
  }

  completeMission() {
    const mission = this.active;
    this.say(mission.outro);
    this.cleanupStage();
    this.active = null;
    this.nextIndex += 1;
    this.G.addMoney(mission.reward);
    this.G.audio.sting();
    this.G.hud.setObjective(null);
    this.G.saveProgress();
    if (this.onComplete) this.onComplete(mission);
  }

  nextStage() {
    this.stageIdx += 1;
    if (this.stageIdx >= this.active.stages.length) this.completeMission();
    else this.setupStage();
  }

  distTo(x, z) {
    const p = this.G.player.pos;
    return Math.hypot(p.x - x, p.z - z);
  }

  update(dt) {
    const G = this.G;
    // Dialogue queue: one line at a time.
    if (this.dlgQueue.length > 0) {
      this.dlgT -= dt;
      if (this.dlgT <= 0) {
        const [speaker, text] = this.dlgQueue.shift();
        G.hud.dialogue(speaker, text, 3.8);
        this.dlgT = 3.8;
      }
    }

    // Marker placement + a slow spin on the ring.
    const mp = this.markerPos();
    if (mp) {
      this.marker.visible = true;
      this.marker.position.set(mp.x, 0, mp.z);
      this.ring.rotation.z += dt * 0.8;
    } else {
      this.marker.visible = false;
    }

    if (!this.active) {
      // Idle: standing in the garage marker starts the next job.
      if (!this.allDone && this.distTo(M.garage.x, M.garage.z) < 5.5) {
        this.startMission(this.nextIndex);
      }
      if (!this.allDone) {
        G.hud.setObjective(
          this.nextIndex === 0 ? 'Meet Dario at his garage' : `Next job: ${MISSIONS[this.nextIndex].title} — see Dario`,
          this.distTo(M.garage.x, M.garage.z), null,
        );
      } else {
        G.hud.setObjective('Free roam — Port Serena is yours', null, null);
      }
      return;
    }

    const s = this.stageDef();
    // Timed stages.
    if (s.timer) {
      this.stageT -= dt;
      if (this.stageT <= 0) { this.failMission(); return; }
    }

    switch (s.type) {
      case 'goto': {
        const d = this.distTo(s.at.x, s.at.z);
        G.hud.setObjective(s.label, d, s.timer ? this.stageT : null);
        if (d < (s.radius || 10)) this.nextStage();
        break;
      }
      case 'steal': {
        const cp = this.specialCar.mesh.position;
        G.hud.setObjective(s.label, this.distTo(cp.x, cp.z), null);
        if (G.player.car === this.specialCar) {
          G.police.reportCrime(1);
          G.peds.alarm(cp.x, cp.z, 18);
          this.nextStage();
        }
        break;
      }
      case 'collect': {
        let remaining = 0;
        let targetBag = null;
        for (const bag of this.props) {
          if (bag.userData.taken) continue;
          remaining++;
          if (!targetBag) targetBag = bag;
          bag.rotation.y += dt * 2.4;
          bag.position.y = 0.8 + Math.sin(G.time * 3 + bag.userData.index) * 0.15;
          if (this.distTo(bag.position.x, bag.position.z) < 2.6) {
            bag.userData.taken = true;
            bag.visible = false;
            this.collected++;
            G.audio.pickup();
            G.hud.notify(`Cash bag collected (${this.collected}/${s.count})`);
            if (this.collected === 1) {
              G.police.reportCrime(2);
              this.say([['DET. CALLOWAY', 'All units: a robbery in progress on the docks. Move.']]);
            }
          }
        }
        G.hud.setObjective(`${s.label} (${this.collected}/${s.count})`,
          targetBag ? this.distTo(targetBag.position.x, targetBag.position.z) : 0, null);
        if (this.collected >= s.count) this.nextStage();
        break;
      }
      case 'checkpoints': {
        const pt = s.points[this.checkpointIdx];
        G.hud.setObjective(`${s.label} (${this.checkpointIdx}/${s.points.length})`, this.distTo(pt.x, pt.z), this.stageT);
        if (this.distTo(pt.x, pt.z) < 11) {
          this.checkpointIdx++;
          G.audio.pickup();
          if (this.checkpointIdx === 1) G.police.reportCrime(1);
          if (this.checkpointIdx >= s.points.length) this.nextStage();
        }
        break;
      }
      case 'fight': {
        const alive = G.combat.aliveCount();
        G.hud.setObjective(`${s.label} (${s.count - alive}/${s.count})`, this.distTo(s.at.x, s.at.z), null);
        if (alive === 0 && G.combat.enemies.length > 0) this.nextStage();
        break;
      }
      case 'pickup': {
        G.hud.setObjective(s.label, this.distTo(s.at.x, s.at.z), null);
        if (G.player.mode === 'foot' && this.distTo(s.at.x, s.at.z) < 2.4) {
          G.audio.pickup();
          this.nextStage();
        }
        break;
      }
      case 'rob': {
        const vp = this.specialCar.mesh.position;
        const near = G.player.mode === 'foot' && this.distTo(vp.x, vp.z) < 5.5;
        G.hud.setObjective(s.label, this.distTo(vp.x, vp.z), null);
        if (near) {
          this.robT += dt;
          G.hud.notify(`Robbing the van… ${Math.ceil(5 - this.robT)}`);
          if (this.robT >= 5) {
            G.police.setWanted(4);
            this.say([['DET. CALLOWAY', 'There you are, Mari. All units — the casino van, now!']]);
            G.addMoney(600);
            this.nextStage();
          }
        } else {
          this.robT = Math.max(0, this.robT - dt);
        }
        break;
      }
      case 'escape': {
        G.hud.setObjective(s.label, null, null);
        if (G.police.stars === 0) this.nextStage();
        break;
      }
      default:
        break;
    }
  }
}
