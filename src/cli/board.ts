import {
  standings,
  type GameEvent,
  type GameState,
} from '../rules/index.js';

const COL = 17;

function cell(text: string): string {
  const t = text.length > COL - 1 ? text.slice(0, COL - 2) + '…' : text;
  return t.padEnd(COL, ' ');
}

/** Diver labels are already "A1"/"B3" — owner letter plus diver number. */
function stackLabel(ids: string[]): string {
  return ids.join(' ');
}

export function renderBoard(state: GameState): string {
  const lines: string[] = [];
  const maxDepth = Math.max(...state.trenches.map((t) => t.depth));

  const surface = Object.values(state.divers)
    .filter((d) => d.pos.kind === 'surface')
    .map((d) => d.id)
    .sort();
  lines.push('');
  lines.push(`  SURFACE  ${surface.length ? surface.join(' ') : '(empty)'}`);
  lines.push('');
  lines.push('       ' + state.trenches.map((t) => cell(t.closed ? `${t.name} ✗` : t.name)).join(''));

  for (let ledge = 1; ledge <= maxDepth; ledge++) {
    const row = state.trenches.map((t) => {
      if (ledge > t.depth) return cell('');
      const stack = t.stacks[ledge - 1];
      const cost = `[${t.costs[ledge - 1]}]`;
      return cell(stack.length ? `${cost} ${stackLabel(stack)}` : cost);
    });
    lines.push(`   L${String(ledge).padEnd(2)} ` + row.join(''));
  }

  lines.push(
    '  WRECK ' +
      state.trenches.map((t) => cell(t.treasure.length ? t.treasure.join(' ') : '— picked clean')).join(''),
  );
  lines.push('');
  for (const row of standings(state)) {
    lines.push(
      `   ${row.name.padEnd(10)} ${String(row.score).padStart(3)} pts   ` +
        `surfaced ${row.surfaced}  in the water ${row.stranded}`,
    );
  }
  lines.push('');
  lines.push(
    `   deck ${state.deck.length}  discard ${state.discard.length}  turn ${state.turn}` +
      (state.endTriggeredBy !== null ? '   ** final round **' : ''),
  );
  return lines.join('\n');
}

export function renderHand(hand: number[]): string {
  return hand.map((c, i) => `${i}:${c}`).join('  ');
}

export function describeEvent(state: GameState, event: GameEvent): string | null {
  const name = (p: number) => state.players[p]?.name ?? `P${p}`;
  const trench = (t: number) => state.trenches[t]?.name ?? `trench ${t}`;
  switch (event.t) {
    case 'cards-spent':
      return `${name(event.player)} spends ${event.values.join('+')}`;
    case 'hand-discarded':
      return `${name(event.player)} surfaces for air, dumping ${event.values.join(' ')}`;
    case 'stack-moved': {
      const [mover, ...riders] = event.divers;
      const where =
        event.from === 0
          ? `enters ${trench(event.trench)}`
          : `drops to L${event.to} of ${trench(event.trench)}`;
      const ride = riders.length ? `, carrying ${riders.join(' ')} for free` : '';
      return `  ${mover} ${where}${ride}`;
    }
    case 'treasure-taken':
      return event.value > 0
        ? `  ${event.diver} reaches the wreck and surfaces with ${event.value}`
        : `  ${event.diver} reaches the wreck — stripped bare, nothing left`;
    case 'trench-closed':
      return `  ${trench(event.trench)} is picked clean and closes`;
    case 'divers-recalled':
      return `  ${event.divers.join(' ')} abort the dive and surface with nothing`;
    case 'end-triggered':
      return `  *** ${name(event.player)} triggers the end (${event.reason}) — final round ***`;
    case 'game-over':
      return `  *** game over ***`;
    default:
      return null;
  }
}
