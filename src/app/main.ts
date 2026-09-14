/**
 * Bootstrap. Wires the intro screen to a match, then hands control to
 * Controller — which owns the input → reducer → animation loop.
 *
 * The same rules engine runs here and in `npm run play`; nothing in
 * src/render or src/ui can change game state (DESIGN.md §6.1).
 */
import { newGame } from '../rules/index.js';
import { createStage, detectQuality } from '../render/stage.js';
import { configureLayout } from '../render/layout.js';
import { GameScene } from '../render/scene.js';
import { Hud } from '../ui/hud.js';
import { Coach } from '../ui/coach.js';
import { Controller } from './controller.js';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function begin(): void {
  const canvas = element<HTMLCanvasElement>('stage');
  const players = Number(element<HTMLSelectElement>('playerCount').value);
  const difficulty = element<HTMLSelectElement>('difficulty').value as 'greedy' | 'search';
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
  // ?watch=1 sits every seat with a bot — an attract mode, and the easiest way
  // to watch a whole game play out.
  const humanSeats = params.get('watch') === '1' ? [] : [0];

  // Must precede the scene: the board bakes ledge positions at build time.
  configureLayout(window.innerWidth / Math.max(1, window.innerHeight));

  const state = newGame(seed, players);
  const quality = detectQuality();
  const maxDepth = Math.max(...state.trenches.map((t) => t.depth));

  const stage = createStage(canvas, state.trenches.length, maxDepth, quality);
  const scene = new GameScene(stage, state, quality);
  const hud = new Hud();
  const tips = element<HTMLInputElement>('tips').checked;
  const controller = new Controller(
    stage,
    scene,
    hud,
    { players, humanSeats, seed, difficulty },
    state,
    new Coach(tips),
  );

  element('intro').classList.add('hide');
  stage.start();
  controller.start();
}

// Offer a reset only to someone who has actually seen tips before.
const replay = element<HTMLButtonElement>('replayTips');
if (Coach.anySeen()) {
  replay.hidden = false;
  replay.addEventListener('click', () => {
    Coach.reset();
    element<HTMLInputElement>('tips').checked = true;
    replay.textContent = 'Tips reset';
    replay.disabled = true;
  });
}

element('begin').addEventListener('click', begin, { once: true });
