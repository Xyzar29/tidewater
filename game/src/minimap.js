// minimap.js — the canvas radar: player-centred, north-up. Roads, the sea,
// traffic dots, flashing police blips, rival dots, the gold mission target
// and Mari's arrow, redrawn every frame from live game state.
import { S, STREETS, ROAD_HALF, SEA_Z, BEACH_Z } from './config.js';

export function createMinimap(g) {
  const cv = document.getElementById('minimap');
  const ctx = cv.getContext('2d');
  const W = cv.width, RANGE = 95, SCALE = (W / 2) / RANGE;

  function draw() {
    const pp = g.player.pos();
    const info = g.player.info();
    const mx = (x) => W / 2 + (x - pp.x) * SCALE;
    const mz = (z) => W / 2 + (z - pp.z) * SCALE;
    ctx.fillStyle = '#18242f';
    ctx.fillRect(0, 0, W, W);
    // beach + sea to the south
    if (mz(BEACH_Z) < W) {
      ctx.fillStyle = '#6f6242';
      ctx.fillRect(0, Math.max(0, mz(BEACH_Z)), W, Math.max(0, mz(SEA_Z) - mz(BEACH_Z)));
    }
    if (mz(SEA_Z) < W) {
      ctx.fillStyle = '#1f6f8b';
      ctx.fillRect(0, Math.max(0, mz(SEA_Z)), W, W);
    }
    // roads
    ctx.fillStyle = '#2e3a47';
    for (const c of STREETS) {
      if (Math.abs(mx(c)) < W) ctx.fillRect(mx(c) - ROAD_HALF * SCALE, 0, ROAD_HALF * 2 * SCALE, W);
      if (Math.abs(mz(c)) < W) ctx.fillRect(0, mz(c) - ROAD_HALF * SCALE, W, ROAD_HALF * 2 * SCALE);
    }
    // traffic
    ctx.fillStyle = '#cfd8e3';
    for (const c of g.cars) {
      if (c.driver !== 'traffic') continue;
      const x = mx(c.mesh.position.x), y = mz(c.mesh.position.z);
      if (x < -3 || y < -3 || x > W + 3 || y > W + 3) continue;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // rivals
    ctx.fillStyle = '#ff6b6b';
    if (g.combat) for (const r of g.combat.rivals) {
      if (!r.alive) continue;
      const x = mx(r.mesh.position.x), y = mz(r.mesh.position.z);
      if (x < -3 || y < -3 || x > W + 3 || y > W + 3) continue;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
    }
    // police — flashing red/blue
    if (g.police) for (const c of g.police.cars) {
      const x = mx(c.mesh.position.x), y = mz(c.mesh.position.z);
      if (x < -4 || y < -4 || x > W + 4 || y > W + 4) continue;
      ctx.fillStyle = Math.floor(S.time * 5.5) % 2 ? '#ff4040' : '#4a7dff';
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    }
    // mission target — gold diamond
    const t = g.missions.currentTarget();
    if (t) {
      const x = Math.max(8, Math.min(W - 8, mx(t.x)));
      const y = Math.max(8, Math.min(W - 8, mz(t.z)));
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffc93c';
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    }
    // player arrow
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(Math.atan2(Math.sin(info.heading), -Math.cos(info.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.6, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  return { draw };
}
