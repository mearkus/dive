import type { Action, GameState, Trench } from './types.js';

/** A candidate descend: one diver, one target ledge, every way to pay for it. */
export interface LegalDescend {
  diver: string;
  trench: number;
  trenchName: string;
  from: { kind: 'surface' } | { kind: 'ledge'; trench: number; ledge: number };
  /** 1-based target ledge. */
  toLedge: number;
  cost: number;
  /** Distinct payment combinations, as indices into the mover's hand. */
  combos: number[][];
  /** Divers dragged along for free, bottom first. Empty when entering from the surface. */
  riders: string[];
  /** True when the target ledge is the trench floor. */
  reachesWreck: boolean;
}

/**
 * Every distinct way to pay `target` exactly from `hand`, as index sets.
 * Combinations that spend the same multiset of values are deduplicated — two
 * 3s in hand offer one way to pay 3, not two.
 */
export function combosFor(hand: number[], target: number): number[][] {
  const out: number[][] = [];
  if (target <= 0 || hand.length === 0 || hand.length > 20) return out;
  const seen = new Set<string>();
  for (let mask = 1; mask < 1 << hand.length; mask++) {
    let sum = 0;
    const picked: number[] = [];
    for (let i = 0; i < hand.length; i++) {
      if (mask & (1 << i)) {
        sum += hand[i];
        picked.push(i);
        if (sum > target) break;
      }
    }
    if (sum !== target) continue;
    const key = picked
      .map((i) => hand[i])
      .sort((a, b) => a - b)
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(picked);
  }
  out.sort((a, b) => a.length - b.length);
  return out;
}

/** The group that moves when `diver` descends: the diver plus the riders above it. */
export function movingGroup(state: GameState, trench: Trench, ledge: number, diver: string): string[] {
  const stack = trench.stacks[ledge - 1];
  const idx = stack.indexOf(diver);
  if (idx < 0) return [diver];
  const riders = stack.slice(idx + 1);
  const cap = state.config.maxRiders;
  const carried = cap === null ? riders : riders.slice(0, cap);
  return [diver, ...carried];
}

/** Every descend available to the player to move, whether or not they can pay. */
function candidateDescends(state: GameState): LegalDescend[] {
  const out: LegalDescend[] = [];
  const player = state.players[state.current];

  for (const diver of Object.values(state.divers)) {
    if (diver.owner !== state.current) continue;

    if (diver.pos.kind === 'surface') {
      for (const trench of state.trenches) {
        if (trench.closed) continue;
        const cost = trench.costs[0];
        out.push({
          diver: diver.id,
          trench: trench.id,
          trenchName: trench.name,
          from: diver.pos,
          toLedge: 1,
          cost,
          combos: combosFor(player.hand, cost),
          riders: [],
          reachesWreck: trench.depth === 1,
        });
      }
    } else if (diver.pos.kind === 'ledge') {
      const trench = state.trenches[diver.pos.trench];
      const toLedge = diver.pos.ledge + 1;
      if (toLedge > trench.depth) continue;
      const cost = trench.costs[toLedge - 1];
      out.push({
        diver: diver.id,
        trench: trench.id,
        trenchName: trench.name,
        from: diver.pos,
        toLedge,
        cost,
        combos: combosFor(player.hand, cost),
        riders: movingGroup(state, trench, diver.pos.ledge, diver.id).slice(1),
        reachesWreck: toLedge === trench.depth,
      });
    }
  }
  return out;
}

/** Descends the player can actually afford right now. */
export function legalDescends(state: GameState): LegalDescend[] {
  if (state.over) return [];
  return candidateDescends(state).filter((d) => d.combos.length > 0);
}

/** Flattened action list — one entry per (move, payment). Includes refresh when legal. */
export function legalActions(state: GameState): Action[] {
  if (state.over) return [];
  const actions: Action[] = [];
  for (const descend of legalDescends(state)) {
    for (const combo of descend.combos) {
      actions.push({ kind: 'descend', diver: descend.diver, cards: combo, trench: descend.trench });
    }
  }
  if (canRefresh(state)) actions.push({ kind: 'refresh' });
  return actions;
}

/**
 * Refreshing is always available by default (it costs a whole turn), and is
 * the anti-deadlock valve when nothing can be paid for — DESIGN.md §10.
 */
export function canRefresh(state: GameState): boolean {
  if (state.over) return false;
  if (state.players[state.current].hand.length === 0) return true;
  return state.config.allowVoluntaryRefresh || legalDescends(state).length === 0;
}

/** True when the player has no descend available and must refresh. */
export function isForcedRefresh(state: GameState): boolean {
  return legalDescends(state).length === 0;
}
