// random.js — a small seeded RNG (mulberry32) so a given ?seed=N always
// grows the same city, the same traffic and the same luck.

export class RNG {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }

  // Next float in [0, 1).
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
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

  // One element of an array.
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// Read the ?seed=N parameter (default 1) — used by the boot code so the
// scripted screenshot scenes are perfectly repeatable.
export function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = raw === null ? 1 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
