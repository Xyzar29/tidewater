// save.js — the whole save system is one localStorage record: money, how
// far the story has progressed, where Mari was standing and what she was
// carrying. Continue on the title screen reads it back; New Game wipes it.

const KEY = 'tidewater-save-v1';

export function saveGame(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    // Private mode / quota — the game simply runs unsaved.
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number' || typeof data.mission !== 'number') return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    // Nothing to clear.
  }
}

export function hasSave() {
  return loadGame() !== null;
}
