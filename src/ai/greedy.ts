import {
  legalDescends,
  canRefresh,
  mulberry32,
  scores,
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
  /**
   * How much more a free ride costs when it goes to a dangerous rival: the
   * leader, or a player down to their last diver (who ends the game when it
   * surfaces). 0 is the old score-blind bot.
   */
  scoreAware?: number;
  threatWeights?: ThreatWeights;
  seed?: number;
}

export interface ThreatWeights {
  /** Extra cost of towing the player who leads me, at a 10-point lead. */
  leader: number;
  /** Extra cost of towing a rival's last diver still in the water. */
  lastDiver: number;
}

/**
 * Tuned at 1,000 games a setting: these weights cut the times a bot tows the
 * leader or a rival's last diver to the wreck or the ledge above it by about
 * a quarter, and leave the bot no weaker than the score-blind one.
 */
export const THREAT: ThreatWeights = { leader: 2, lastDiver: 2 };

/**
 * How much worse it is to hand `owner` progress than to hand it to an
 * average rival: more for the leader and for a player whose last diver is
 * still in the water.
 */
export function threat(state: GameState, owner: number, me: number, weight = 1, w: ThreatWeights = THREAT): number {
  if (weight <= 0) return 1;
  const banked = scores(state);
  const top = Math.max(...banked);
  let factor = 1;
  const lead = banked[owner] - banked[me];
  // Leads me: scaled by how far, so a one-point lead is not a crisis.
  if (banked[owner] === top && lead > 0) factor += weight * w.leader * Math.min(1, lead / 10);
  const left = Object.values(state.divers).filter((d) => d.owner === owner && d.pos.kind !== 'scored').length;
  if (left === 1) factor += weight * w.lastDiver;
  return factor;
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
  const scoreAware = options.scoreAware ?? 1;
  const weights = options.threatWeights ?? THREAT;
  const rng: Rng = mulberry32(options.seed ?? 0x5eed);

  return {
    name: (noise > 0 ? `greedy(noise=${noise})` : 'greedy') + (scoreAware === 1 ? '' : `[score=${scoreAware}]`),
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

        // Every rider above gets the same progress for free — and it matters
        // who: towing the leader, or a rival's last diver, can hand them the game.
        for (const rider of descend.riders) {
          const owner = state.divers[rider].owner;
          if (owner === state.current) continue;
          const gain = descend.reachesWreck
            ? potential(trench)
            : positionValue(trench, descend.toLedge) - positionValue(trench, fromLedge);
          score -= gain * altruism * threat(state, owner, state.current, scoreAware, weights);
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

        // Exact payment first; a push burns its cards for good, so it is only
        // worth it when there is no exact line at all.
        const exact = descend.combos[0];
        const cheapest = exact ?? descend.pushCombos[0];
        if (!cheapest) continue;
        score -= cheapest.length * 0.12 + descend.cost * 0.04;
        if (!exact) score -= 0.8 + cheapest.length * 0.5;
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
