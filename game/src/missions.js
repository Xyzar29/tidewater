// TIDEWATER — the six-mission story of Mari Vega and fixer Dario Fuentes.
// Detective Ruth Calloway voices the Port Serena PD pressure between jobs.

import { MISSION_REWARDS } from './config.js';
import { createCarMesh, makeCarState, syncCarMesh } from './vehicles.js';

export const MISSION_DEFS = [
  {
    name: 'First Run', startAt: 'garage',
    intro: [
      ['Dario Fuentes', 'Mari. Simple job: this package goes to the marina. Fast, clean, no questions.'],
      ['Mari Vega', 'Courier work. Sure, Dario. I was never much for questions.'],
    ],
    objective: 'Drive the package to the marina',
  },
  {
    name: 'Hot Wheels', startAt: 'garage',
    intro: [
      ['Dario Fuentes', 'A yellow sports car sits outside the Serena Hotel. My client wants it. So do I.'],
      ['Mari Vega', 'Stealing cars now. My resume just gets better.'],
      ['Det. Ruth Calloway', 'Port Serena PD is watching the beachfront tonight. Tread carefully.'],
    ],
    objective: 'Steal the yellow sports car at the Serena Hotel',
  },
  {
    name: 'Night Deposit', startAt: 'garage',
    intro: [
      ['Dario Fuentes', 'Three cash bags were left at the docks. Pick them up, lose the heat, come home.'],
      ['Mari Vega', 'And if the heat finds me first?'],
      ['Dario Fuentes', 'Then drive like the tide is chasing you.'],
    ],
    objective: 'Collect the cash bags at the docks (0/3)',
  },
  {
    name: 'Harbor Lights', startAt: 'marina',
    intro: [
      ['Dario Fuentes', 'My drivers swear nobody can run all six harbor lights in time. Prove them wrong.'],
      ['Mari Vega', 'Six checkpoints. One city. Watch me.'],
    ],
    objective: 'Hit checkpoint 1 of 6',
  },
  {
    name: 'Cold Trail', startAt: 'warehouse',
    intro: [
      ['Dario Fuentes', 'A rival crew is holding my briefcase at the warehouse. Go on foot. Go ready.'],
      ['Mari Vega', 'Four of them, one of me. I like those odds better than rent day.'],
    ],
    objective: 'Clear the rival crew at the warehouse',
  },
  {
    name: 'Last Tide', startAt: 'casino',
    intro: [
      ['Dario Fuentes', 'Last job, Mari. The armoured cash van at the casino. Take it, shake Calloway, reach my boat.'],
      ['Det. Ruth Calloway', 'Vega! Whatever you are planning — this city is mine tonight.'],
      ['Mari Vega', 'Then come and take it back, Detective.'],
    ],
    objective: 'Rob the armoured cash van at the casino',
  },
];

export class MissionSystem {
  constructor(scene, landmarks, hud, audio) {
    this.scene = scene; this.L = landmarks; this.hud = hud; this.audio = audio;
    this.nextIndex = 0; this.active = null; this.stage = 0;
    this.timer = -1; this.collected = 0; this.checkpoint = 0; this.channel = 0;
    this.dialogueQueue = []; this.dialogueT = 0; this.finishedAll = false;
    // beacon marker
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 14, 12, 1, true);
    this.beacon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.position.y = 7; scene.add(this.beacon);
    this.pickups = [];
    this.van = null;
  }
  // Interaction points sit on the street in FRONT of each landmark —
  // the building centres themselves are inside their own colliders.
  front(name) { const L = this.L[name]; return { x: L.x, z: L.z + 13 }; }
  startPos() {
    if (this.nextIndex >= MISSION_DEFS.length) return null;
    return this.front(MISSION_DEFS[this.nextIndex].startAt);
  }
  markerPos() {
    if (this.active) return this.activeTarget;
    return this.startPos();
  }
  queueDialogue(lines) { this.dialogueQueue = lines.slice(); this.dialogueT = 0; if (this.dialogueQueue.length) { const [n, t] = this.dialogueQueue[0]; this.hud.showDialogue(n, t); } }

  startMission(ctx) {
    const def = MISSION_DEFS[this.nextIndex];
    this.active = def; this.stage = 0; this.collected = 0; this.checkpoint = 0; this.channel = 0;
    this.queueDialogue(def.intro);
    this.hud.notify('MISSION: ' + def.name, 4000);
    this.setupStage(ctx);
  }
  setupStage(ctx) {
    const L = this.L; const idx = this.nextIndex;
    this.clearPickups();
    if (idx === 0) { this.activeTarget = this.front('marina'); this.timer = 100; }
    if (idx === 1) { this.activeTarget = ctx.traffic.sportCar; this.timer = -1; }
    if (idx === 2) {
      this.activeTarget = null; this.timer = -1;
      const spots = [{ x: L.marina.x - 14, z: L.marina.z + 10 }, { x: L.marina.x + 6, z: L.marina.z + 22 }, { x: L.marina.x - 26, z: L.marina.z - 4 }];
      for (const s of spots) this.addPickup(s.x, s.z, 0x59d977);
    }
    if (idx === 3) { this.checkpoints = this.makeCheckpoints(); this.activeTarget = this.checkpoints[0]; this.timer = 160; }
    if (idx === 4) {
      this.activeTarget = { x: L.warehouse.x, z: L.warehouse.z };
      if (ctx.combat.enemies.length === 0) {
        ctx.combat.spawnEnemy(L.warehouse.x + 6, L.warehouse.z + 4);
        ctx.combat.spawnEnemy(L.warehouse.x - 7, L.warehouse.z - 3);
        ctx.combat.spawnEnemy(L.warehouse.x + 3, L.warehouse.z - 8);
        ctx.combat.spawnEnemy(L.warehouse.x - 4, L.warehouse.z + 8);
      }
      this.timer = -1;
    }
    if (idx === 5) {
      if (!this.van) {
        this.van = makeCarState(L.casino.x + 4, L.casino.z + 14, 0, 'van');
        this.van.mesh = createCarMesh('van', 0xb9c0c9); this.scene.add(this.van.mesh); syncCarMesh(this.van);
      }
      this.activeTarget = this.van; this.timer = -1;
    }
  }
  makeCheckpoints() {
    const L = this.L;
    return [this.front('marina'), this.front('hotel'), this.front('casino'),
      this.front('safehouse'), this.front('warehouse'), this.front('garage')];
  }
  addPickup(x, z, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, 0.8, z); this.scene.add(m);
    this.pickups.push({ x, z, mesh: m, taken: false });
  }
  clearPickups() { for (const p of this.pickups) this.scene.remove(p.mesh); this.pickups = []; }

  fail(ctx, reason) {
    this.hud.notify('MISSION FAILED — ' + reason, 4000);
    this.queueDialogue([['Dario Fuentes', 'That went sideways. Come back and we run it again.']]);
    this.active = null; this.timer = -1; this.clearPickups(); ctx.combat.clearEnemies();
  }
  complete(ctx) {
    const reward = MISSION_REWARDS[this.nextIndex];
    ctx.addMoney(reward); this.audio.success();
    this.hud.notify('MISSION COMPLETE — $' + reward, 4500);
    const wasLast = this.nextIndex === MISSION_DEFS.length - 1;
    this.nextIndex++; this.active = null; this.timer = -1; this.clearPickups();
    if (wasLast) { this.finishedAll = true; if (ctx.onStoryEnd) ctx.onStoryEnd(); }
    ctx.save();
  }
  objectiveText() {
    if (!this.active) {
      if (this.nextIndex >= MISSION_DEFS.length) return 'Free roam — Port Serena is yours.';
      return 'Next job: "' + MISSION_DEFS[this.nextIndex].name + '" — meet Dario\'s contact at the marker';
    }
    const idx = this.nextIndex;
    if (idx === 1 && this.stage === 1) return 'Deliver the sports car to Dario\'s garage';
    if (idx === 2 && this.stage === 0) return 'Collect the cash bags at the docks (' + this.collected + '/3)';
    if (idx === 2 && this.stage === 1) return 'Lose the wanted level, then reach the safehouse';
    if (idx === 3) return 'Hit checkpoint ' + (this.checkpoint + 1) + ' of 6';
    if (idx === 4 && this.stage === 1) return 'Take the briefcase';
    if (idx === 4 && this.stage === 2) return 'Escape — deliver the briefcase to the garage';
    if (idx === 5 && this.stage === 1) return 'Escape to the boat at the marina!';
    return this.active.objective;
  }

  update(dt, ctx) {
    // dialogue cycling
    if (this.dialogueQueue.length) {
      this.dialogueT += dt;
      if (this.dialogueT > 3.4) {
        this.dialogueT = 0; this.dialogueQueue.shift();
        if (this.dialogueQueue.length) { const [n, t] = this.dialogueQueue[0]; this.hud.showDialogue(n, t); }
        else this.hud.hideDialogue();
      }
    }
    const pp = ctx.player.pos;
    // beacon placement
    const mp = this.markerPos();
    if (mp) { this.beacon.visible = true; this.beacon.position.x = mp.x; this.beacon.position.z = mp.z; this.beacon.rotation.y += dt; }
    else this.beacon.visible = false;

    if (!this.active) {
      const sp = this.startPos();
      if (sp) {
        const d = Math.hypot(pp.x - sp.x, pp.z - sp.z);
        if (d < 4.5) this.startMission(ctx);
      }
      return;
    }
    // timers
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail(ctx, 'out of time'); return; }
    }
    const idx = this.nextIndex;
    const near = (t, r) => t && Math.hypot(pp.x - t.x, pp.z - t.z) < (r || 5.5);

    if (idx === 0) { if (near(this.activeTarget, 7)) this.complete(ctx); }
    else if (idx === 1) {
      if (this.stage === 0) {
        if (ctx.player.mode === 'car' && ctx.player.car === ctx.traffic.sportCar) {
          this.stage = 1; this.activeTarget = this.front('garage'); ctx.police.commitCrime('theft');
          this.hud.notify('Car stolen! Deliver it to the garage.', 3500);
        }
      } else if (near(this.front('garage'), 7) && ctx.player.car === ctx.traffic.sportCar) this.complete(ctx);
    }
    else if (idx === 2) {
      if (this.stage === 0) {
        for (const p of this.pickups) {
          if (!p.taken && Math.hypot(pp.x - p.x, pp.z - p.z) < 3.2) {
            p.taken = true; p.mesh.visible = false; this.collected++; this.audio.pickup();
            if (this.collected === 1) ctx.police.setStars(2);
            this.hud.notify('Cash bag collected (' + this.collected + '/3)', 2500);
          }
        }
        if (this.collected >= 3) { this.stage = 1; this.activeTarget = this.front('safehouse'); }
      } else {
        this.activeTarget = ctx.police.stars > 0 ? null : this.front('safehouse');
        if (ctx.police.stars === 0 && near(this.front('safehouse'), 6)) this.complete(ctx);
      }
    }
    else if (idx === 3) {
      if (near(this.activeTarget, 7)) {
        this.checkpoint++; this.audio.pickup();
        if (this.checkpoint >= 6) this.complete(ctx);
        else { this.activeTarget = this.checkpoints[this.checkpoint]; this.hud.notify('Checkpoint ' + this.checkpoint + '/6', 2000); }
      }
    }
    else if (idx === 4) {
      if (this.stage === 0) {
        this.activeTarget = { x: this.L.warehouse.x, z: this.L.warehouse.z };
        if (ctx.combat.aliveEnemies() === 0 && near(this.activeTarget, 26)) {
          const wf = this.front('warehouse'); this.stage = 1; this.addPickup(wf.x, wf.z, 0xffd21f);
          this.activeTarget = wf;
          this.hud.notify('Crew cleared — grab the briefcase!', 3000);
        }
      } else if (this.stage === 1) {
        const p = this.pickups[0];
        if (p && !p.taken && Math.hypot(pp.x - p.x, pp.z - p.z) < 3) { p.taken = true; p.mesh.visible = false; this.stage = 2; this.activeTarget = this.front('garage'); this.audio.pickup(); }
      } else if (near(this.front('garage'), 7)) this.complete(ctx);
    }
    else if (idx === 5) {
      if (this.stage === 0) {
        if (near(this.van, 5)) {
          this.channel += dt;
          if (this.channel > 2.2) {
            this.stage = 1; ctx.police.setStars(4); ctx.addMoney(500);
            this.activeTarget = { x: this.L.marina.x, z: this.L.marina.z + 26 };
            this.hud.notify('Van robbed! Get to the boat!', 3500);
            this.queueDialogue([['Det. Ruth Calloway', 'All units — the casino van is hit. Do not let Vega reach the water!']]);
          }
        } else this.channel = Math.max(0, this.channel - dt);
      } else if (near(this.activeTarget, 7)) this.complete(ctx);
    }
    // spin pickups
    for (const p of this.pickups) if (!p.taken) { p.mesh.rotation.y += dt * 2; p.mesh.position.y = 0.8 + Math.sin(performance.now() / 300) * 0.15; }
  }
}
