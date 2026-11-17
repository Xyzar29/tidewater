// random.js — small seeded RNG (mulberry32) so a given ?seed=N always builds
// the same Port Serena: same buildings, same traffic, same luck.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  // float in [0, 1)
  float() {
    return this.next();
  }
  // float in [min, max)
  range(min, max) {
    return min + this.next() * (max - min);
  }
  // integer in [min, max] inclusive
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  // true with probability p
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // deterministic sub-stream keyed by a tag, so one system's draw count can
  // never reshuffle another system's layout
  fork(tag) {
    let h = 2166136261;
    const s = String(tag);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new RNG((h ^ Math.floor(this.next() * 0xffffffff)) >>> 0);
  }
}

// Parse the ?seed=N query parameter (default 1).
export function seedFromQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    const n = parseInt(q.get('seed') || '1', 10);
    return Number.isFinite(n) ? n : 1;
  } catch (e) {
    return 1;
  }
}
