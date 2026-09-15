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
import { Sfx } from '../ui/audio.js';
import { Controller } from './controller.js';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const sfx = new Sfx();

function syncMuteButton(): void {
  const button = element<HTMLButtonElement>('mute');
  button.classList.toggle('off', sfx.isMuted);
  button.setAttribute('aria-pressed', String(!sfx.isMuted));
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

  // Experimental: each diver carries their own small supply that burns down,
  // instead of one shared deck. See DESIGN.md 11n. The checkbox wins; the URL
  // parameter stays so a link can still preselect it.
  const airMode = element<HTMLInputElement>('personalAir').checked ? 'personal' : 'shared';
  const state = newGame(seed, players, { airMode });
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
    sfx,
  );

  element('intro').classList.add('hide');
  document.body.classList.toggle('personal-air', airMode === 'personal');
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

// The rules stay one tap away for the whole game — the cost/payment model is
// not something a player should have to remember from an intro screen.
// Preselect from the URL, remember the choice, and keep the rules card in step.
const personalAir = element<HTMLInputElement>('personalAir');
try {
  const fromUrl = new URLSearchParams(location.search).get('air');
  personalAir.checked = fromUrl ? fromUrl === 'personal' : localStorage.getItem('sunkenhold.air') === 'personal';
} catch {
  /* storage blocked; the default stands */
}
document.body.classList.toggle('personal-air', personalAir.checked);
personalAir.addEventListener('change', () => {
  document.body.classList.toggle('personal-air', personalAir.checked);
  try {
    localStorage.setItem('sunkenhold.air', personalAir.checked ? 'personal' : 'shared');
  } catch {
    /* not fatal */
  }
});

syncMuteButton();
element('mute').addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted);
  // Preselect from the URL, remember the choice, and keep the rules card in step.
const personalAir = element<HTMLInputElement>('personalAir');
try {
  const fromUrl = new URLSearchParams(location.search).get('air');
  personalAir.checked = fromUrl ? fromUrl === 'personal' : localStorage.getItem('sunkenhold.air') === 'personal';
} catch {
  /* storage blocked; the default stands */
}
document.body.classList.toggle('personal-air', personalAir.checked);
personalAir.addEventListener('change', () => {
  document.body.classList.toggle('personal-air', personalAir.checked);
  try {
    localStorage.setItem('sunkenhold.air', personalAir.checked ? 'personal' : 'shared');
  } catch {
    /* not fatal */
  }
});

syncMuteButton();
});

const rules = element('rules');
element('help').addEventListener('click', () => rules.classList.add('show'));
element('rulesClose').addEventListener('click', () => rules.classList.remove('show'));
rules.addEventListener('click', (e) => {
  if (e.target === rules) rules.classList.remove('show');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') rules.classList.remove('show');
});

element('begin').addEventListener('click', begin, { once: true });
