/**
 * Terminal playtest loop — DESIGN.md milestone M1. Plays the real engine, so
 * whatever is fun (or broken) here is fun (or broken) in the finished game.
 *
 *   npm run play -- --players=3 --humans=1 --seed=7
 */
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  apply,
  canRefresh,
  legalDescends,
  newGame,
  standings,
  winner,
  type Action,
  type GameState,
} from '../rules/index.js';
import { greedy, search } from '../ai/index.js';
import { describeEvent, renderBoard, renderHand } from './board.js';

interface Options {
  players: number;
  humans: number;
  seed: number;
  bot: 'greedy' | 'search';
  maxRiders: number | null;
}

function parseArgs(argv: string[]): Options {
  const get = (key: string) => {
    const hit = argv.find((a) => a.startsWith(`--${key}=`));
    return hit ? hit.slice(key.length + 3) : undefined;
  };
  const maxRiders = get('maxRiders');
  return {
    players: Number(get('players') ?? 3),
    humans: Number(get('humans') ?? 1),
    seed: Number(get('seed') ?? Math.floor(Math.random() * 1e9)),
    bot: (get('bot') as Options['bot']) ?? 'greedy',
    maxRiders: maxRiders === undefined || maxRiders === '' ? null : Number(maxRiders),
  };
}

interface Choice {
  label: string;
  action: Action;
}

/**
 * Divers waiting at the surface are interchangeable — offering all of them
 * multiplies the menu without adding a decision. Collapse them to one.
 * The 3D UI needs the same treatment: pick a trench, not a diver.
 */
function collapseSurfaceDivers(descends: ReturnType<typeof legalDescends>) {
  const seen = new Set<number>();
  return descends.filter((d) => {
    if (d.from.kind !== 'surface') return true;
    if (seen.has(d.trench)) return false;
    seen.add(d.trench);
    return true;
  });
}

function choicesFor(state: GameState): Choice[] {
  const out: Choice[] = [];
  for (const descend of collapseSurfaceDivers(legalDescends(state))) {
    const trench = state.trenches[descend.trench];
    const where =
      descend.from.kind === 'surface'
        ? `enter ${trench.name} L1`
        : `${trench.name} L${descend.from.ledge} → L${descend.toLedge}`;
    const wreck = descend.reachesWreck ? `  ** WRECK, takes ${trench.treasure[0] ?? 0} **` : '';
    const ride = descend.riders.length ? `  (carries ${descend.riders.join(' ')} free)` : '';
    for (const combo of descend.combos) {
      const pay = combo.map((i) => state.players[state.current].hand[i]).join('+');
      out.push({
        label: `${descend.diver}  ${where}  cost ${descend.cost}  pay ${pay}${ride}${wreck}`,
        action: { kind: 'descend', diver: descend.diver, cards: combo, trench: descend.trench },
      });
    }
  }
  if (canRefresh(state)) {
    out.push({
      label: out.length === 0 ? 'surface for air (forced — nothing is affordable)' : 'surface for air',
      action: { kind: 'refresh' },
    });
  }
  return out;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const names = Array.from({ length: options.players }, (_, i) =>
    i < options.humans ? `You ${String.fromCharCode(65 + i)}` : `Bot ${String.fromCharCode(65 + i)}`,
  );
  let state = newGame(options.seed, options.players, { maxRiders: options.maxRiders }, names);
  const bot = options.bot === 'search' ? search({ samples: 6, horizon: 8 }) : greedy({ noise: 0.15 });

  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(`\nSUNKEN HOLD — seed ${options.seed}, ${options.players} players, bot: ${bot.name}`);
  console.log('Leftmost diver on a ledge is the bottom of the stack: it carries the others down.\n');

  while (!state.over) {
    const isHuman = state.current < options.humans;
    if (isHuman) {
      console.log(renderBoard(state));
      console.log(`\n  ${state.players[state.current].name} — hand:  ${renderHand(state.players[state.current].hand)}\n`);
      const choices = choicesFor(state);
      choices.forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}) ${c.label}`));
      const reply = (await rl.question('\n  > ')).trim().toLowerCase();
      if (reply === 'q') break;
      const pick = Number(reply);
      if (!Number.isInteger(pick) || pick < 1 || pick > choices.length) {
        console.log('  ?\n');
        continue;
      }
      const result = apply(state, choices[pick - 1].action);
      for (const event of result.events) {
        const line = describeEvent(state, event);
        if (line) console.log(line);
      }
      state = result.state;
      console.log('');
    } else {
      const action = bot.choose(state);
      const result = apply(state, action);
      console.log(`${state.players[state.current].name}:`);
      for (const event of result.events) {
        const line = describeEvent(state, event);
        if (line) console.log(line);
      }
      state = result.state;
      console.log('');
    }
  }

  rl.close();
  console.log(renderBoard(state));
  const champion = winner(state);
  console.log(`\n  ${champion ? `${champion.name} wins with ${champion.score}` : 'a dead tie'}\n`);
  for (const row of standings(state)) {
    console.log(
      `   ${row.name.padEnd(10)} ${String(row.score).padStart(3)}  ` +
        `surfaced ${row.surfaced}  stranded ${row.stranded}  best haul ${row.bestHaul}`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
