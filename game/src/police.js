// police.js — the Port Serena PD: wanted heat, pursuit, and the bust.
//
// Heat is a single 0–500 meter; every 100 points shows as a star. Crimes
// (reported through addHeat) raise it. Cruisers spawn on roads a few
// blocks away, hunt by pure pursuit with a little prediction, and try to
// ram or box Mari in. If she is stopped with a cruiser close, the BUSTED
// meter fills. Break line of sight — no cruiser near — and heat bleeds
// away star by star until the slate is clean.

import {
  HEAT_PER_STAR, MAX_STARS, HEAT_DECAY_PER_SEC, HEAT_DECAY_DELAY,
  BUST_TIME, MAX_POLICE, AVENUES, STREETS,
} from './config.js';
import { createCar, removeCar } from './vehicles.js';

const COPS_BY_STARS = [0, 1, 2, 3, 4, 6];

export function initPolice(G) {
  G.wanted = { heat: 0, stars: 0, unseenFor: 99, busted: 0 };
  G.policeCars = [];
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(MAX_STARS, Math.ceil(heat / HEAT_PER_STAR));
}

// Report a crime. Witnessed crimes also reset the "unseen" clock.
export function addHeat(G, pts, witnessed = true) {
  const w = G.wanted;
  w.heat = Math.max(0, Math.min(MAX_STARS * HEAT_PER_STAR, w.heat + pts));
  w.stars = starsForHeat(w.heat);
  if (witnessed) w.unseenFor = 0;
}

// Scripted heat for missions: exactly N stars, no more, no less.
export function setWanted(G, stars) {
  const w = G.wanted;
  w.heat = stars <= 0 ? 0 : (stars - 1) * HEAT_PER_STAR + 50;
  w.stars = starsForHeat(w.heat);
  w.unseenFor = 0;
  w.busted = 0;
}

function spawnCop(G) {
  const p = G.playerPos;
  // Pick a road point 70–120 m from the player.
  for (let tries = 0; tries < 12; tries++) {
    const onAve = G.rng.chance(0.5);
    const coord = onAve ? G.rng.pick(AVENUES) : G.rng.pick(STREETS);
    const along = (onAve ? p.z : p.x) + G.rng.range(70, 120) * G.rng.sign();
    const x = onAve ? coord : Math.max(-290, Math.min(290, along));
    const z = onAve ? Math.max(-290, Math.min(290, along)) : coord;
    if (Math.hypot(x - p.x, z - p.z) < 55) continue;
    const heading = Math.atan2(p.x - x, p.z - z);
    const car = createCar(G, 'police', 0x1d2733, x, z, heading, 'police');
    car.ai = { mode: 'pursue' };
    G.policeCars.push(car);
    return car;
  }
  return null;
}

export function updatePolice(G, dt) {
  const w = G.wanted;
  const p = G.playerPos;
  const playerSpeed = G.player.inCar ? Math.abs(G.player.inCar.speed) : 0;

  // Sight: any active cruiser within 60 m keeps the heat fresh.
  let nearest = Infinity;
  for (const cop of G.policeCars) {
    const d = Math.hypot(cop.x - p.x, cop.z - p.z);
    if (d < nearest) nearest = d;
  }
  if (nearest < 60 || w.stars === 0) w.unseenFor = 0;
  else w.unseenFor += dt;

  // Decay once she's been unseen for a while.
  if (w.heat > 0 && w.unseenFor > HEAT_DECAY_DELAY) {
    w.heat = Math.max(0, w.heat - HEAT_DECAY_PER_SEC * dt);
    w.stars = starsForHeat(w.heat);
  }

  // Keep the fleet at the size the stars demand.
  const want = COPS_BY_STARS[w.stars] || 0;
  if (G.policeCars.length < want) spawnCop(G);
  for (let i = G.policeCars.length - 1; i >= 0; i--) {
    const cop = G.policeCars[i];
    if (cop.driver === 'player') { G.policeCars.splice(i, 1); continue; } // she stole it!
    if (G.policeCars.length > want || Math.hypot(cop.x - p.x, cop.z - p.z) > 260) {
      removeCar(G, cop);
      G.policeCars.splice(i, 1);
    }
  }

  // Pursuit driving.
  for (const cop of G.policeCars) {
    if (cop.dead || !cop.ai || cop.ai.mode === 'staged') continue;
    // Predict a touch ahead of the player's motion.
    let tx = p.x, tz = p.z;
    if (G.player.inCar) {
      const c = G.player.inCar;
      tx += Math.sin(c.heading) * c.speed * 0.45;
      tz += Math.cos(c.heading) * c.speed * 0.45;
    }
    const dist = Math.hypot(tx - cop.x, tz - cop.z);
    const desired = Math.atan2(tx - cop.x, tz - cop.z);
    let diff = desired - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.input.steer = Math.max(-1, Math.min(1, diff * 2.2));

    let wantSpeed = dist > 42 ? 34 : 27;
    // When she's stopped, pull up alongside instead of ramming forever.
    if (dist < 9 && playerSpeed < 1.5) wantSpeed = 0;
    else if (dist < 5) wantSpeed = Math.min(wantSpeed, 8);
    cop.input.throttle = cop.speed < wantSpeed ? 1 : 0;
    cop.input.brake = cop.speed > wantSpeed + 2 || (wantSpeed === 0 && cop.speed > 0.5);
  }

  // Lightbars: alternate red/blue strobe.
  const phase = Math.floor(G.time * 5) % 2;
  G.policeCars.forEach((cop, i) => {
    const u = cop.mesh.userData;
    if (!u.barL) return;
    const on = (phase + i) % 2 === 0;
    u.barL.color.setHex(on ? 0xff2a2a : 0x571111);
    u.barR.color.setHex(on ? 0x11408f : 0x2a6bff);
  });

  // The bust: stopped, with a cruiser close, and the meter fills.
  const stopped = G.player.inCar ? playerSpeed < 1.2 : true;
  const onFootStill = !G.player.inCar && !(G.keys['KeyW'] || G.keys['KeyA'] || G.keys['KeyS'] || G.keys['KeyD']);
  if (w.stars > 0 && nearest < 10.5 && (G.player.inCar ? stopped : onFootStill)) {
    w.busted = Math.min(1, w.busted + dt / BUST_TIME);
    if (w.busted >= 1 && G.onBusted) G.onBusted();
  } else {
    w.busted = Math.max(0, w.busted - dt * 1.4);
  }

  if (G.audio) G.audio.siren(w.stars > 0 && G.policeCars.length > 0);
}

// Clear the slate (busted, wasted, safehouse, mission scripts).
export function clearWanted(G) {
  setWanted(G, 0);
  for (let i = G.policeCars.length - 1; i >= 0; i--) {
    if (G.policeCars[i].driver !== 'player') removeCar(G, G.policeCars[i]);
  }
  G.policeCars = G.policeCars.filter((c) => c.driver === 'player');
}
