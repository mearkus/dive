import { isForcedRefresh, movingGroup } from './legal.js';
import { mulberry32, shuffle } from './rng.js';
import type { Action, GameEvent, GameState, Player, Trench } from './types.js';

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export class IllegalMoveError extends Error {}

function illegal(message: string): never {
  throw new IllegalMoveError(message);
}

/**
 * Personal mode: draw from this player's own supply. No reshuffle here — a
 * personal supply is only recovered by surfacing for air, which costs cards.
 */
function refillPersonal(state: GameState, player: Player, events: GameEvent[]): void {
  const drawn: number[] = [];
  while (player.hand.length < state.config.handSize) {
    const card = player.deck.pop();
    if (card === undefined) break;
    player.hand.push(card);
    drawn.push(card);
  }
  player.hand.sort((a, b) => a - b);
  if (drawn.length > 0) events.push({ t: 'hand-refilled', player: player.id, drawn });
}

/** Draw back up to the hand size, reshuffling the discard pile when the deck runs dry. */
function refill(state: GameState, player: Player, events: GameEvent[]): void {
  if (state.config.airMode === 'personal') {
    refillPersonal(state, player, events);
    return;
  }
  const drawn: number[] = [];
  while (player.hand.length < state.config.handSize) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      const rng = mulberry32(state.rngState);
      state.deck = shuffle(rng, state.discard);
      state.discard = [];
      state.rngState = rng.state;
      state.reshuffles += 1;
      events.push({ t: 'deck-reshuffled', size: state.deck.length });
    }
    const card = state.deck.pop();
    if (card === undefined) break;
    player.hand.push(card);
    drawn.push(card);
  }
  player.hand.sort((a, b) => a - b);
  if (drawn.length > 0) events.push({ t: 'hand-refilled', player: player.id, drawn });
}

/**
 * Hand the arriving group their treasure, richest to the diver that paid.
 * A picked-clean trench still accepts divers — they just surface empty-handed.
 */
function collectTreasure(
  state: GameState,
  trench: Trench,
  arriving: string[],
  events: GameEvent[],
): void {
  for (const diverId of arriving) {
    const diver = state.divers[diverId];
    const value = trench.treasure.shift() ?? 0;
    if (value > 0) state.players[diver.owner].tokens.push(value);
    diver.pos = { kind: 'scored' };
    events.push({ t: 'treasure-taken', player: diver.owner, diver: diverId, trench: trench.id, value });
  }
  if (trench.treasure.length === 0 && !trench.closed) closeTrench(state, trench, events);
}

/**
 * A stripped trench is worthless, so everyone still on its walls aborts the
 * dive and surfaces with nothing. Without this, divers in a picked-clean
 * trench are dead pieces that can never score and never leave, which
 * deadlocks the game outright.
 *
 * It also supplies the second source of tension: dawdle in a trench and the
 * divers ahead of you can strip it, ending your dive and wasting every card
 * you spent getting there.
 */
function closeTrench(state: GameState, trench: Trench, events: GameEvent[]): void {
  trench.closed = true;
  events.push({ t: 'trench-closed', trench: trench.id });

  const recalled: string[] = [];
  for (const stack of trench.stacks) {
    for (const diverId of stack) {
      const diver = state.divers[diverId];
      diver.pos = { kind: 'scored' };
      state.stats.aborted[diver.owner] += 1;
      recalled.push(diverId);
    }
  }
  trench.stacks = trench.stacks.map(() => []);
  if (recalled.length > 0) {
    events.push({ t: 'divers-recalled', trench: trench.id, divers: recalled });
  }
}

function allSurfaced(state: GameState, playerId: number): boolean {
  return Object.values(state.divers)
    .filter((d) => d.owner === playerId)
    .every((d) => d.pos.kind === 'scored');
}

function applyDescend(state: GameState, action: Action & { kind: 'descend' }, events: GameEvent[]): void {
  const player = state.players[state.current];
  const diver = state.divers[action.diver];
  if (!diver) illegal(`no such diver: ${action.diver}`);
  if (diver.owner !== state.current) illegal(`${diver.id} is not yours to move`);
  if (diver.pos.kind === 'scored') illegal(`${diver.id} has already surfaced`);

  let trench: Trench;
  let fromLedge: number;
  let toLedge: number;

  if (diver.pos.kind === 'surface') {
    if (action.trench === undefined) illegal('entering a trench requires a trench id');
    trench = state.trenches[action.trench];
    if (!trench) illegal(`no such trench: ${action.trench}`);
    if (trench.closed) illegal(`${trench.name} has been picked clean`);
    fromLedge = 0;
    toLedge = 1;
  } else {
    trench = state.trenches[diver.pos.trench];
    if (action.trench !== undefined && action.trench !== trench.id) {
      illegal('divers may not change trench');
    }
    fromLedge = diver.pos.ledge;
    toLedge = fromLedge + 1;
    if (toLedge > trench.depth) illegal(`${diver.id} is already at the wreck`);
  }

  // Pay exactly. No overpaying — that is the whole hand-management puzzle.
  const cost = trench.costs[toLedge - 1];
  const indices = [...action.cards].sort((a, b) => a - b);
  if (new Set(indices).size !== indices.length) illegal('a card cannot be spent twice');
  let sum = 0;
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= player.hand.length) illegal(`no card at hand index ${i}`);
    sum += player.hand[i];
  }
  if (sum !== cost) illegal(`payment must total exactly ${cost}, got ${sum}`);

  const spent = indices.map((i) => player.hand[i]);
  for (let n = indices.length - 1; n >= 0; n--) player.hand.splice(indices[n], 1);
  if (state.config.airMode === 'personal') player.discard.push(...spent);
  else state.discard.push(...spent);
  state.stats.cardsSpent[state.current] += spent.length;
  events.push({ t: 'cards-spent', player: state.current, values: spent });

  // The line rule: everyone clipped above the mover comes along for free.
  const group = fromLedge === 0 ? [diver.id] : movingGroup(state, trench, fromLedge, diver.id);
  if (fromLedge === 0) {
    events.push({ t: 'diver-entered', player: state.current, diver: diver.id, trench: trench.id });
  } else {
    const source = trench.stacks[fromLedge - 1];
    trench.stacks[fromLedge - 1] = source.filter((id) => !group.includes(id));
  }

  const riders = group.slice(1);
  if (riders.length > 0) {
    state.stats.ridesGiven[state.current] += riders.length;
    for (const rider of riders) state.stats.ridesTaken[state.divers[rider].owner]++;
  }

  events.push({ t: 'stack-moved', trench: trench.id, from: fromLedge, to: toLedge, divers: group });

  if (toLedge === trench.depth) {
    collectTreasure(state, trench, group, events);
  } else {
    trench.stacks[toLedge - 1].push(...group);
    for (const id of group) {
      state.divers[id].pos = { kind: 'ledge', trench: trench.id, ledge: toLedge };
    }
  }

  refill(state, player, events);
}

/**
 * Surfacing for air in personal mode, the Gloomhaven-shaped move: everything
 * spent comes back, minus some of it burnt for good. A diver whose supply
 * cannot refill a hand is out of air and is pulled out of the water.
 */
function recoverAir(state: GameState, player: Player, events: GameEvent[]): void {
  player.discard.push(...player.hand);
  player.hand = [];

  const rng = mulberry32(state.rngState);
  const recovered = shuffle(rng, [...player.discard]);
  player.discard = [];

  const burnt: number[] = [];
  for (let i = 0; i < state.config.lossPerRecovery; i++) {
    const card = recovered.pop();
    if (card === undefined) break;
    burnt.push(card);
  }
  player.lost.push(...burnt);
  player.deck.push(...recovered);
  shuffle(rng, player.deck);
  state.rngState = rng.state;
  state.stats.burnt[player.id] += burnt.length;

  events.push({ t: 'air-recovered', player: player.id, recovered: player.deck.length, burnt });

  refillPersonal(state, player, events);
  if (player.hand.length === 0) outOfAir(state, player, events);
}

/** Pull a player out: their divers surface with nothing and they stop taking turns. */
function outOfAir(state: GameState, player: Player, events: GameEvent[]): void {
  if (player.outOfAir) return;
  player.outOfAir = true;
  events.push({ t: 'out-of-air', player: player.id });

  const recalled: string[] = [];
  for (const diver of Object.values(state.divers)) {
    if (diver.owner !== player.id || diver.pos.kind !== 'ledge') continue;
    const trench = state.trenches[diver.pos.trench];
    const stack = trench.stacks[diver.pos.ledge - 1];
    trench.stacks[diver.pos.ledge - 1] = stack.filter((id) => id !== diver.id);
    diver.pos = { kind: 'scored' };
    state.stats.aborted[player.id] += 1;
    recalled.push(diver.id);
  }
  for (const diver of Object.values(state.divers)) {
    if (diver.owner === player.id && diver.pos.kind === 'surface') diver.pos = { kind: 'scored' };
  }
  if (recalled.length > 0) {
    events.push({ t: 'divers-recalled', trench: -1, divers: recalled });
  }
}

function applyRefresh(state: GameState, events: GameEvent[]): void {
  const player = state.players[state.current];
  if (!state.config.allowVoluntaryRefresh && !isForcedRefresh(state) && player.hand.length > 0) {
    illegal('refreshing is only legal when no descend is available');
  }
  state.stats.refreshes[state.current]++;
  if (isForcedRefresh(state)) state.stats.forcedRefreshes[state.current]++;

  if (state.config.airMode === 'personal') {
    recoverAir(state, player, events);
    return;
  }

  const discarded = [...player.hand];
  state.discard.push(...discarded);
  player.hand = [];
  if (discarded.length > 0) {
    events.push({ t: 'hand-discarded', player: state.current, values: discarded });
  }
  refill(state, player, events);
}

/**
 * The one reducer. Pure: returns a new state, never mutates the input, and
 * emits the ordered event list the renderer replays as animation.
 */
export function apply(state: GameState, action: Action): ApplyResult {
  if (state.over) illegal('the game is over');
  const next: GameState = structuredClone(state);
  const events: GameEvent[] = [];
  const actor = next.current;

  if (action.kind === 'descend') applyDescend(next, action, events);
  else applyRefresh(next, events);

  next.turn += 1;

  if (next.endTriggeredBy === null) {
    // Being pulled out for want of air is not the same as bringing everyone
    // home: it must not trigger the victory-lap final round.
    if (!next.players[actor].outOfAir && allSurfaced(next, actor)) {
      next.endTriggeredBy = actor;
      events.push({ t: 'end-triggered', player: actor, reason: 'all-surfaced' });
    } else if (next.trenches.every((t) => t.closed)) {
      next.endTriggeredBy = actor;
      events.push({ t: 'end-triggered', player: actor, reason: 'trenches-closed' });
    } else if (next.reshuffles >= next.config.airLimit) {
      // The air clock. Guarantees the game ends even if every player stalls.
      next.endTriggeredBy = actor;
      events.push({ t: 'end-triggered', player: actor, reason: 'air-out' });
    }
  }

  const seats = next.players.length;
  let nextPlayer = (actor + 1) % seats;
  for (let step = 0; step < seats && next.players[nextPlayer].outOfAir; step++) {
    nextPlayer = (nextPlayer + 1) % seats;
  }

  // Everyone out of air ends it, whatever else is happening.
  if (next.players.every((p) => p.outOfAir)) {
    next.over = true;
    events.push({ t: 'game-over', scores: next.players.map((p) => p.tokens.reduce((a, b) => a + b, 0)) });
    return { state: next, events };
  }
  // Finish the round: everyone after the trigger gets one more turn.
  if (next.endTriggeredBy !== null && nextPlayer === next.endTriggeredBy) {
    next.over = true;
    events.push({ t: 'game-over', scores: next.players.map((p) => p.tokens.reduce((a, b) => a + b, 0)) });
  } else {
    next.current = nextPlayer;
    events.push({ t: 'turn-passed', to: nextPlayer });
  }

  return { state: next, events };
}
