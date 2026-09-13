import type { Action, GameState } from '../rules/index.js';

export interface Policy {
  name: string;
  /** Pick an action. Must return one of legalActions(state). */
  choose(state: GameState): Action;
}
