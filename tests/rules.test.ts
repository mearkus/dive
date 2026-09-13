import { describe, expect, it } from 'vitest';
import {
  apply,
  combosFor,
  IllegalMoveError,
  legalActions,
  legalDescends,
  newGame,
  pickTrenches,
  rollCosts,
  scores,
  standings,
  TRENCH_DEFS,
  type GameState,
} from '../src/rules/index.js';
import { mulberry32 } from '../src/rules/rng.js';
import { greedy } from '../src/ai/index.js';

/** Force a known hand so tests can aim at an exact cost. */
function setHand(state: GameState, player: number, hand: number[]): GameState {
  const next = structuredClone(state);
  next.players[player].hand = [...hand].sort((a, b) => a - b);
  return next;
}

/** Put a diver on a ledge directly, keeping stacks consistent. */
function place(state: GameState, diver: string, trench: number, ledge: number): GameState {
  const next = structuredClone(state);
  next.divers[diver].pos = { kind: 'ledge', trench, ledge };
  next.trenches[trench].stacks[ledge - 1].push(diver);
  return next;
}

describe('setup', () => {
  it('is deterministic for a seed', () => {
    expect(newGame(42, 3)).toEqual(newGame(42, 3));
  });

  it('differs across seeds', () => {
    const a = newGame(1, 3);
    const b = newGame(2, 3);
    expect(a.trenches.map((t) => t.costs)).not.toEqual(b.trenches.map((t) => t.costs));
  });

  it('deals full hands and parks every diver at the surface', () => {
    const state = newGame(7, 4, { diversPerPlayer: 5, trenchCount: 5 });
    expect(state.players).toHaveLength(4);
    for (const player of state.players) expect(player.hand).toHaveLength(5);
    expect(Object.keys(state.divers)).toHaveLength(20);
    expect(Object.values(state.divers).every((d) => d.pos.kind === 'surface')).toBe(true);
    expect(state.deck).toHaveLength(60 - 20);
  });

  it('rejects unsupported player counts', () => {
    expect(() => newGame(1, 1)).toThrow();
    expect(() => newGame(1, 5)).toThrow();
  });

  it('rolls ledge costs in range, cheap at the top and never soft on the floor', () => {
    const rng = mulberry32(99);
    for (const def of TRENCH_DEFS) {
      for (let n = 0; n < 50; n++) {
        const costs = rollCosts(rng, def.depth);
        expect(costs).toHaveLength(def.depth);
        expect(costs[0]).toBeGreaterThanOrEqual(1);
        expect(costs[0]).toBeLessThanOrEqual(2);
        expect(costs[costs.length - 1]).toBeGreaterThanOrEqual(3);
        expect(Math.max(...costs)).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('combosFor', () => {
  it('finds exact sums only', () => {
    expect(combosFor([1, 2, 3], 5).map((c) => c.map((i) => [1, 2, 3][i]))).toEqual([[2, 3]]);
    expect(combosFor([1, 2, 3], 7)).toEqual([]);
  });

  it('treats duplicate values as one way to pay', () => {
    expect(combosFor([3, 3, 3], 3)).toHaveLength(1);
    expect(combosFor([2, 2, 4], 4)).toHaveLength(2); // 4, and 2+2
  });

  it('prefers fewer cards first', () => {
    const hand = [1, 1, 2, 4];
    const combos = combosFor(hand, 4);
    expect(combos[0].length).toBeLessThanOrEqual(combos[combos.length - 1].length);
  });
});

describe('descending', () => {
  it('requires exact payment', () => {
    let state = newGame(5, 2);
    const cost = state.trenches[0].costs[0];
    state = setHand(state, state.current, [cost, 6, 6, 6, 6]);
    const mover = `${'AB'[state.current]}1`;
    expect(() => apply(state, { kind: 'descend', diver: mover, cards: [0, 1], trench: 0 })).toThrow(
      IllegalMoveError,
    );
    const idx = state.players[state.current].hand.indexOf(cost);
    expect(() => apply(state, { kind: 'descend', diver: mover, cards: [idx], trench: 0 })).not.toThrow();
  });

  it('will not move another player\'s diver', () => {
    const state = newGame(5, 2);
    const other = state.current === 0 ? 'B1' : 'A1';
    expect(() => apply(state, { kind: 'descend', diver: other, cards: [], trench: 0 })).toThrow(
      IllegalMoveError,
    );
  });

  it('will not let a diver change trench', () => {
    let state = newGame(11, 2, { trenchCount: 5 });
    const mover = `${'AB'[state.current]}1`;
    state = place(state, mover, 2, 1);
    const cost = state.trenches[2].costs[1];
    state = setHand(state, state.current, [cost, 6, 6, 6, 6]);
    expect(() => apply(state, { kind: 'descend', diver: mover, cards: [0], trench: 3 })).toThrow(
      IllegalMoveError,
    );
  });

  it('never offers a move back up or out of a closed trench', () => {
    let state = newGame(13, 2);
    state.trenches[0].closed = true;
    for (const descend of legalDescends(state)) {
      expect(descend.trench).not.toBe(0);
      const from = descend.from.kind === 'ledge' ? descend.from.ledge : 0;
      expect(descend.toLedge).toBe(from + 1);
    }
  });

  it('spends the paid cards into the discard and refills the hand', () => {
    let state = newGame(21, 2);
    const mover = `${'AB'[state.current]}1`;
    const cost = state.trenches[1].costs[0];
    state = setHand(state, state.current, [cost, 1, 1, 1, 1]);
    const idx = state.players[state.current].hand.indexOf(cost);
    const actor = state.current;
    const { state: next } = apply(state, { kind: 'descend', diver: mover, cards: [idx], trench: 1 });
    expect(next.players[actor].hand).toHaveLength(5);
    expect(next.discard).toContain(cost);
  });
});

describe('the line rule', () => {
  it('carries every diver above the mover, for free, in order', () => {
    let state = newGame(31, 3, { trenchCount: 5 });
    const actor = state.current;
    const mover = `${'ABC'[actor]}1`;
    const riderA = `${'ABC'[(actor + 1) % 3]}1`;
    const riderB = `${'ABC'[(actor + 2) % 3]}1`;
    state = place(state, mover, 4, 2);
    state = place(state, riderA, 4, 2);
    state = place(state, riderB, 4, 2);

    const cost = state.trenches[4].costs[2];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);
    const { state: next, events } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });

    expect(next.trenches[4].stacks[1]).toEqual([]);
    expect(next.trenches[4].stacks[2]).toEqual([mover, riderA, riderB]);
    for (const id of [mover, riderA, riderB]) {
      expect(next.divers[id].pos).toEqual({ kind: 'ledge', trench: 4, ledge: 3 });
    }
    const moved = events.find((e) => e.t === 'stack-moved');
    expect(moved).toMatchObject({ divers: [mover, riderA, riderB] });
    expect(next.stats.ridesGiven[actor]).toBe(2);
    // Riders paid nothing.
    expect(next.stats.cardsSpent[(actor + 1) % 3]).toBe(0);
  });

  it('leaves divers below the mover behind', () => {
    let state = newGame(33, 2, { trenchCount: 5 });
    const actor = state.current;
    const below = `${'AB'[(actor + 1) % 2]}1`;
    const mover = `${'AB'[actor]}1`;
    state = place(state, below, 3, 1);
    state = place(state, mover, 3, 1);

    const cost = state.trenches[3].costs[1];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);
    const { state: next } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });

    expect(next.trenches[3].stacks[0]).toEqual([below]);
    expect(next.trenches[3].stacks[1]).toEqual([mover]);
  });

  it('does not carry anyone when entering from the surface', () => {
    const state = newGame(35, 3);
    for (const descend of legalDescends(state)) {
      if (descend.from.kind === 'surface') expect(descend.riders).toEqual([]);
    }
  });

  it('honours the maxRiders variant', () => {
    let state = newGame(37, 3, { maxRiders: 1, trenchCount: 5 });
    const actor = state.current;
    const mover = `${'ABC'[actor]}1`;
    const riderA = `${'ABC'[(actor + 1) % 3]}1`;
    const riderB = `${'ABC'[(actor + 2) % 3]}1`;
    state = place(state, mover, 4, 2);
    state = place(state, riderA, 4, 2);
    state = place(state, riderB, 4, 2);

    const cost = state.trenches[4].costs[2];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);
    const { state: next } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });

    expect(next.trenches[4].stacks[2]).toEqual([mover, riderA]);
    expect(next.trenches[4].stacks[1]).toEqual([riderB]);
  });
});

describe('the wreck', () => {
  it('pays the mover first and surfaces the whole arriving group', () => {
    let state = newGame(41, 2);
    const actor = state.current;
    const mover = `${'AB'[actor]}1`;
    const rider = `${'AB'[(actor + 1) % 2]}1`;
    const depth = state.trenches[0].depth;
    state = place(state, mover, 0, depth - 1);
    state = place(state, rider, 0, depth - 1);

    const cost = state.trenches[0].costs[depth - 1];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);
    const { state: next } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });

    expect(next.divers[mover].pos.kind).toBe('scored');
    expect(next.divers[rider].pos.kind).toBe('scored');
    expect(next.players[actor].tokens).toEqual([3]); // richest token of Shelf Break
    expect(next.players[(actor + 1) % 2].tokens).toEqual([2]);
    expect(next.trenches[0].treasure).toEqual([1, 1]);
  });

  it('closes a trench once picked clean, and surfaces later arrivals empty-handed', () => {
    let state = newGame(43, 2);
    state.trenches[0].treasure = [1];
    const actor = state.current;
    const mover = `${'AB'[actor]}1`;
    const rider = `${'AB'[(actor + 1) % 2]}1`;
    const depth = state.trenches[0].depth;
    state = place(state, mover, 0, depth - 1);
    state = place(state, rider, 0, depth - 1);

    const cost = state.trenches[0].costs[depth - 1];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);
    const { state: next, events } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });

    expect(next.trenches[0].closed).toBe(true);
    expect(next.players[actor].tokens).toEqual([1]);
    expect(next.players[(actor + 1) % 2].tokens).toEqual([]);
    expect(next.divers[rider].pos.kind).toBe('scored');
    expect(events.some((e) => e.t === 'trench-closed')).toBe(true);
    expect(legalDescends(next).every((d) => d.trench !== 0)).toBe(true);
  });
});

describe('turn order and the end', () => {
  it('passes the turn after every action', () => {
    const state = newGame(51, 3, { allowVoluntaryRefresh: true });
    const { state: next } = apply(state, { kind: 'refresh' });
    expect(next.current).toBe((state.current + 1) % 3);
  });

  it('refreshes the whole hand and costs the turn', () => {
    const state = newGame(53, 2, { allowVoluntaryRefresh: true });
    const actor = state.current;
    const before = [...state.players[actor].hand];
    const { state: next } = apply(state, { kind: 'refresh' });
    expect(next.players[actor].hand).toHaveLength(5);
    expect(next.stats.refreshes[actor]).toBe(1);
    for (const card of before) expect(next.discard).toContain(card);
  });

  it('gives everyone an equal number of turns after the end triggers', () => {
    let state = newGame(57, 3, { diversPerPlayer: 1, allowVoluntaryRefresh: true });
    const actor = state.current;
    const mover = `${'ABC'[actor]}1`;
    const depth = state.trenches[0].depth;
    state = place(state, mover, 0, depth - 1);
    const cost = state.trenches[0].costs[depth - 1];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);

    let { state: next, events } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });
    expect(events.some((e) => e.t === 'end-triggered')).toBe(true);
    expect(next.over).toBe(false);

    // The two players after the trigger each get one last turn, then it ends.
    next = apply(next, { kind: 'refresh' }).state;
    expect(next.over).toBe(false);
    next = apply(next, { kind: 'refresh' }).state;
    expect(next.over).toBe(true);
    expect(() => apply(next, { kind: 'refresh' })).toThrow(IllegalMoveError);
  });

  it('scores stranded divers as nothing', () => {
    const state = newGame(59, 2, { diversPerPlayer: 5 });
    state.players[0].tokens = [5, 3];
    expect(scores(state)[0]).toBe(8);
    expect(standings(state)[0].player).toBe(0);
    expect(standings(state).find((r) => r.player === 1)!.stranded).toBe(5);
  });

  it('breaks ties on hauls won, then on best haul', () => {
    const state = newGame(61, 2);
    state.players[0].tokens = [4, 4];
    state.players[1].tokens = [8];
    expect(standings(state)[0].player).toBe(0); // same score, two hauls beats one
  });
});

describe('a stripped trench', () => {
  it('recalls every diver still inside it, empty-handed', () => {
    let state = newGame(81, 3, { trenchCount: 5 });
    state.trenches[0].treasure = [1];
    const actor = state.current;
    const mover = `${'ABC'[actor]}1`;
    const depth = state.trenches[0].depth;
    state = place(state, mover, 0, depth - 1);
    // Two rivals are still working their way down the same trench.
    const strandedA = `${'ABC'[(actor + 1) % 3]}2`;
    const strandedB = `${'ABC'[(actor + 2) % 3]}3`;
    state = place(state, strandedA, 0, 1);
    state = place(state, strandedB, 0, 2);

    const cost = state.trenches[0].costs[depth - 1];
    state = setHand(state, actor, [cost, 6, 6, 6, 6]);
    const idx = state.players[actor].hand.indexOf(cost);
    const { state: next, events } = apply(state, { kind: 'descend', diver: mover, cards: [idx] });

    expect(next.trenches[0].closed).toBe(true);
    expect(next.trenches[0].stacks.every((s) => s.length === 0)).toBe(true);
    for (const id of [strandedA, strandedB]) {
      expect(next.divers[id].pos.kind).toBe('scored');
      expect(next.players[next.divers[id].owner].tokens).toEqual([]);
      expect(next.stats.aborted[next.divers[id].owner]).toBe(1);
    }
    const recalled = events.find((e) => e.t === 'divers-recalled');
    expect(recalled).toBeDefined();
    expect((recalled as { divers: string[] }).divers.sort()).toEqual([strandedA, strandedB].sort());
  });

  it('leaves no diver able to reach a closed trench', () => {
    let state = newGame(83, 2, { trenchCount: 5 });
    state.trenches[2].treasure = [];
    state.trenches[2].closed = true;
    expect(legalDescends(state).every((d) => d.trench !== 2)).toBe(true);
  });
});

describe('the air clock', () => {
  it('ends the game once the deck has been recycled too often', () => {
    let state = newGame(91, 2, { airLimit: 1, allowVoluntaryRefresh: true });
    // Burn the deck down so the next refill must reshuffle.
    state.discard = [...state.deck];
    state.deck = [];
    const { state: next, events } = apply(state, { kind: 'refresh' });
    expect(next.reshuffles).toBe(1);
    expect(events.some((e) => e.t === 'end-triggered' && e.reason === 'air-out')).toBe(true);
  });

  it('guarantees termination even when every player stalls forever', () => {
    let state = newGame(93, 3, { airLimit: 4, allowVoluntaryRefresh: true });
    let guard = 0;
    while (!state.over) {
      expect(guard++).toBeLessThan(2000);
      state = apply(state, { kind: 'refresh' }).state;
    }
    expect(state.over).toBe(true);
  });
});

describe('refresh as a rules variant', () => {
  it('is illegal by default while any descend is affordable', () => {
    const state = newGame(95, 3);
    expect(legalDescends(state).length).toBeGreaterThan(0);
    expect(() => apply(state, { kind: 'refresh' })).toThrow(IllegalMoveError);
  });

  it('is always available once nothing can be paid for', () => {
    const state = newGame(97, 3);
    // A hand of 6s cannot pay a cheap entry cost of 1 or 2.
    const stuck = structuredClone(state);
    stuck.players[stuck.current].hand = [6, 6, 6, 6, 6];
    for (const trench of stuck.trenches) trench.costs[0] = 1;
    expect(legalDescends(stuck)).toEqual([]);
    expect(() => apply(stuck, { kind: 'refresh' })).not.toThrow();
    expect(apply(stuck, { kind: 'refresh' }).state.stats.forcedRefreshes[stuck.current]).toBe(1);
  });
});

describe('purity and determinism', () => {
  it('never mutates the state handed to it', () => {
    const state = newGame(71, 3, { allowVoluntaryRefresh: true });
    const snapshot = structuredClone(state);
    apply(state, { kind: 'refresh' });
    expect(state).toEqual(snapshot);
  });

  it('replays identically from the same seed and action list', () => {
    const run = () => {
      let state = newGame(73, 3);
      const bot = greedy({ noise: 0, seed: 5 });
      const trail: string[] = [];
      while (!state.over && state.turn < 400) {
        const action = bot.choose(state);
        trail.push(JSON.stringify(action));
        state = apply(state, action).state;
      }
      return { scores: scores(state), trail, turn: state.turn };
    };
    expect(run()).toEqual(run());
  });
});

describe('full games', () => {
  it('always terminate, stay legal, and conserve every card and token', () => {
    for (let seed = 0; seed < 40; seed++) {
      const players = 2 + (seed % 3);
      let state = newGame(seed, players);
      const bots = Array.from({ length: players }, (_, i) => greedy({ noise: 0.2, seed: seed * 10 + i }));
      let guard = 0;

      while (!state.over) {
        expect(guard++).toBeLessThan(2000);
        const options = legalActions(state);
        expect(options.length).toBeGreaterThan(0);
        const action = bots[state.current].choose(state);
        state = apply(state, action).state;

        const cards =
          state.deck.length +
          state.discard.length +
          state.players.reduce((n, p) => n + p.hand.length, 0);
        expect(cards).toBe(60);
      }

      const claimed = state.players.flatMap((p) => p.tokens);
      const left = state.trenches.flatMap((t) => t.treasure);
      const all = [...claimed, ...left].sort((a, b) => a - b);
      const expected = pickTrenches(state.config.trenchCount)
        .flatMap((t) => t.treasure)
        .sort((a, b) => a - b);
      // Every token is either banked by a player or still on a trench floor.
      expect(all).toEqual(expected);
      expect(state.turn).toBeGreaterThan(0);
    }
  });
});
