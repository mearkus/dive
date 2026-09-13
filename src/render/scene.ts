import { Color, Group, Mesh, MeshStandardMaterial, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { GameEvent, GameState, LegalDescend } from '../rules/index.js';
import { buildBoard, type BoardView } from './board.js';
import { animateDiver, buildDiver, setDiverDimmed, type DiverView } from './divers.js';
import { LEDGE_LEGAL, depthMix, LEDGE, ROCK } from './palette.js';
import { costPlate, nameplate, treasurePlate } from './textures.js';
import { LEDGE_DEPTH, SURFACE_Y, diverSlotX, ledgeY, trenchX } from './layout.js';
import { buildWater } from './water.js';
import { Timeline } from './timeline.js';
import type { Stage } from './stage.js';

const RISE = new Vector3(0, 9, 3);

export class GameScene {
  readonly board: BoardView;
  readonly timeline = new Timeline();
  private divers = new Map<string, DiverView>();
  private diverRoot = new Group();
  private water: { update(t: number): void };
  private legalKeys = new Set<string>();
  private reducedMotion: boolean;
  /** Base sprite scales, so label sizing stays idempotent across frames. */
  private labelScale = 1;

  private stage: Stage;

  constructor(stage: Stage, state: GameState, quality: 'low' | 'medium' | 'high') {
    this.stage = stage;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.board = buildBoard(state);
    stage.scene.add(this.board.root);
    stage.scene.add(this.diverRoot);

    const maxDepth = Math.max(...state.trenches.map((t) => t.depth));
    this.water = buildWater(stage.scene, {
      quality,
      depth: maxDepth * 2.35 + 4,
      width: state.trenches.length * 7.6,
    });

    for (const diver of Object.values(state.divers)) {
      const view = buildDiver(diver.id, diver.owner);
      this.divers.set(diver.id, view);
      this.diverRoot.add(view.group);
    }

    this.placeAll(state, true);
    stage.onFrame((t, dt) => this.update(t, dt));
  }

  private update(t: number, dt: number): void {
    this.timeline.update(dt);
    this.water.update(t);
    const ease = this.reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);
    for (const view of this.divers.values()) animateDiver(view, t, ease);

    // Labels hold a near-constant screen size. Without this, fitting a wide
    // board onto a narrow phone shrinks every number into illegibility.
    const distance = this.stage.camera.position.distanceTo(this.stage.controls.target);
    const wanted = Math.min(2.0, Math.max(0.85, distance / 38));
    if (Math.abs(wanted - this.labelScale) > 0.02) {
      this.labelScale = wanted;
      this.applyLabelScale();
    }

    // Legal targets breathe so they read as "you can go here".
    const pulse = 0.28 + Math.sin(t * 3) * 0.16;
    for (const ledge of this.board.ledges) {
      const material = ledge.shelf.material as MeshStandardMaterial;
      const legal = this.legalKeys.has(`${ledge.trench}:${ledge.ledge}`);
      material.emissive.setHex(legal ? LEDGE_LEGAL : 0x000000);
      material.emissiveIntensity = legal ? pulse : 0;
    }
  }

  private applyLabelScale(): void {
    const k = this.labelScale;
    for (const ledge of this.board.ledges) {
      const legal = this.legalKeys.has(`${ledge.trench}:${ledge.ledge}`);
      ledge.plate.scale.set((legal ? 1.34 : 1.15) * k, (legal ? 1.34 : 1.15) * k, 1);
      ledge.plate.position.x = -2.6 - 0.45 * k;
    }
    for (const { sprite } of this.board.nameplates) sprite.scale.set(5.0 * k, 1.56 * k, 1);
    for (const { sprite } of this.board.treasureLabels) sprite.scale.set(3.4 * k, 1.0 * k, 1);
    for (const view of this.divers.values()) {
      const base = view.badge.userData.base ?? 0.5;
      view.badge.scale.set(base * k, base * k, 1);
    }
  }

  /** Where a diver belongs right now, in world space. */
  private positionFor(state: GameState, id: string): Vector3 {
    const diver = state.divers[id];
    const count = state.trenches.length;

    if (diver.pos.kind === 'ledge') {
      const trench = state.trenches[diver.pos.trench];
      const stack = trench.stacks[diver.pos.ledge - 1];
      const slot = Math.max(0, stack.indexOf(id));
      const crowd = Math.max(1, stack.length);
      const view = this.divers.get(id);
      if (view) view.group.scale.setScalar(crowd > 4 ? 1.05 : crowd > 2 ? 1.25 : 1.45);
      return new Vector3(
        trenchX(trench.id, count) + diverSlotX(slot, crowd),
        ledgeY(diver.pos.ledge) + 0.18,
        // Alternate front/back so neighbouring badges never sit flush.
        LEDGE_DEPTH * 0.1 + (slot % 2) * 0.62,
      );
    }

    if (diver.pos.kind === 'scored') {
      const home = this.divers.get(id);
      const from = home ? home.group.position : new Vector3();
      return new Vector3(from.x, SURFACE_Y + RISE.y, from.z + RISE.z);
    }

    // Waiting at the surface: fungible, so queue them tidily in the open water
    // between the trench nameplates and the first ledge.
    const waiting = Object.values(state.divers)
      .filter((d) => d.pos.kind === 'surface')
      .map((d) => d.id)
      .sort();
    const slot = Math.max(0, waiting.indexOf(id));
    const n = Math.max(1, waiting.length);
    const span = Math.min(1.95, (count * 7.6) / n);
    return new Vector3((slot - (n - 1) / 2) * span, SURFACE_Y - 0.15, 6.2);
  }

  placeAll(state: GameState, instant = false): void {
    for (const [id, view] of this.divers) {
      const pos = this.positionFor(state, id);
      view.target.copy(pos);
      const scored = state.divers[id].pos.kind === 'scored';
      if (scored && !view.surfaced) {
        view.surfaced = true;
        setDiverDimmed(view, true);
      }
      if (instant) view.group.position.copy(pos);
      if (scored && instant) view.group.visible = false;
    }
    this.refreshLedgePlates(state);
  }

  /** Costs turn teal when you can afford them; trench labels dim when closed. */
  refreshLedgePlates(state: GameState, legal: LegalDescend[] = []): void {
    this.legalKeys = new Set(legal.map((d) => `${d.trench}:${d.toLedge}`));
    for (const ledge of this.board.ledges) {
      const trench = state.trenches[ledge.trench];
      const isLegal = this.legalKeys.has(`${ledge.trench}:${ledge.ledge}`);
      const material = ledge.plate.material as SpriteMaterial;
      material.map = costPlate(trench.costs[ledge.ledge - 1], isLegal);
      material.needsUpdate = true;

    }
    this.applyLabelScale();

    // The dive line: a visible rope through every shared ledge, so "clipped
    // together" reads as a physical fact rather than a rules footnote.
    for (const ledge of this.board.ledges) {
      const stack = state.trenches[ledge.trench].stacks[ledge.ledge - 1];
      const line = ledge.line;
      if (stack.length > 1) {
        const spread = Math.abs(diverSlotX(stack.length - 1, stack.length) - diverSlotX(0, stack.length));
        line.visible = true;
        line.scale.x = Math.max(0.3, spread + 0.5);
      } else {
        line.visible = false;
      }
    }
    for (const { trench, sprite } of this.board.nameplates) {
      const t = state.trenches[trench];
      const material = sprite.material as SpriteMaterial;
      material.map = nameplate(t.name, t.closed ? 'picked clean' : `depth ${t.depth}`, t.closed);
      material.needsUpdate = true;
    }
    for (const { trench, sprite } of this.board.treasureLabels) {
      const material = sprite.material as SpriteMaterial;
      material.map = treasurePlate(state.trenches[trench].treasure);
      material.needsUpdate = true;
    }
    // Closed trenches lose their glow.
    for (const ledge of this.board.ledges) {
      const t = state.trenches[ledge.trench];
      const material = ledge.shelf.material as MeshStandardMaterial;
      material.color.setHex(
        t.closed ? depthMix(ROCK, 0x0d1b22, 0.6) : depthMix(LEDGE, ROCK, ledge.ledge / 8),
      );
    }
  }

  /** Queue the animation for one action's events, then settle into the new state. */
  play(next: GameState, events: GameEvent[], onDone: () => void): void {
    const scale = this.reducedMotion ? 0.15 : 1;

    for (const event of events) {
      if (event.t === 'stack-moved') {
        this.timeline.push({
          duration: 0.55 * scale,
          start: () => {
            for (const id of event.divers) {
              const view = this.divers.get(id);
              if (view) view.target.copy(this.positionFor(next, id));
            }
          },
        });
      } else if (event.t === 'treasure-taken' || event.t === 'divers-recalled') {
        const ids = event.t === 'treasure-taken' ? [event.diver] : event.divers;
        this.timeline.push({
          duration: 0.5 * scale,
          start: () => {
            for (const id of ids) {
              const view = this.divers.get(id);
              if (!view) continue;
              view.surfaced = true;
              setDiverDimmed(view, true);
              view.target.copy(this.positionFor(next, id));
            }
          },
          done: () => {
            for (const id of ids) {
              const view = this.divers.get(id);
              if (view) view.group.visible = false;
            }
          },
        });
      }
    }

    this.timeline.push({
      duration: 0.08 * scale,
      start: () => this.placeAll(next),
      done: onDone,
    });
  }

  /** Lift the chosen diver briefly so the player can see what they picked. */
  highlightDiver(id: string | null): void {
    for (const [key, view] of this.divers) {
      const on = key === id;
      const material = view.lamp.material as MeshStandardMaterial & { opacity: number };
      material.opacity = on ? 0.3 : 0.09;
      view.badge.userData.base = on ? 0.72 : 0.5;
    }
    this.applyLabelScale();
  }

  diverObjects(): Mesh[] {
    const out: Mesh[] = [];
    for (const view of this.divers.values()) {
      if (!view.group.visible) continue;
      view.group.traverse((child) => {
        if ((child as Mesh).isMesh) {
          (child as Mesh).userData.diver = view.id;
          out.push(child as Mesh);
        }
      });
    }
    return out;
  }

  /**
   * Deliberately a no-op on the orbit target: panning toward the selected
   * trench accumulated drift across a game and pushed the deepest trench off
   * screen. The board fits in one view, so nothing needs to move.
   */
  focusOn(): void {}

  colorOf(owner: number): Color {
    const view = [...this.divers.values()].find((d) => d.owner === owner);
    return view ? new Color((view.group.children[0] as Mesh).userData.color ?? 0xffffff) : new Color(0xffffff);
  }

  spriteOf(id: string): Sprite | undefined {
    return this.divers.get(id)?.badge;
  }
}
