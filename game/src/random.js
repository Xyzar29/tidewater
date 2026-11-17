// TIDEWATER — seeded RNG (mulberry32) so ?seed=N worlds are reproducible.

export function createRNG(seed) {
  let a = (seed >>> 0) || 1;
  function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
  };
}

export function parseSeed() {
  const q = new URLSearchParams(location.search);
  const s = parseInt(q.get('seed') || '1', 10);
  return Number.isFinite(s) ? s : 1;
}
