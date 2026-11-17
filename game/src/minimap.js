// minimap.js — the corner map: a north-up, player-centred canvas.
//
// Roads are drawn from the same lattice the city is built on, the sea sits
// to the east, and everything alive gets a dot: traffic in pale grey,
// pedestrians fainter still, police as flashing red/blue blips, and the
// mission beacon as a gold diamond (clamped to the rim when it's far).

import { AVENUES, STREETS, BEACH_ROAD_X, WATER_X } from './config.js';

const VIEW = 125; // metres from centre to rim

export function initMinimap(G) {
  const canvas = document.getElementById('minimap');
  G.minimap = { canvas, ctx: canvas.getContext('2d'), frame: 0 };
}

export function drawMinimap(G) {
  const mm = G.minimap;
  if (!mm || !mm.ctx) return;
  mm.frame++;
  if (mm.frame % 2) return; // 30 Hz is plenty for a map
  const ctx = mm.ctx;
  const W = mm.canvas.width, H = mm.canvas.height;
  const cx = W / 2, cy = H / 2;
  const scale = (W / 2) / VIEW;
  const p = G.playerPos;
  const toMap = (x, z) => [cx + (x - p.x) * scale, cy + (z - p.z) * scale];

  ctx.fillStyle = '#232a31';
  ctx.fillRect(0, 0, W, H);

  // Sea and sand on the east.
  const [wx] = toMap(WATER_X, 0);
  ctx.fillStyle = '#2a7ab0';
  ctx.fillRect(Math.max(0, wx), 0, W, H);
  const [sx] = toMap(292, 0);
  ctx.fillStyle = '#e8d5a4';
  ctx.fillRect(Math.max(0, sx), 0, Math.max(0, wx - sx), H);

  // Roads.
  ctx.strokeStyle = '#4a5158';
  ctx.lineWidth = Math.max(2, 18 * scale * 0.5);
  ctx.beginPath();
  for (const a of AVENUES) {
    const [x] = toMap(a, 0);
    if (x < -10 || x > W + 10) continue;
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (const s of STREETS) {
    const [, y] = toMap(0, s);
    if (y < -10 || y > H + 10) continue;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  const [bx] = toMap(BEACH_ROAD_X, 0);
  ctx.moveTo(bx, 0); ctx.lineTo(bx, H);
  ctx.stroke();

  // Traffic and pedestrians.
  ctx.fillStyle = '#c9ced4';
  for (const car of G.cars) {
    if (car.driver === 'police' || car === (G.player && G.player.inCar)) continue;
    const [x, y] = toMap(car.x, car.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  ctx.fillStyle = 'rgba(220,220,220,0.4)';
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const [x, y] = toMap(ped.x, ped.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // Police blips flash red/blue.
  const flash = Math.floor(G.time * 3) % 2 === 0;
  for (const cop of G.policeCars) {
    let [x, y] = toMap(cop.x, cop.z);
    x = Math.max(6, Math.min(W - 6, x));
    y = Math.max(6, Math.min(H - 6, y));
    ctx.fillStyle = flash ? '#ff4040' : '#3a7bff';
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 6.29); ctx.fill();
  }

  // Mission beacon: a gold diamond, clamped to the rim when far away.
  if (G.beacon && G.beacon.visible) {
    let [x, y] = toMap(G.beacon.position.x, G.beacon.position.z);
    x = Math.max(8, Math.min(W - 8, x));
    y = Math.max(8, Math.min(H - 8, y));
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y);
    ctx.closePath(); ctx.fill();
  }

  // The player arrow, pointing along her heading.
  const heading = G.player.inCar ? G.player.inCar.heading : (G.player ? G.player.heading : 0);
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const px = -fz, pz = fx; // perpendicular
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx + fx * 9, cy + fz * 9);
  ctx.lineTo(cx - fx * 6 + px * 5, cy - fz * 6 + pz * 5);
  ctx.lineTo(cx - fx * 6 - px * 5, cy - fz * 6 - pz * 5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
