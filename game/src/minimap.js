// TIDEWATER — canvas minimap: roads, player arrow, police blips, markers.

import { CITY } from './config.js';
import { roadX, roadZ } from './city.js';

export function drawMinimap(canvas, view) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const range = 130; // world metres shown across the map
  const scale = W / (range * 2);
  const cx = W / 2, cy = H / 2;
  ctx.fillStyle = '#20313d'; ctx.fillRect(0, 0, W, H);
  const toMap = (x, z) => [cx + (x - view.player.x) * scale, cy + (z - view.player.z) * scale];
  // beach / sea band
  ctx.fillStyle = '#2e86ab';
  const seaY = cy + (118 - view.player.z) * scale;
  if (seaY < H) ctx.fillRect(0, Math.max(0, seaY), W, H);
  // roads
  ctx.strokeStyle = '#8b95a1'; ctx.lineWidth = Math.max(2, CITY.roadWidth * scale * 0.7);
  for (let i = 0; i < CITY.gridX; i++) { const [x] = toMap(roadX(i), 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let j = 0; j < CITY.gridZ; j++) { const [, y] = toMap(0, roadZ(j)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // traffic dots
  ctx.fillStyle = '#cfd6dd';
  for (const c of view.traffic || []) { const [x, y] = toMap(c.x, c.z); if (x > -4 && x < W + 4 && y > -4 && y < H + 4) ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
  // mission marker
  if (view.marker) {
    const [x, y] = toMap(view.marker.x, view.marker.z);
    ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.arc(Math.max(6, Math.min(W - 6, x)), Math.max(6, Math.min(H - 6, y)), 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#173f5f'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', Math.max(6, Math.min(W - 6, x)), Math.max(6, Math.min(H - 6, y)) + 3);
  }
  // police blips flash red/blue
  const flash = Math.floor(performance.now() / 350) % 2 === 0;
  for (const c of view.police || []) {
    const [x, y] = toMap(c.x, c.z);
    if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
    ctx.fillStyle = flash ? '#ff3355' : '#3388ff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
  }
  // player arrow
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-view.heading + Math.PI);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
}
