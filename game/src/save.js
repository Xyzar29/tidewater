// save.js — localStorage persistence: money, story progress, position and
// pistol reserves. Continue on the title screen picks up where Mari left off.

const KEY = 'tidewater-save-v1';

export function createSave(G) {
  function save() {
    try {
      const data = {
        money: Math.floor(G.state.money),
        nextIndex: G.missions ? G.missions.nextIndex : 0,
        x: G.player.x,
        z: G.player.z,
        reserve: G.combat ? G.combat.weapon.reserve : 120,
      };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* private mode etc. — saving is best-effort */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.money !== 'number') return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function apply(data) {
    G.state.money = data.money;
    if (G.missions) G.missions.nextIndex = data.nextIndex || 0;
    if (G.combat) G.combat.weapon.reserve = data.reserve !== undefined ? data.reserve : 120;
    G.player.teleport(data.x !== undefined ? data.x : -225, data.z !== undefined ? data.z : -192, 0);
    G.player.health = 100;
  }

  return { save, load, clear, apply, has: () => load() !== null };
}
