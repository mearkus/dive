import type { GameState } from './types.js';

export interface Standing {
  player: number;
  name: string;
  score: number;
  surfaced: number;
  stranded: number;
  /** Divers that came back with treasure, as opposed to aborting empty-handed. */
  hauls: number;
  bestHaul: number;
}

export function scores(state: GameState): number[] {
  return state.players.map((p) => p.tokens.reduce((a, b) => a + b, 0));
}

/** Sorted best first. Ties break on divers surfaced, then on the single best haul. */
export function standings(state: GameState): Standing[] {
  const divers = Object.values(state.divers);
  const rows: Standing[] = state.players.map((p) => {
    const mine = divers.filter((d) => d.owner === p.id);
    return {
      player: p.id,
      name: p.name,
      score: p.tokens.reduce((a, b) => a + b, 0),
      surfaced: mine.filter((d) => d.pos.kind === 'scored').length,
      stranded: mine.filter((d) => d.pos.kind !== 'scored').length,
      hauls: p.tokens.length,
      bestHaul: p.tokens.length ? Math.max(...p.tokens) : 0,
    };
  });
  return rows.sort(
    (a, b) => b.score - a.score || b.hauls - a.hauls || b.bestHaul - a.bestHaul || a.player - b.player,
  );
}

/** Winner, or null on a dead-exact tie across every tiebreak. */
export function winner(state: GameState): Standing | null {
  const table = standings(state);
  if (table.length === 0) return null;
  const [first, second] = table;
  if (
    second &&
    second.score === first.score &&
    second.hauls === first.hauls &&
    second.bestHaul === first.bestHaul
  ) {
    return null;
  }
  return first;
}
