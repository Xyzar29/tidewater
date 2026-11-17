// random.js — a small seeded pseudo-random generator.
//
// The whole city is built from one of these so that a given ?seed=N always
// produces the same Port Serena: same buildings, same traffic colours, same
// staged screenshot scenes. The algorithm is mulberry32 — tiny, fast, and
// good enough for game dressing (never for anything security-shaped).

export class RNG {
  constructor(seed) {
    // mulberry32 keeps its state in a single 32-bit integer.
    this.state = (seed >>> 0) || 1;
  }

  // Next float in [0, 1).
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // True with probability p.
  chance(p) {
    return this.next() < p;
  }

  // One element of arr (arr must be non-empty).
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // A sign: -1 or +1.
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

// Turn a query-string seed (or anything else) into a uint32. Numbers pass
// through, strings are hashed with a simple FNV-1a so ?seed=serena works too.
export function seedFrom(value) {
  if (value === null || value === undefined || value === '') return 1;
  const n = Number(value);
  if (Number.isFinite(n)) return (Math.floor(n) >>> 0) || 1;
  let h = 2166136261 >>> 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}
