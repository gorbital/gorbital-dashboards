/** Deterministic PRNG (mulberry32) so mock data is identical on server and client. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    /** A gently wandering series, for charts that should look alive. */
    walk: (n: number, base: number, amp: number, min = 0) => {
      const out: number[] = [];
      let v = base;
      for (let i = 0; i < n; i++) {
        v += (next() - 0.5) * amp;
        v = Math.max(min, v + (base - v) * 0.15);
        out.push(v);
      }
      return out;
    },
    hex: (len: number) => {
      let s = "";
      for (let i = 0; i < len; i++) s += Math.floor(next() * 16).toString(16);
      return s;
    },
  };
}

/** The fixed "now" every mock uses: 2026-09-15T14:32:08Z. */
export const NOW = Date.UTC(2026, 8, 15, 14, 32, 8);
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
