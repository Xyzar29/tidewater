// random.js — a small seeded RNG (mulberry32). A given ?seed always grows the
// same Port Serena: same buildings, same traffic, same luck.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randRange = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(randRange(rng, lo, hi + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
