// Casual bot of Miroirs et Laser (docs/PRD.md, AC-108): each flip is a mirror of a shortest solution, except with a
// seeded 40 % chance a random mirror instead (a casual player who often tries a mirror to see where the beam goes,
// not a solver: at 30 % its median was 1 290 of the 1 500 possible). It waits for the 120 ms flip and the 800 ms
// solved show with ticks of one frame. No lookahead beyond that; used by the balance test only.
import { createRng } from '../rng';
import { createLaser, hintMirror, reduceLaser } from './engine';
import type { LaserState } from './engine';

export const BOT_RANDOM_CHANCE = 0.4;
/** Frame of the bot's ticks, ms. */
export const BOT_TICK_MS = 40;
/** Bound of the bot loop (a round is at most 5 × (par + 10) flips and their waits). */
const MAX_STEPS = 5000;

/** Plays a whole round; returns the final state. */
export function playLaserBot(seed: number, botSeed = seed ^ 0x5eed): LaserState {
  const rng = createRng(botSeed);
  let state = createLaser(seed);
  for (let step = 0; step < MAX_STEPS && state.status === 'playing'; step++) {
    if (state.flipMs > 0 || state.solvedMs > 0) {
      state = reduceLaser(state, { type: 'tick', dt: BOT_TICK_MS });
      continue;
    }
    const planned = hintMirror(state.board, state.leans);
    const mirror = planned === null || rng.next() < BOT_RANDOM_CHANCE ? rng.int(state.leans.length) : planned;
    state = reduceLaser(state, { type: 'flip', mirror });
  }
  return state;
}
