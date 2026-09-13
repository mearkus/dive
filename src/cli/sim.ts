/**
 * Batch playtest harness. Answers the questions DESIGN.md §10 says to
 * instrument before building any 3D: how often does the exact-sum rule
 * deadlock a hand, how strong is the free ride, how long is a game, and does
 * seat order matter.
 *
 *   npm run sim -- --games=500 --players=3 --bot=greedy --maxRiders=
 */
import {
  apply,
  newGame,
  scores,
  standings,
  type GameState,
} from '../rules/index.js';
import { greedy, search, type Policy } from '../ai/index.js';

const TURN_CAP = 3000;

interface Options {
  games: number;
  players: number;
  seed: number;
  bot: 'greedy' | 'search';
  maxRiders: number | null;
  allowVoluntaryRefresh: boolean;
  trenchCount: number;
  diversPerPlayer: number;
  handSize: number;
  deckComposition: number[];
}

function parseArgs(argv: string[]): Options {
  const get = (key: string) => {
    const hit = argv.find((a) => a.startsWith(`--${key}=`));
    return hit ? hit.slice(key.length + 3) : undefined;
  };
  const maxRiders = get('maxRiders');
  return {
    games: Number(get('games') ?? 200),
    players: Number(get('players') ?? 3),
    seed: Number(get('seed') ?? 1),
    bot: (get('bot') as Options['bot']) ?? 'greedy',
    maxRiders: maxRiders === undefined || maxRiders === '' ? null : Number(maxRiders),
    allowVoluntaryRefresh: get('voluntaryRefresh') === 'true',
    trenchCount: Number(get('trenches') ?? 4),
    diversPerPlayer: Number(get('divers') ?? 4),
    handSize: Number(get('hand') ?? 5),
    deckComposition: (get('deck') ?? '16,14,11,8,6,5').split(',').map(Number),
  };
}

interface Totals {
  games: number;
  turns: number[];
  refreshes: number;
  forcedRefreshes: number;
  actions: number;
  ridesGiven: number;
  ridesTaken: number;
  freeDescents: number;
  paidDescents: number;
  strandedDivers: number;
  totalDivers: number;
  winsBySeat: number[];
  scoreSamples: number[];
  marginSamples: number[];
  wrecksByTrench: number[];
  endReason: { allSurfaced: number; trenchesClosed: number; airOut: number; capped: number };
  emptyHauls: number;
  aborted: number;
  reshuffles: number[];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`;
}

function playOne(seed: number, options: Options, bots: Policy[], totals: Totals): void {
  let state: GameState = newGame(seed, options.players, {
    maxRiders: options.maxRiders,
    allowVoluntaryRefresh: options.allowVoluntaryRefresh,
    trenchCount: options.trenchCount,
    diversPerPlayer: options.diversPerPlayer,
    handSize: options.handSize,
    deckComposition: options.deckComposition,
  });
  let capped = false;

  while (!state.over) {
    if (state.turn >= TURN_CAP) {
      capped = true;
      break;
    }
    const action = bots[state.current % bots.length].choose(state);
    const result = apply(state, action);
    totals.actions += 1;
    if (action.kind === 'descend') {
      totals.paidDescents += 1;
      for (const event of result.events) {
        if (event.t === 'stack-moved') totals.freeDescents += event.divers.length - 1;
        if (event.t === 'treasure-taken') {
          totals.wrecksByTrench[event.trench] += 1;
          if (event.value === 0) totals.emptyHauls += 1;
        }
      }
    }
    state = result.state;
  }

  totals.games += 1;
  totals.turns.push(state.turn);
  totals.refreshes += state.stats.refreshes.reduce((a, b) => a + b, 0);
  totals.forcedRefreshes += state.stats.forcedRefreshes.reduce((a, b) => a + b, 0);
  totals.ridesGiven += state.stats.ridesGiven.reduce((a, b) => a + b, 0);
  totals.ridesTaken += state.stats.ridesTaken.reduce((a, b) => a + b, 0);
  totals.aborted += state.stats.aborted.reduce((a, b) => a + b, 0);
  totals.reshuffles.push(state.reshuffles);

  const divers = Object.values(state.divers);
  totals.totalDivers += divers.length;
  totals.strandedDivers += divers.filter((d) => d.pos.kind !== 'scored').length;

  const table = standings(state);
  totals.winsBySeat[table[0].player] += 1;
  totals.scoreSamples.push(...scores(state));
  if (table.length > 1) totals.marginSamples.push(table[0].score - table[1].score);

  if (capped) totals.endReason.capped += 1;
  else if (state.reshuffles >= state.config.airLimit) totals.endReason.airOut += 1;
  else if (state.trenches.every((t) => t.closed)) totals.endReason.trenchesClosed += 1;
  else totals.endReason.allSurfaced += 1;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const bots: Policy[] =
    options.bot === 'search'
      ? Array.from({ length: options.players }, (_, i) => search({ samples: 5, horizon: 8, seed: 1000 + i }))
      : Array.from({ length: options.players }, (_, i) => greedy({ noise: 0.15, seed: 1000 + i }));

  const totals: Totals = {
    games: 0,
    turns: [],
    refreshes: 0,
    forcedRefreshes: 0,
    actions: 0,
    ridesGiven: 0,
    ridesTaken: 0,
    freeDescents: 0,
    paidDescents: 0,
    strandedDivers: 0,
    totalDivers: 0,
    winsBySeat: Array.from({ length: options.players }, () => 0),
    scoreSamples: [],
    marginSamples: [],
    wrecksByTrench: Array.from({ length: options.trenchCount }, () => 0),
    endReason: { allSurfaced: 0, trenchesClosed: 0, airOut: 0, capped: 0 },
    emptyHauls: 0,
    aborted: 0,
    reshuffles: [],
  };

  const state0 = newGame(options.seed, options.players, {
    trenchCount: options.trenchCount,
    diversPerPlayer: options.diversPerPlayer,
  });
  const started = Date.now();
  for (let g = 0; g < options.games; g++) playOne(options.seed + g, options, bots, totals);
  const elapsed = (Date.now() - started) / 1000;

  const turns = [...totals.turns].sort((a, b) => a - b);
  console.log(`\nSUNKEN HOLD — ${totals.games} games, ${options.players} players, bot ${bots[0].name}`);
  console.log(
    `  trenches=${options.trenchCount} divers=${options.diversPerPlayer} ` +
      `hand=${options.handSize} deck=${options.deckComposition.join('/')} ` +
      `maxRiders=${options.maxRiders ?? '∞'}`,
  );
  console.log(`  ${elapsed.toFixed(1)}s\n`);

  console.log('  LENGTH');
  console.log(
    `    turns per game      mean ${mean(turns).toFixed(1)}   median ${turns[Math.floor(turns.length / 2)]}` +
      `   min ${turns[0]}   max ${turns[turns.length - 1]}`,
  );
  console.log(`    turns per player    ${(mean(turns) / options.players).toFixed(1)}`);

  console.log('\n  DEADLOCK RISK  (DESIGN.md §10: forced refresh above ~15% means retune)');
  console.log(`    refresh turns       ${pct(totals.refreshes, totals.actions)} of all turns`);
  console.log(`    FORCED refreshes    ${pct(totals.forcedRefreshes, totals.actions)} of all turns`);

  console.log('\n  THE FREE RIDE');
  console.log(`    paid descents       ${totals.paidDescents}`);
  console.log(`    free descents       ${totals.freeDescents}  (${pct(totals.freeDescents, totals.freeDescents + totals.paidDescents)} of all movement)`);
  console.log(`    rides per game      ${(totals.ridesGiven / totals.games).toFixed(1)}`);

  console.log('\n  OUTCOMES');
  console.log(`    mean score          ${mean(totals.scoreSamples).toFixed(1)}`);
  console.log(`    mean win margin     ${mean(totals.marginSamples).toFixed(1)}`);
  console.log(`    stranded divers     ${pct(totals.strandedDivers, totals.totalDivers)} of all divers`);
  console.log(`    empty-handed hauls  ${totals.emptyHauls}`);
  console.log(`    aborted dives       ${(totals.aborted / totals.games).toFixed(1)} per game  (${pct(totals.aborted, totals.totalDivers)} of divers)`);
  console.log(`    deck reshuffles     ${mean(totals.reshuffles).toFixed(1)} per game  (air limit ${state0.config.airLimit})`);
  console.log(
    `    seat win rate       ${totals.winsBySeat.map((w, i) => `${String.fromCharCode(65 + i)} ${pct(w, totals.games)}`).join('   ')}`,
  );
  console.log(
    `    ended by            all-surfaced ${pct(totals.endReason.allSurfaced, totals.games)}   ` +
      `trenches-closed ${pct(totals.endReason.trenchesClosed, totals.games)}   ` +
      `air-out ${pct(totals.endReason.airOut, totals.games)}   ` +
      `turn cap ${totals.endReason.capped}`,
  );
  console.log(
    `    wrecks reached      ${totals.wrecksByTrench.map((n, i) => `T${i + 1} ${(n / totals.games).toFixed(1)}`).join('   ')}`,
  );
  console.log('');
}

main();
