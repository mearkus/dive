import {
  legalDescends,
  canRefresh,
  mulberry32,
  type Action,
  type GameState,
  type Rng,
} from '../rules/index.js';
import { positionValue, potential, urgency } from './heuristics.js';
import type { Policy } from './policy.js';

export interface GreedyOptions {
  /** Random jitter added to each score; higher is weaker and less predictable. */
  noise?: number;
  /** How much the bot cares about the free ride it hands rivals, 0..1+. */
  altruismPenalty?: number;
  /** How much the bot values landing on top of a diver that might drag it deeper. */
  leechBonus?: number;
  /** Score a refresh must beat every descend by before the bot passes its turn. */
  refreshFloor?: number;
  seed?: number;
}

/**
 * One-ply heuristic bot: value the progress a move buys, subtract the progress
 * it gifts to every rider above, subtract a little for the cards it burns.
 */
export function greedy(options: GreedyOptions = {}): Policy {
  const noise = options.noise ?? 0;
  const altruism = options.altruismPenalty ?? 0.8;
  const leech = options.leechBonus ?? 0.6;
  const refreshFloor = options.refreshFloor ?? 0.02;
  const rng: Rng = mulberry32(options.seed ?? 0x5eed);

  return {
    name: noise > 0 ? `greedy(noise=${noise})` : 'greedy',
    choose(state: GameState): Action {
      const descends = legalDescends(state);
      const rush = urgency(state);

      let best: { action: Action; score: number } | null = null;

      for (const descend of descends) {
        const trench = state.trenches[descend.trench];
        const fromLedge = descend.from.kind === 'ledge' ? descend.from.ledge : 0;

        let score: number;
        if (descend.reachesWreck) {
          score = potential(trench) + 1.5;
        } else {
          score = positionValue(trench, descend.toLedge) - positionValue(trench, fromLedge);
        }

        // Every rider above gets the same progress for free.
        for (const rider of descend.riders) {
          const gain = descend.reachesWreck
            ? potential(trench)
            : positionValue(trench, descend.toLedge) - positionValue(trench, fromLedge);
          const theirs = state.divers[rider].owner === state.current ? 0 : gain * altruism;
          score -= theirs;
        }

        // Landing on an occupied ledge clips in above those divers: every
        // descent they pay for from here on drags this diver along free.
        if (!descend.reachesWreck) {
          const below = trench.stacks[descend.toLedge - 1];
          if (below.length > 0) {
            const rivals = below.filter((id) => state.divers[id].owner !== state.current).length;
            const stepValue =
              positionValue(trench, descend.toLedge + 1) - positionValue(trench, descend.toLedge);
            score += leech * stepValue * Math.min(1, rivals + below.length * 0.25);
          }
        }

        // Late on, a diver still in the water is worth nothing — push for the floor.
        score += rush * (descend.toLedge / trench.depth) * 1.5;

        const cheapest = descend.combos[0];
        score -= cheapest.length * 0.12 + descend.cost * 0.04;
        if (noise > 0) score += (rng.next() - 0.5) * 2 * noise;

        const action: Action = {
          kind: 'descend',
          diver: descend.diver,
          cards: cheapest,
          trench: descend.trench,
        };
        if (!best || score > best.score) best = { action, score };
      }

      // Refreshing is worth it only when nothing on the board is worth paying for.
      if (canRefresh(state)) {
        const refreshScore = refreshFloor + (noise > 0 ? (rng.next() - 0.5) * 2 * noise : 0);
        if (!best || best.score < refreshScore) return { kind: 'refresh' };
      }
      if (!best) return { kind: 'refresh' };
      return best.action;
    },
  };
}
