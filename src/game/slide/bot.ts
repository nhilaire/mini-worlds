// Casual bot of Bloc Glissant (docs/PRD.md, AC-86): each move is the next move of a shortest solution, except with a
// seeded 30 % chance a random legal move instead. No lookahead beyond that; used by the balance test only.
import { createRng } from '../rng';
import { createSlide, directionOf, reduceSlide, SLIDE_MS } from './engine';
import type { SlideState } from './engine';
import { legalMoves, solve } from './solver';
import type { SlideMove } from './solver';

export const BOT_RANDOM_CHANCE = 0.3;

/** Plays a whole round; returns the final state. */
export function playSlideBot(seed: number, botSeed = seed ^ 0x5eed): SlideState {
  const rng = createRng(botSeed);
  let state = createSlide(seed);
  let plan: SlideMove[] = [];
  let planPuzzle = 0;
  while (state.status === 'playing') {
    if (planPuzzle !== state.puzzle || plan.length === 0) {
      plan = solve(state.blocks) ?? [];
      planPuzzle = state.puzzle;
    }
    let move: SlideMove;
    if (rng.next() < BOT_RANDOM_CHANCE) {
      move = rng.pick(legalMoves(state.blocks));
      const planned = plan[0];
      // The shortest solution only holds when the random move happens to be its next move.
      if (planned && planned.block === move.block && planned.delta === move.delta) plan = plan.slice(1);
      else plan = [];
    } else {
      move = plan[0];
      plan = plan.slice(1);
    }
    state = reduceSlide(state, { type: 'swipe', block: move.block, dir: directionOf(state.blocks, move) });
    state = reduceSlide(state, { type: 'tick', dt: SLIDE_MS });
  }
  return state;
}
