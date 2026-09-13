/**
 * Core types for Sunken Hold. This module — and everything else under
 * src/rules — is pure: no three.js, no DOM, no I/O. See DESIGN.md §6.1.
 */

/** Where a diver is. `ledge` is 1-based; ledge 1 is the topmost, nearest the surface. */
export type Position =
  | { kind: 'surface' }
  | { kind: 'ledge'; trench: number; ledge: number }
  | { kind: 'scored' };

export interface Diver {
  id: string;
  owner: number;
  /** 0-based index among that player's divers, for display ("A1", "A2"). */
  index: number;
  pos: Position;
}

export interface Trench {
  id: number;
  name: string;
  depth: number;
  /** costs[i] is the cost to enter ledge i+1. */
  costs: number[];
  /** Remaining treasure tokens, richest first. */
  treasure: number[];
  /** True once picked clean: no diver may enter, divers inside continue. */
  closed: boolean;
  /** stacks[i] holds the diver ids on ledge i+1, bottom of the stack first. */
  stacks: string[][];
}

export interface Player {
  id: number;
  name: string;
  hand: number[];
  /** Treasure tokens collected. */
  tokens: number[];
}

export type Action =
  /** Move `diver` one ledge deeper, discarding the hand cards at `cards` (indices). */
  | { kind: 'descend'; diver: string; cards: number[]; trench?: number }
  /** Discard the whole hand and draw a fresh one. Costs the entire turn. */
  | { kind: 'refresh' };

export type GameEvent =
  | { t: 'cards-spent'; player: number; values: number[] }
  | { t: 'hand-discarded'; player: number; values: number[] }
  | { t: 'hand-refilled'; player: number; drawn: number[] }
  | { t: 'deck-reshuffled'; size: number }
  | { t: 'diver-entered'; player: number; diver: string; trench: number }
  | {
      t: 'stack-moved';
      trench: number;
      /** 0 means "from the surface". */
      from: number;
      to: number;
      /** Bottom of the moving group first; index 0 is the diver that paid. */
      divers: string[];
    }
  | { t: 'treasure-taken'; player: number; diver: string; trench: number; value: number }
  | { t: 'trench-closed'; trench: number }
  | { t: 'divers-recalled'; trench: number; divers: string[] }
  | { t: 'end-triggered'; player: number; reason: 'all-surfaced' | 'trenches-closed' | 'air-out' }
  | { t: 'turn-passed'; to: number }
  | { t: 'game-over'; scores: number[] };

/** Variant switches, so playtests can A/B the balance levers in DESIGN.md §10. */
export interface RulesConfig {
  handSize: number;
  diversPerPlayer: number;
  /** How many of the trench definitions are in play. Fewer means more contention. */
  trenchCount: number;
  /** Cap on how many divers ride along for free; null means unlimited. */
  maxRiders: number | null;
  /** Whether refreshing is legal even when a descend is available. */
  allowVoluntaryRefresh: boolean;
  /**
   * The air clock: how many times the deck may be exhausted and reshuffled
   * before the game ends regardless of what anyone does. Guarantees
   * termination — see DESIGN.md §3.6.
   */
  airLimit: number;
  /**
   * How many of each card value 1..6 are in the air deck. Weighting it toward
   * low values makes exact sums easier to hit and is the main lever against
   * forced refreshes — DESIGN.md §10.
   */
  deckComposition: number[];
}

export const DEFAULT_CONFIG: RulesConfig = {
  handSize: 5,
  diversPerPlayer: 4,
  trenchCount: 4,
  maxRiders: null,
  allowVoluntaryRefresh: false,
  airLimit: 6,
  deckComposition: [16, 14, 11, 8, 6, 5],
};

/** Counters for playtest instrumentation; not part of the rules. */
export interface GameStats {
  refreshes: number[];
  forcedRefreshes: number[];
  ridesGiven: number[];
  ridesTaken: number[];
  cardsSpent: number[];
  /** Divers recalled empty-handed when their trench was stripped. */
  aborted: number[];
}

export interface GameState {
  seed: number;
  rngState: number;
  config: RulesConfig;
  players: Player[];
  divers: Record<string, Diver>;
  trenches: Trench[];
  deck: number[];
  discard: number[];
  /** How many times the deck has been exhausted and reshuffled. */
  reshuffles: number;
  current: number;
  turn: number;
  /** Set when the end condition fires; the round finishes before the game ends. */
  endTriggeredBy: number | null;
  over: boolean;
  stats: GameStats;
}
