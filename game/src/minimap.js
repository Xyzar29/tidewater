// Canvas minimap: north-up, player-centred, ~240 m across. Roads and the
// shoreline are drawn from the same grid constants as the 3D city, then
// blips: traffic as pale dots, police flashing red/blue, gunmen dark red,
// cash pickups gold, and the mission target as a gold diamond that clamps
// to the rim when it is off-screen. The player is a white arrow.

import { WORLD } from './config.js';

const { lines, roadHalf, beachZ, seaZ } = WORLD;
const SIZE = 184;
const RANGE = 240; // metres across the map
const SCALE = SIZE / RANGE;

export function createMinimap(G) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const p = G.player;

  function toMap(x, z) {
    return [
      SIZE / 2 + (x - p.x) * SCALE,
      SIZE / 2 + (z - p.z) * SCALE,
    ];
  }
  function dot(x, z, r, color) {
    const [mx, my] = toMap(x, z);
    if (mx < -6 || my < -6 || mx > SIZE + 6 || my > SIZE + 6) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = '#232b33';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Sea and sand along the south.
    const [, sandY] = toMap(0, beachZ);
    const [, seaY] = toMap(0, seaZ);
    if (seaY < SIZE) {
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(0, Math.max(0, sandY), SIZE, Math.max(0, seaY - sandY));
      ctx.fillStyle = '#2e7fa8';
      ctx.fillRect(0, Math.max(0, seaY), SIZE, SIZE);
    }
    // Roads.
    ctx.strokeStyle = '#59616b';
    ctx.lineWidth = roadHalf * 2 * SCALE;
    ctx.beginPath();
    for (const l of lines) {
      const [vx] = toMap(l, 0);
      if (vx > -20 && vx < SIZE + 20) { ctx.moveTo(vx, 0); ctx.lineTo(vx, SIZE); }
      const [, hy] = toMap(0, l);
      if (hy > -20 && hy < SIZE + 20) { ctx.moveTo(0, hy); ctx.lineTo(SIZE, hy); }
    }
    ctx.stroke();

    for (const pk of G.city.pickups) if (!pk.taken) dot(pk.x, pk.z, 2, '#ffd23e');
    for (const car of G.cars) {
      if (car.dead || car.occupant === 'player') continue;
      if (car.kind === 'traffic') dot(car.x, car.z, 1.6, 'rgba(240,240,240,0.65)');
    }
    if (G.combat) for (const gm of G.combat.gunmen) if (!gm.dead) dot(gm.x, gm.z, 2.4, '#c0392b');
    if (G.police) {
      const flash = Math.floor(G.time * 2.4) % 2 === 0;
      for (const car of G.police.cars) {
        if (!car.dead) dot(car.x, car.z, 2.8, flash ? '#ff4040' : '#4d7dff');
      }
    }
    // Mission target, clamped to the rim.
    const target = G.missions ? G.missions.target : null;
    if (target) {
      let [mx, my] = toMap(target.x, target.z);
      mx = Math.max(10, Math.min(SIZE - 10, mx));
      my = Math.max(10, Math.min(SIZE - 10, my));
      ctx.fillStyle = '#ffd23e';
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    // Player arrow. Canvas y grows southward like world +z, and the
    // triangle is drawn pointing up, so the rotation is PI - heading.
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(Math.PI - p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }

  return { draw };
}
