import type { GameEvent, GameState } from '../rules/index.js';

export interface Narration {
  text: string;
  tone: 'normal' | 'good' | 'bad';
}

/**
 * One line of play-by-play per event, phrased in fiction. Shared by the
 * terminal game and the browser log — this is how players learn the line rule.
 */
export function narrate(state: GameState, event: GameEvent): Narration | null {
  const name = (p: number) => state.players[p]?.name ?? `Player ${String.fromCharCode(65 + p)}`;
  const trench = (t: number) => state.trenches[t]?.name ?? `trench ${t}`;

  switch (event.t) {
    case 'cards-spent':
      return { text: `${name(event.player)} spends ${event.values.join('+')}`, tone: 'normal' };
    case 'hand-discarded':
      return { text: `${name(event.player)} surfaces for air — nothing was affordable`, tone: 'bad' };
    case 'stack-moved': {
      const [mover, ...riders] = event.divers;
      const where =
        event.from === 0
          ? `enters ${trench(event.trench)}`
          : `drops to ledge ${event.to} of ${trench(event.trench)}`;
      const ride = riders.length ? `, carrying ${riders.join(' ')} for free` : '';
      return { text: `${mover} ${where}${ride}`, tone: riders.length ? 'good' : 'normal' };
    }
    case 'treasure-taken':
      return event.value > 0
        ? { text: `${event.diver} reaches the wreck and surfaces with ${event.value}`, tone: 'good' }
        : { text: `${event.diver} reaches the wreck — stripped bare, nothing left`, tone: 'bad' };
    case 'deck-reshuffled':
      return { text: `The spent air is shuffled back into the deck — ${event.size} cards`, tone: 'normal' };
    case 'air-recovered':
      return {
        text:
          `${name(event.player)} surfaces for air — ${event.recovered} cards back, ` +
          `${event.burnt.join('+') || 'none'} burnt for good`,
        tone: 'bad',
      };
    case 'out-of-air':
      return { text: `${name(event.player)} is out of air and is pulled out`, tone: 'bad' };
    case 'trench-closed':
      return { text: `${trench(event.trench)} is picked clean and closes`, tone: 'bad' };
    case 'divers-recalled':
      return { text: `${event.divers.join(' ')} abort the dive and surface with nothing`, tone: 'bad' };
    case 'end-triggered':
      return { text: `${name(event.player)} triggers the end — final round`, tone: 'normal' };
    case 'game-over':
      return { text: 'Game over', tone: 'normal' };
    default:
      return null;
  }
}
