import {
  DEFAULT_CONFIG,
  type Diver,
  type GameState,
  type Player,
  type RulesConfig,
  type Trench,
} from './types.js';
import { mulberry32, randInt, shuffle, type Rng } from './rng.js';

export interface TrenchDef {
  name: string;
  depth: number;
  treasure: number[];
}

/** DESIGN.md §3.7. Deeper trenches pay more and cost more to reach. */
export const TRENCH_DEFS: TrenchDef[] = [
  { name: 'Shelf Break', depth: 4, treasure: [3, 2, 1, 1] },
  { name: 'Kelp Chimney', depth: 5, treasure: [5, 3, 2, 1] },
  { name: 'The Gutter', depth: 6, treasure: [7, 5, 3, 2] },
  { name: 'Blacklip Wall', depth: 7, treasure: [9, 6, 4, 2] },
  { name: 'Sunken Hold', depth: 8, treasure: [12, 8, 5, 3] },
];

export const PLAYER_LETTERS = ['A', 'B', 'C', 'D'];

/** Build the air deck from a composition: counts of each value 1..6. */
export function buildDeck(composition: number[] = DEFAULT_CONFIG.deckComposition): number[] {
  const deck: number[] = [];
  composition.forEach((count, i) => {
    for (let n = 0; n < count; n++) deck.push(i + 1);
  });
  return deck;
}

/**
 * Ledge costs per DESIGN.md §3.7: cheap entry, rising with depth, and a floor
 * ledge that is never a bargain.
 */
export function rollCosts(rng: Rng, depth: number): number[] {
  const costs: number[] = [];
  for (let ledge = 1; ledge <= depth; ledge++) {
    if (ledge === 1) {
      costs.push(randInt(rng, 1, 2));
      continue;
    }
    const f = (ledge - 1) / (depth - 1);
    let cost: number;
    if (f < 1 / 3) cost = randInt(rng, 1, 3);
    else if (f < 2 / 3) cost = randInt(rng, 2, 5);
    else cost = randInt(rng, 3, 6);
    if (ledge === depth) cost = Math.max(3, cost);
    costs.push(cost);
  }
  return costs;
}

/**
 * Choose `count` trench definitions, spread across the depth range so a short
 * game still offers a cheap trench and a deep one.
 */
export function pickTrenches(count: number): TrenchDef[] {
  if (count < 1 || count > TRENCH_DEFS.length) {
    throw new Error(`trenchCount must be 1-${TRENCH_DEFS.length}, got ${count}`);
  }
  if (count === TRENCH_DEFS.length) return TRENCH_DEFS;
  const picked: TrenchDef[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(TRENCH_DEFS[Math.round((i * (TRENCH_DEFS.length - 1)) / (count - 1 || 1))]);
  }
  return picked;
}

export function diverId(owner: number, index: number): string {
  return `${PLAYER_LETTERS[owner] ?? String(owner)}${index + 1}`;
}

export function newGame(
  seed: number,
  playerCount: number,
  configOverrides: Partial<RulesConfig> = {},
  names?: string[],
): GameState {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`playerCount must be 2-4, got ${playerCount}`);
  }
  const config: RulesConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  const rng = mulberry32(seed);

  const trenches: Trench[] = pickTrenches(config.trenchCount).map((def, id) => ({
    id,
    name: def.name,
    depth: def.depth,
    costs: rollCosts(rng, def.depth),
    treasure: [...def.treasure],
    closed: false,
    stacks: Array.from({ length: def.depth }, () => [] as string[]),
  }));

  const divers: Record<string, Diver> = {};
  const players: Player[] = [];
  for (let p = 0; p < playerCount; p++) {
    players.push({
      id: p,
      name: names?.[p] ?? `Player ${PLAYER_LETTERS[p]}`,
      hand: [],
      tokens: [],
    });
    for (let i = 0; i < config.diversPerPlayer; i++) {
      const id = diverId(p, i);
      divers[id] = { id, owner: p, index: i, pos: { kind: 'surface' } };
    }
  }

  const deck = shuffle(rng, buildDeck(config.deckComposition));
  for (const player of players) {
    for (let i = 0; i < config.handSize; i++) {
      const card = deck.pop();
      if (card !== undefined) player.hand.push(card);
    }
    player.hand.sort((a, b) => a - b);
  }

  return {
    seed,
    rngState: rng.state,
    config,
    players,
    divers,
    trenches,
    deck,
    discard: [],
    reshuffles: 0,
    current: randInt(rng, 0, playerCount - 1),
    turn: 0,
    endTriggeredBy: null,
    over: false,
    stats: {
      refreshes: players.map(() => 0),
      forcedRefreshes: players.map(() => 0),
      ridesGiven: players.map(() => 0),
      ridesTaken: players.map(() => 0),
      cardsSpent: players.map(() => 0),
      aborted: players.map(() => 0),
    },
  };
}
