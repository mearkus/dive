import {
  apply,
  legalActions,
  mulberry32,
  shuffle,
  scores,
  type Action,
  type GameState,
  type Rng,
} from '../rules/index.js';
import { positionValue } from './heuristics.js';
import { greedy } from './greedy.js';
import type { Policy } from './policy.js';

export interface SearchOptions {
  /** Determinized playouts per candidate action. More is stronger and slower. */
  samples?: number;
  /** Turns to play out before evaluating. */
  horizon?: number;
  seed?: number;
}

/**
 * Opponent hands are hidden information. Replace them with a plausible deal
 * from the cards this player has not seen, keeping hand sizes intact.
 */
export function determinize(state: GameState, forPlayer: number, rng: Rng): GameState {
  const next = structuredClone(state);
  const pool: number[] = [...next.deck];
  for (const player of next.players) {
    if (player.id === forPlayer) continue;
    pool.push(...player.hand);
    player.hand = [];
  }
  shuffle(rng, pool);
  for (const player of next.players) {
    if (player.id === forPlayer) continue;
    const size = state.players[player.id].hand.length;
    for (let i = 0; i < size; i++) {
      const card = pool.pop();
      if (card !== undefined) player.hand.push(card);
    }
    player.hand.sort((a, b) => a - b);
  }
  next.deck = pool;
  next.rngState = rng.state;
  return next;
}

/** Static evaluation: treasure banked, plus partial credit for divers still descending. */
export function evaluate(state: GameState, forPlayer: number): number {
  const banked = scores(state);
  const positional = state.players.map(() => 0);
  for (const diver of Object.values(state.divers)) {
    if (diver.pos.kind !== 'ledge') continue;
    const trench = state.trenches[diver.pos.trench];
    // Divers in the water score nothing if the game ends — discount them hard.
    positional[diver.owner] += positionValue(trench, diver.pos.ledge) * 0.55;
  }
  const total = state.players.map((_, i) => banked[i] + positional[i]);
  const mine = total[forPlayer];
  const best = Math.max(...total.filter((_, i) => i !== forPlayer));
  return mine - best;
}

/**
 * Determinized playout search. For each legal action: sample hidden hands,
 * apply the action, let greedy bots play the position out, then evaluate.
 * Runs over the same pure reducer as the real game — see DESIGN.md §6.1.
 */
export function search(options: SearchOptions = {}): Policy {
  const samples = options.samples ?? 6;
  const horizon = options.horizon ?? 8;
  const rng: Rng = mulberry32(options.seed ?? 0xc0ffee);
  const rollout = greedy({ noise: 0.35, seed: (options.seed ?? 0xc0ffee) ^ 0x9e37 });

  return {
    name: `search(s=${samples},h=${horizon})`,
    choose(state: GameState): Action {
      const me = state.current;
      const candidates = dedupe(legalActions(state));
      if (candidates.length === 0) return { kind: 'refresh' };
      if (candidates.length === 1) return candidates[0];

      let best: { action: Action; value: number } | null = null;
      for (const action of candidates) {
        let total = 0;
        for (let s = 0; s < samples; s++) {
          const sample = determinize(state, me, rng);
          let node: GameState;
          try {
            node = apply(sample, action).state;
          } catch {
            total += -Infinity;
            break;
          }
          for (let step = 0; step < horizon && !node.over; step++) {
            const reply = rollout.choose(node);
            try {
              node = apply(node, reply).state;
            } catch {
              break;
            }
          }
          total += evaluate(node, me);
        }
        const value = total / samples;
        if (!best || value > best.value) best = { action, value };
      }
      return best!.action;
    },
  };
}

/** One action per (diver, target); the cheapest payment stands in for the rest. */
function dedupe(actions: Action[]): Action[] {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const action of actions) {
    const key = action.kind === 'refresh' ? 'refresh' : `${action.diver}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

export { greedy };
