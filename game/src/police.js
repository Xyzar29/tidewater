// police.js — the PSPD: a 0–5 star wanted system fed by crimes, cruisers that
// spawn out of sight and hunt with predicted intercepts, a BUSTED meter for
// when Mari is caught standing still, and heat that bleeds away unseen.
import { S, CFG, STREETS } from './config.js';
import { createCar, driveCar } from './vehicles.js';
import { pick } from './random.js';

const CRIME_HEAT = { theft: 100, hitped: 200, shot: 55, ram: 70, punch: 40, rob: 400 };

const RADIO_LINES = [
  'All units, she is on the move. Box her in.',
  'Calloway here. I want that car stopped, not scratched.',
  'Suspect is making us look slow, people.',
  'She knows these streets. Learn faster.',
];

export function createPolice(g) {
  const cars = [];
  let spawnT = 0, radioCd = 0, lastWanted = 0;

  function recompute() {
    S.wanted = S.heat <= 0 ? 0 : Math.min(5, Math.ceil(S.heat / CFG.starHeat));
  }
  function nearestStreet(v) {
    return STREETS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  }
  function spawnPos() {
    const pp = g.player.pos();
    for (let i = 0; i < 10; i++) {
      const a = g.rng() * Math.PI * 2, d = 100 + g.rng() * 35;
      const sx = nearestStreet(pp.x + Math.cos(a) * d);
      const sz = nearestStreet(pp.z + Math.sin(a) * d);
      if (Math.hypot(sx - pp.x, sz - pp.z) > 78) return { x: sx, z: sz };
    }
    return { x: nearestStreet(pp.x + 115), z: nearestStreet(pp.z) };
  }
  function spawnCar(x, z, heading) {
    const car = createCar('police', 0xf0f2f0);
    car.driver = 'police';
    car.mesh.position.set(x, 0, z);
    car.heading = heading || 0;
    car.mesh.rotation.y = car.heading;
    g.scene.add(car.mesh); g.cars.push(car); cars.push(car);
    return car;
  }

  const api = {
    cars,
    reportCrime(kind) {
      S.heat += CRIME_HEAT[kind] || 40;
      if (kind === 'theft') S.heat = Math.max(S.heat, CFG.starHeat);
      recompute();
    },
    setWanted(n) { S.heat = Math.max(S.heat, n * CFG.starHeat); recompute(); },
    clearWanted() { S.heat = 0; S.wanted = 0; S.bustedMeter = 0; },
    nearestDist() {
      const pp = g.player.pos();
      let d = Infinity;
      for (const c of cars) d = Math.min(d, Math.hypot(c.mesh.position.x - pp.x, c.mesh.position.z - pp.z));
      return d;
    },
    registerStatic(car) { car.driver = 'static'; cars.push(car); },
    spawnAt(x, z, heading) { return spawnCar(x, z, heading); },
    update(dt) {
      const pp = g.player.pos();
      const info = g.player.info();
      let nearest = Infinity, seen = false;
      for (const c of cars) {
        const d = Math.hypot(c.mesh.position.x - pp.x, c.mesh.position.z - pp.z);
        if (d < nearest) nearest = d;
        if (d < CFG.seenRange) seen = true;
      }
      if (seen) S.unseen = 0; else S.unseen += dt;
      if (S.unseen > 6 && S.heat > 0) { S.heat = Math.max(0, S.heat - 13 * dt); recompute(); }

      const desired = [0, 2, 3, 4, 5, 6][S.wanted] || 0;
      spawnT -= dt;
      const active = cars.filter(c => c.driver === 'police');
      if (active.length < desired && spawnT <= 0) {
        spawnT = 1.6;
        const sp = spawnPos();
        spawnCar(sp.x, sp.z, Math.atan2(pp.x - sp.x, pp.z - sp.z));
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        if (c.driver === 'police' && Math.hypot(c.mesh.position.x - pp.x, c.mesh.position.z - pp.z) > 250) {
          g.scene.remove(c.mesh);
          g.cars.splice(g.cars.indexOf(c), 1);
          cars.splice(i, 1);
        }
      }
      for (const car of cars) {
        if (car.bar) {
          const phase = Math.floor(S.time * 5.5) % 2;
          car.bar.children[0].visible = phase === 0;
          car.bar.children[1].visible = phase !== 0;
        }
        if (car.driver !== 'police') continue;
        const p = car.mesh.position;
        let tx = pp.x + info.vel.x * 0.45, tz = pp.z + info.vel.z * 0.45;
        const distP = Math.hypot(tx - p.x, tz - p.z);
        car.maxSpeed = distP > 70 ? 47 : 34.5; // rubber-band: distant units hurry (even a sports car feels pressure)
        if (distP > 20) {
          // Grid navigation: cruisers hunt along the streets, Manhattan-style —
          // a straight line at the suspect crosses city blocks and wedges the
          // car on a building face. Legs: own corner → the suspect's row or
          // column → the suspect's corner → charge (handled below 20m).
          const cx = nearestStreet(p.x), cz = nearestStreet(p.z);
          const jx = nearestStreet(pp.x), jz = nearestStreet(pp.z);
          if (Math.abs(p.x - cx) > 6 && Math.abs(p.z - cz) > 6) { tx = cx; tz = cz; }
          else if (Math.abs(p.x - cx) <= Math.abs(p.z - cz)) { // on a vertical street
            if (Math.abs(p.z - jz) > 6) { tx = cx; tz = jz; }
            else if (Math.abs(p.x - jx) > 6) { tx = jx; tz = jz; }
          } else { // on a horizontal street
            if (Math.abs(p.x - jx) > 6) { tx = jx; tz = cz; }
            else if (Math.abs(p.z - jz) > 6) { tx = jx; tz = jz; }
          }
        }
        const desiredH = Math.atan2(tx - p.x, tz - p.z);
        let diff = desiredH - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        let steer = Math.max(-1, Math.min(1, diff * 1.9));
        let throttle;
        if (car.reverseT > 0) {
          car.reverseT -= dt; throttle = -1; steer = -steer;
        } else {
          throttle = Math.abs(diff) > 1.6 ? 0.35 : 1;
          // pull up beside the suspect and stop — charging at full throttle
          // makes cruisers orbit through the player and the bust never lands
          if (distP < 15) throttle = Math.min(throttle, Math.max(0, (distP - 3) / 10) * 0.9);
          if (distP >= 8 && Math.abs(car.speed) < 0.6 && throttle > 0) {
            car.stuckT += dt;
            if (car.stuckT > 1.1) { car.reverseT = 0.75; car.stuckT = 0; }
          } else car.stuckT = 0;
        }
        driveCar(car, dt, throttle, steer, g, false);
      }
      // BUSTED: caught standing near a cruiser
      if (S.screen === 'playing' && S.wanted > 0) {
        if (nearest < CFG.bustedRange && Math.abs(info.speed) < 1.2) {
          S.bustedMeter = Math.min(1, S.bustedMeter + CFG.bustedFill * dt);
          if (S.bustedMeter >= 1) { g.onBusted(); return; }
        } else {
          S.bustedMeter = Math.max(0, S.bustedMeter - CFG.bustedDecay * dt);
        }
      } else {
        S.bustedMeter = Math.max(0, S.bustedMeter - CFG.bustedDecay * dt);
      }
      // Calloway on the radio when the heat steps up
      radioCd -= dt;
      if (S.wanted > lastWanted && S.wanted >= 2 && radioCd <= 0 && S.screen === 'playing') {
        radioCd = 26;
        g.hud.showDialogue('DET. CALLOWAY', pick(g.rng, RADIO_LINES), 3.6);
      }
      lastWanted = S.wanted;
    },
  };
  return api;
}
