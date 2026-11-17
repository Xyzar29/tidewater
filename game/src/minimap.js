// minimap.js — north-up canvas radar: street grid, beach + sea, traffic
// dots, flashing police blips, the gold mission marker and Mari's arrow.

import { ROADS_X, ROADS_Z, BEACH_ROAD_Z } from './config.js';

export function createMinimap(G) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const SIZE = canvas.width; // 190
  const VIEW = 125; // metres from centre to edge
  const scale = SIZE / 2 / VIEW;

  function update() {
    const p = G.player;
    const cx = SIZE / 2, cy = SIZE / 2;
    const toX = (x) => cx + (x - p.x) * scale;
    const toY = (z) => cy + (z - p.z) * scale;
    ctx.fillStyle = '#20262c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // sea + sand to the south
    const seaY = toY(296);
    if (seaY < SIZE) {
      ctx.fillStyle = '#c9b078';
      ctx.fillRect(0, Math.max(0, toY(240)), SIZE, Math.max(0, seaY - toY(240)));
      ctx.fillStyle = '#2f7fb8';
      ctx.fillRect(0, Math.max(0, seaY), SIZE, SIZE - Math.max(0, seaY));
    }
    // roads
    ctx.strokeStyle = '#4a545e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const rx of ROADS_X) {
      const x = toX(rx);
      if (x < -6 || x > SIZE + 6) continue;
      ctx.moveTo(x, Math.max(0, toY(-322)));
      ctx.lineTo(x, Math.min(SIZE, toY(232)));
    }
    for (const rz of [...ROADS_Z, BEACH_ROAD_Z]) {
      const y = toY(rz);
      if (y < -6 || y > SIZE + 6) continue;
      ctx.moveTo(Math.max(0, toX(-322)), y);
      ctx.lineTo(Math.min(SIZE, toX(322)), y);
    }
    ctx.stroke();
    // traffic dots
    ctx.fillStyle = 'rgba(230,235,240,0.75)';
    for (const car of G.cars) {
      if (car.driver === 'police' || car.driver === 'player') continue;
      const x = toX(car.x), y = toY(car.z);
      if (x < 0 || x > SIZE || y < 0 || y > SIZE) continue;
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    // enemies
    if (G.combat) {
      ctx.fillStyle = '#e5484d';
      for (const e of G.combat.enemies) {
        if (e.dead) continue;
        const x = toX(e.x), y = toY(e.z);
        if (x < 0 || x > SIZE || y < 0 || y > SIZE) continue;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // police blips, alternating red/blue like the lightbar
    if (G.police) {
      const phase = Math.floor(G.state.time * 2.4) % 2;
      ctx.fillStyle = phase ? '#ff4040' : '#4d7cff';
      for (const u of G.police.units) {
        const x = toX(u.x), y = toY(u.z);
        if (x < 0 || x > SIZE || y < 0 || y > SIZE) continue;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // mission marker (gold diamond, clamped to the rim when far)
    const obj = G.missions ? G.missions.objective : null;
    let mx = null, my = null;
    if (obj && obj.x !== null && obj.x !== undefined) { mx = obj.x; my = obj.z; }
    else if (G.missions && !G.missions.active && G.missions.nextIndex < 6 && G.state.screen === 'playing') {
      mx = 135; my = 86;
    }
    if (mx !== null) {
      let x = toX(mx), y = toY(my);
      x = Math.max(9, Math.min(SIZE - 9, x));
      y = Math.max(9, Math.min(SIZE - 9, y));
      ctx.fillStyle = '#ffc93d';
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
    }
    // player arrow
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const rxv = -fz, rzv = fx;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + fx * 8, cy + fz * 8);
    ctx.lineTo(cx - fx * 6 + rxv * 5, cy - fz * 6 + rzv * 5);
    ctx.lineTo(cx - fx * 6 - rxv * 5, cy - fz * 6 - rzv * 5);
    ctx.closePath();
    ctx.fill();
    // rim
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }

  return { update };
}
