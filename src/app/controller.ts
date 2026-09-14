import {
  apply,
  legalDescends,
  newGame,
  type Action,
  type GameState,
  type LegalDescend,
} from '../rules/index.js';
import { greedy, search, type Policy } from '../ai/index.js';
import { configureLayout } from '../render/layout.js';
import { narrate } from '../common/describe.js';
import { GameScene } from '../render/scene.js';
import type { Stage } from '../render/stage.js';
import { Hud, type PayOption } from '../ui/hud.js';

export interface MatchOptions {
  players: number;
  humanSeats: number[];
  seed: number;
  difficulty: 'greedy' | 'search';
}

/**
 * Input → action → reducer → animation timeline → input unlocked.
 * All game logic lives in the pure reducer; this only sequences it.
 */
export class Controller {
  private state: GameState;
  private bots: Policy[];
  private selected: LegalDescend | null = null;
  private locked = false;

  constructor(
    private stage: Stage,
    private scene: GameScene,
    private hud: Hud,
    private options: MatchOptions,
    initial: GameState,
  ) {
    this.state = initial;
    this.bots = Array.from({ length: options.players }, (_, i) =>
      options.difficulty === 'search'
        ? search({ samples: 5, horizon: 8, seed: 700 + i })
        : greedy({ noise: 0.18, seed: 700 + i }),
    );

    stage.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    // A phone turning sideways needs the board rebuilt, not just re-framed.
    window.addEventListener('resize', () => {
      if (!configureLayout(window.innerWidth / Math.max(1, window.innerHeight))) return;
      const apply = () => this.scene.relayout(this.state, this.myLegalDescends());
      if (this.scene.timeline.busy) this.scene.timeline.onIdle(apply);
      else apply();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.clearSelection();
    });
  }

  static create(stage: Stage, hud: Hud, options: MatchOptions): Controller {
    const state = newGame(options.seed, options.players);
    const scene = new GameScene(stage, state, 'medium');
    return new Controller(stage, scene, hud, options, state);
  }

  get gameState(): GameState {
    return this.state;
  }

  start(): void {
    this.sync();
    this.hud.log(`Dive begins — seed ${this.options.seed}`);
    this.advance();
  }

  private isHumanTurn(): boolean {
    return !this.state.over && this.options.humanSeats.includes(this.state.current);
  }

  private myLegalDescends(): LegalDescend[] {
    if (!this.isHumanTurn()) return [];
    return legalDescends(this.state);
  }

  private sync(): void {
    this.hud.renderState(this.state, this.options.humanSeats);
    const legal = this.myLegalDescends();
    this.scene.refreshLedgePlates(this.state, legal);
    this.hud.setHand(this.state.players[this.state.current].hand);
  }

  /** Hand the turn to whoever is next: prompt the human, or run a bot. */
  private advance(): void {
    if (this.state.over) {
      this.hud.setPrompt('The dive is over.');
      this.hud.clearOptions();
      this.hud.showEnd(this.state, this.options.humanSeats, () => window.location.reload());
      return;
    }

    if (this.isHumanTurn()) {
      const legal = this.myLegalDescends();
      if (legal.length === 0) {
        // The pressure valve: nothing is affordable, so the turn is spent on air.
        this.hud.setPrompt('<span class="warn">Nothing you can pay for — surfacing for air.</span>');
        this.hud.clearOptions();
        window.setTimeout(() => this.dispatch({ kind: 'refresh' }), 900);
        return;
      }
      this.hud.setPrompt('Your dive — click one of your divers, or a glowing ledge.');
      this.hud.clearOptions();
      return;
    }

    const seat = String.fromCharCode(65 + this.state.current);
    this.hud.setPrompt(`Bot ${seat} is diving…`);
    this.hud.clearOptions();
    this.scene.timeline.setRate(1.7);
    window.setTimeout(() => {
      if (this.state.over) return;
      const action = this.bots[this.state.current].choose(this.state);
      this.dispatch(action);
    }, 520);
  }

  private dispatch(action: Action): void {
    if (this.locked) return;
    this.locked = true;
    this.clearSelection();

    const before = this.state;
    const result = apply(before, action);
    for (const event of result.events) {
      const line = narrate(before, event);
      if (line) this.hud.log(line.text, line.tone);
    }

    this.state = result.state;
    this.hud.renderState(this.state, this.options.humanSeats);
    this.scene.play(this.state, result.events, () => {
      this.locked = false;
      this.sync();
      this.advance();
    });
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.locked || !this.isHumanTurn()) return;
    const legal = this.myLegalDescends();
    if (legal.length === 0) return;

    const diverHit = this.stage.pick(event, this.scene.diverObjects());
    const diverId = diverHit?.userData.diver as string | undefined;
    if (diverId) {
      const match = legal.find((d) => d.diver === diverId);
      if (match) {
        this.choose(match);
        return;
      }
    }

    const ledgeHit = this.stage.pick(event, this.scene.board.targets);
    if (!ledgeHit) return;
    const { trench, ledge } = ledgeHit.userData as { trench: number; ledge: number };
    const candidates = legal.filter((d) => d.trench === trench && d.toLedge === ledge);
    if (candidates.length === 0) return;

    // Divers waiting at the surface are interchangeable (DESIGN.md §4.0), so
    // entering a trench is one choice however many are idle.
    const surface = candidates.filter((c) => c.from.kind === 'surface');
    const onLedge = candidates.filter((c) => c.from.kind === 'ledge');
    const distinct = surface.length > 0 ? [surface[0], ...onLedge] : onLedge;

    if (distinct.length === 1) this.choose(distinct[0]);
    else this.offerDiverChoice(distinct);
  }

  /** Two of your divers on one ledge move to different effect — let the player say which. */
  private offerDiverChoice(candidates: LegalDescend[]): void {
    this.hud.setPrompt('Which diver?');
    this.hud.setOptions(
      candidates.map((candidate) => ({
        label:
          `<b>${candidate.diver}</b>` +
          (candidate.riders.length ? `<small>carries ${candidate.riders.join(' ')}</small>` : ''),
        cardIndices: [],
        onPick: () => this.choose(candidate),
      })),
      () => {},
    );
  }

  private choose(descend: LegalDescend): void {
    this.selected = descend;
    this.scene.highlightDiver(descend.diver);
    this.hud.setPrompt(this.hud.describeTarget(descend, this.state));

    const hand = this.state.players[this.state.current].hand;
    const options: PayOption[] = descend.combos.map((combo) => ({
      label: `<b>${combo.map((i) => hand[i]).join(' + ')}</b><small>pay ${descend.cost}</small>`,
      cardIndices: combo,
      onPick: () =>
        this.dispatch({
          kind: 'descend',
          diver: descend.diver,
          cards: combo,
          trench: descend.trench,
        }),
    }));
    options.push({ label: '<small>cancel</small>', cardIndices: [], onPick: () => this.clearSelection() });

    this.hud.setOptions(options, (indices) => this.hud.setHand(hand, indices));
  }

  private clearSelection(): void {
    if (!this.selected) return;
    this.selected = null;
    this.scene.highlightDiver(null);
    if (this.isHumanTurn() && !this.locked) {
      this.hud.setPrompt('Your dive — click one of your divers, or a glowing ledge.');
      this.hud.clearOptions();
      this.hud.setHand(this.state.players[this.state.current].hand);
    }
  }
}
