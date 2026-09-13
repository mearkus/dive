import type { GameState, Trench } from '../rules/index.js';

/** What the richest remaining token in a trench is worth to a diver heading down it. */
export function potential(trench: Trench): number {
  return trench.treasure[0] ?? 0;
}

/**
 * Positional value of standing on `ledge` of `trench`. Superlinear, so progress
 * matters more the closer a diver is to the wreck, which is what makes late
 * free rides expensive to hand out.
 */
export function positionValue(trench: Trench, ledge: number): number {
  if (trench.closed && trench.treasure.length === 0) return 0;
  const progress = ledge / trench.depth;
  return potential(trench) * progress * progress;
}

/** How far into the endgame we are, 0..1 — used to punish stranded divers late. */
export function urgency(state: GameState): number {
  const divers = Object.values(state.divers);
  const scored = divers.filter((d) => d.pos.kind === 'scored').length;
  const closed = state.trenches.filter((t) => t.closed).length / state.trenches.length;
  return Math.max(scored / divers.length, closed, state.endTriggeredBy !== null ? 1 : 0);
}
