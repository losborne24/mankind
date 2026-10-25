/**
 * Deterministic pseudo-random number generation.
 *
 * Every procedural decision in the renderer — building placement, heights,
 * variants, tree scatter, smoke-puff offsets — must be reproducible: returning
 * to the same scene must reproduce the exact same world. We therefore never use
 * `Math.random()` in generation or animation. Instead we derive a 32-bit seed
 * from a stable string (`hashSeed`) and draw numbers from a tiny, fast,
 * well-distributed generator (`mulberry32`). Identical seeds ⇒ identical
 * streams, across machines and reloads.
 *
 * Pure module: no Three.js, no DOM.
 */

/**
 * Hash an arbitrary string into a 32-bit unsigned integer seed (xmur3).
 * Stable and platform-independent, so a scene/object id always yields the same
 * seed.
 */
export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** A deterministic random source bound to a seed. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniformly pick one element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** True with probability `p`. */
  chance(p: number): boolean;
}

/**
 * Create a deterministic {@link Rng} from a string or numeric seed. Based on
 * mulberry32 — small state, good statistical quality for visual scatter.
 */
export function makeRng(seed: string | number): Rng {
  let a = (typeof seed === "number" ? seed >>> 0 : hashSeed(seed)) || 1;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}
