// Casual bot of Duo Synchro (docs/PRD.md, AC-108): each move is the next move of a shortest solution from the
// current positions, except with a seeded 30 % chance a random direction instead (which may be a dead end: the
// engine then fails the puzzle at once). No lookahead beyond that; used by the balance test only.
import { createRng } from '../rng';
import { createTwins, DIRECTIONS, nextMove, reduceTwins, TWINS_MOVE_MS, TWINS_SHOW_MS } from './engine';
import type { TwinsState } from './engine';

export const BOT_RANDOM_CHANCE = 0.3;
/** Safety bound on the commands of a round (blocked moves are not counted by the engine). */
export const BOT_MAX_COMMANDS = 5000;

/** Plays a whole round with the real reducer and its ticks; returns the final state. */
export function playTwinsBot(seed: number, botSeed = seed ^ 0x5eed, onMove: (state: TwinsState) => void = () => {}): TwinsState {
  const rng = createRng(botSeed);
  let state = createTwins(seed);
  for (let commands = 0; commands < BOT_MAX_COMMANDS && state.status === 'playing'; commands++) {
    // A puzzle in play always has a solution: the engine fails it as soon as a move leaves none.
    const planned = nextMove(state.board, state.positions);
    const direction = planned === null || rng.next() < BOT_RANDOM_CHANCE ? rng.pick(DIRECTIONS) : planned;
    state = reduceTwins(state, { type: 'move', direction });
    onMove(state);
    state = reduceTwins(state, { type: 'tick', dt: TWINS_MOVE_MS });
    // A solved or failed puzzle stays shown: the bot waits for the next one.
    if (state.result !== null) state = reduceTwins(state, { type: 'tick', dt: TWINS_SHOW_MS });
  }
  return state;
}
