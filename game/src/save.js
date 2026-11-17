// save.js — localStorage persistence: money, story progress, position.
// Continue on the title screen picks up exactly where Mari left off.
import { S } from './config.js';

const KEY = 'tidewater-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function saveGame(g) {
  try {
    const p = g.player.pos();
    localStorage.setItem(KEY, JSON.stringify({
      money: S.money, missionIndex: S.missionIndex, x: p.x, z: p.z,
    }));
  } catch (e) { /* private mode etc. — saving is best-effort */ }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
