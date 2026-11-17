// save.js — the localStorage save: money, story progress, position.
//
// One JSON blob under one key. Written whenever something worth keeping
// changes (mission complete, cash pickup, busted/wasted fines), read once
// at boot to offer Continue on the title screen. Corrupt or missing data
// is simply "no save" — the game must never fail to start over a bad blob.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number' || typeof data.next !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function storeSave(G) {
  try {
    const p = G.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money,
      next: G.progress.next,
      done: G.progress.done,
      x: Math.round(G.playerPos.x),
      z: Math.round(G.playerPos.z),
      mag: G.combat.mag,
      reserve: G.combat.reserve,
    }));
  } catch (e) { /* private mode etc. — saving is a courtesy, not a promise */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
