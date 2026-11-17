// localStorage persistence: money, story progress and where Mari was
// standing. Deliberately tiny and defensive — a corrupt or missing save
// must never stop the game from booting.

const KEY = 'tidewater-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (typeof data.money !== 'number' || typeof data.missionsDone !== 'number') return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    /* storage blocked or full: play on without persisting */
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch (err) {
    /* nothing to clear */
  }
}
