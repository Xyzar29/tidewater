// minimap.js — the radar: a north-up, player-centred canvas map. Roads,
// the sea, traffic dots, flashing red/blue police blips, enemies and the
// gold mission marker, redrawn every frame from live game state.

import { PITCH, GRID, SEA_Z } from './config.js';

const LINES = [];
for (let k = -GRID; k <= GRID; k++) LINES.push(k * PITCH);
const VIEW = 118; // metres from centre to edge

export function drawMinimap(canvas, G) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const scale = cx / VIEW;
  const p = G.player.pos;
  const toX = (x) => cx + (x - p.x) * scale;
  const toY = (z) => cy + (z - p.z) * scale;

  ctx.fillStyle = '#232a31';
  ctx.fillRect(0, 0, W, H);

  // The sea, when the coast is in view.
  const seaY = toY(SEA_Z);
  if (seaY < H) {
    ctx.fillStyle = '#2f8fb8';
    ctx.fillRect(0, Math.max(0, seaY), W, H - Math.max(0, seaY));
    ctx.fillStyle = '#f2ddae';
    ctx.fillRect(0, Math.max(0, seaY - 12 * scale), W, 12 * scale);
  }

  // Roads.
  ctx.strokeStyle = '#4d565f';
  ctx.lineWidth = Math.max(2, 7 * scale);
  ctx.beginPath();
  for (const l of LINES) {
    const x = toX(l);
    if (x > -10 && x < W + 10) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    const y = toY(l);
    if (y > -10 && y < H + 10) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  }
  ctx.stroke();

  // Traffic: pale dots.
  ctx.fillStyle = '#c9ced4';
  for (const car of G.traffic.cars) {
    const x = toX(car.mesh.position.x), y = toY(car.mesh.position.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }

  // Enemies: red dots.
  ctx.fillStyle = '#ff5147';
  for (const e of G.combat.enemies) {
    if (!e.alive) continue;
    const x = toX(e.mesh.position.x), y = toY(e.mesh.position.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Police: blips that alternate red/blue, like the light bars.
  const phase = Math.floor(G.time * 5) % 2 === 0;
  for (const car of G.police.cars) {
    const x = toX(car.mesh.position.x), y = toY(car.mesh.position.z);
    const bx = Math.max(4, Math.min(W - 4, x)), by = Math.max(4, Math.min(H - 4, y));
    ctx.fillStyle = phase ? '#ff3b30' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mission marker: a gold diamond, clamped to the edge when far away.
  const marker = G.missions ? G.missions.markerPos() : null;
  if (marker) {
    let x = toX(marker.x), y = toY(marker.z);
    x = Math.max(9, Math.min(W - 9, x));
    y = Math.max(9, Math.min(H - 9, y));
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a5c00';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Mari: a white arrow pointing her way (north is up).
  const h = G.player.heading;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx + Math.sin(h) * 8, cy + Math.cos(h) * 8);
  ctx.lineTo(cx + Math.sin(h + 2.5) * 6, cy + Math.cos(h + 2.5) * 6);
  ctx.lineTo(cx + Math.sin(h - 2.5) * 6, cy + Math.cos(h - 2.5) * 6);
  ctx.closePath();
  ctx.fill();

  // North tick.
  ctx.fillStyle = '#e8e4d2';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, 12);
}
