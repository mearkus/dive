/**
 * Seeded PRNG. Every random decision in the game flows through here so a game
 * is reproducible from (seed, playerCount, actions) — see DESIGN.md §6.4.
 */

export interface Rng {
  state: number;
  next(): number;
}

export function mulberry32(seed: number): Rng {
  const rng: Rng = {
    state: seed >>> 0,
    next() {
      rng.state = (rng.state + 0x6d2b79f5) >>> 0;
      let t = rng.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
  return rng;
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** Fisher-Yates, in place. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = items[i];
    items[i] = items[j];
    items[j] = a;
  }
  return items;
}
