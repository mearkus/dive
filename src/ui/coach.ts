/**
 * The tutorial: short lessons that fire at the moment they become true, rather
 * than a rules screen read before any of it means anything.
 *
 * The interface is not what needs teaching here — click a diver, pick a
 * payment. What needs teaching is why the line rule matters, and that only
 * lands when the player is about to hand a rival a free ride.
 *
 * Each lesson shows once ever; "seen" persists so a returning player is not
 * lectured again.
 */
import type { GameEvent, GameState, LegalDescend } from '../rules/index.js';

export type Phase = 'turn-start' | 'selected' | 'after-action';

export interface CoachContext {
  state: GameState;
  phase: Phase;
  /** Seats the human plays; empty in watch mode. */
  humanSeats: number[];
  legal: LegalDescend[];
  selected?: LegalDescend;
  events?: GameEvent[];
}

export interface Lesson {
  id: string;
  title: string;
  body: string;
  /** Higher wins when several lessons match the same moment. */
  weight: number;
  /** Reserved for decision-moment lessons; every lesson now waits to be dismissed. */
  sticky?: boolean;
  when(context: CoachContext): boolean;
}

const mine = (c: CoachContext, owner: number) => c.humanSeats.includes(owner);

export const LESSONS: Lesson[] = [
  {
    id: 'welcome',
    title: 'Send a diver down',
    body:
      'Your divers wait at the surface. Click a <b>glowing ledge</b> to send one into that trench. ' +
      'The number on a ledge is what it costs in air — and you must pay it <b>exactly</b>.',
    // Not "turn 0": the start player is random, so a human seated second or
    // third reaches their first turn well after the counter has moved.
    weight: 200,
    when: (c) =>
      c.phase === 'turn-start' &&
      Object.values(c.state.divers).every((d) => !mine(c, d.owner) || d.pos.kind === 'surface'),
  },
  {
    id: 'exact-sum',
    title: 'Pay it exactly',
    body:
      'No overpaying. Every combination of cards that adds up is offered below — ' +
      'which one you spend decides what is left in your hand for the next ledge.',
    weight: 6,
    sticky: true,
    when: (c) => c.phase === 'selected' && (c.selected?.combos.length ?? 0) > 1,
  },
  {
    id: 'carry',
    title: 'They ride for free',
    body:
      'Everyone who landed on this ledge <b>after</b> your diver is clipped in behind it, and comes down free. ' +
      'Arrive first and you tow them all; arrive last and you tow nobody. Sometimes the tow is still worth it.',
    weight: 100,
    sticky: true,
    when: (c) => c.phase === 'selected' && (c.selected?.riders.length ?? 0) > 0,
  },
  {
    id: 'leech',
    title: 'Or hitch a ride yourself',
    body:
      'That ledge already has a diver on it, and arriving puts you <b>on top</b> of them — so you tow nobody, ' +
      'and every descent <b>they</b> pay for from now on drags you down free.',
    weight: 40,
    when: (c) =>
      c.phase === 'turn-start' &&
      c.legal.some((d) => {
        const stack = c.state.trenches[d.trench].stacks[d.toLedge - 1];
        return stack.some((id) => !mine(c, c.state.divers[id].owner));
      }),
  },
  {
    id: 'wreck',
    title: 'The wreck is in reach',
    body:
      'One more ledge and this diver reaches the floor. The <b>first</b> diver to a wreck takes the richest ' +
      'treasure; whoever follows takes what is left.',
    weight: 50,
    when: (c) => c.phase === 'turn-start' && c.legal.some((d) => d.reachesWreck),
  },
  {
    id: 'rode-free',
    title: 'You just rode down free',
    body:
      'A rival paid to descend and your diver was clipped above them, so it came along for nothing. ' +
      'That is the whole game: stack above the divers you expect to keep moving.',
    weight: 90,
    when: (c) =>
      c.phase === 'after-action' &&
      (c.events ?? []).some(
        (e) =>
          e.t === 'stack-moved' &&
          e.divers.length > 1 &&
          !mine(c, c.state.divers[e.divers[0]].owner) &&
          e.divers.slice(1).some((id) => mine(c, c.state.divers[id].owner)),
      ),
  },
  {
    id: 'stripped',
    title: 'Picked clean',
    body:
      'The last treasure is gone, so the trench closes — and <b>every diver still inside surfaces with nothing</b>. ' +
      'Every card they spent getting there is wasted. Being slow in a rich trench is dangerous.',
    weight: 95,
    when: (c) => c.phase === 'after-action' && (c.events ?? []).some((e) => e.t === 'trench-closed'),
  },
  {
    id: 'no-air',
    title: 'Nothing you can pay for',
    body:
      'No combination in your hand matches a ledge you can reach, so your turn is spent surfacing for air: ' +
      'the whole hand is swapped for a fresh one.',
    weight: 80,
    when: (c) => c.phase === 'turn-start' && c.legal.length === 0,
  },
  {
    id: 'final-round',
    title: 'Final round',
    body:
      'Someone has surfaced their last diver, so everyone gets one more turn. ' +
      'Divers still in the water when it ends score <b>nothing</b>.',
    weight: 85,
    when: (c) => c.phase === 'after-action' && (c.events ?? []).some((e) => e.t === 'end-triggered'),
  },
];

const STORE_KEY = 'sunkenhold.tutorial.seen';

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private browsing, blocked storage — the tutorial still works, it just
    // forgets between sessions.
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...seen]));
  } catch {
    /* not fatal */
  }
}

export class Coach {
  private seen = loadSeen();

  constructor(private enabled: boolean) {}

  /** The lesson to show for this moment, or null. Marks it seen. */
  next(context: CoachContext): Lesson | null {
    if (!this.enabled || context.humanSeats.length === 0 || context.state.over) return null;

    const candidates = LESSONS.filter((lesson) => !this.seen.has(lesson.id) && lesson.when(context)).sort(
      (a, b) => b.weight - a.weight,
    );
    const lesson = candidates[0];
    if (!lesson) return null;

    this.seen.add(lesson.id);
    saveSeen(this.seen);
    return lesson;
  }

  get remaining(): number {
    return LESSONS.filter((l) => !this.seen.has(l.id)).length;
  }

  static reset(): void {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* not fatal */
    }
  }

  static anySeen(): boolean {
    return loadSeen().size > 0;
  }
}
