// Seeded pseudo-random generator (mulberry32). Every random choice of the game goes through one of these so that a
// session seed (deep link miniworlds://seed/<n>) or a date hash makes the whole game deterministic.

export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** The current internal state, to fork or save a generator. */
  state(): number;
};

export function createRng(seed: number): Rng {
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
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    state: () => a,
  };
}

/** FNV-1a 32-bit hash: turns a local date ("2026-11-11") or any label into a seed. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seed that is random in normal play (not cryptographic; games are local). */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 4294967296) ^ (Date.now() & 0xffffffff)) >>> 0;
}

export const SEED_LINK_SCHEME = 'miniworlds';

export type TestLink = {
  seed: number;
  /** `/unlocked`: every world of this version is open for the session and nothing is written to the save. */
  unlocked: boolean;
};

/** `miniworlds://seed/<integer>[/unlocked]` → the seed and the flag; anything else → null. */
export function parseTestLink(url: string | null | undefined): TestLink | null {
  if (!url) return null;
  const match = /^miniworlds:\/\/seed\/(\d{1,10})(\/unlocked)?\/?$/.exec(url.trim());
  if (!match) return null;
  const seed = Number(match[1]);
  if (!Number.isSafeInteger(seed) || seed > 0xffffffff) return null;
  return { seed, unlocked: match[2] !== undefined };
}

/** `miniworlds://seed/<integer>` → the integer; anything else → null. */
export function parseSeedLink(url: string | null | undefined): number | null {
  return parseTestLink(url)?.seed ?? null;
}
