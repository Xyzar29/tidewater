// TIDEWATER — localStorage save / continue.

const KEY = 'tidewater-save-v1';

export function saveGame(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
export function hasSave() { return !!loadGame(); }
