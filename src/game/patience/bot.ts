// Casual bot of Réussite Express (docs/PRD.md, AC-108): plays the leftmost column whose bottom card is a neighbour
// of the pile, else draws; with a seeded 20 % chance of drawing although a card can be played (while the stock has
// cards). No lookahead, no joker (it plays without upgrades). It plays the real reducer (taps, then 50 ms ticks
// through the move guard and the finished-deal pause).
import { createRng } from '../rng';
import { acceptsInput, createPatience, PatienceState, playableColumns, reducePatience } from './engine';

export const BOT_DRAW_CHANCE = 0.2;
const FRAME_MS = 50;

/** Plays a whole round with the casual policy; returns the final state. `onStep` sees the state after every input. */
export function playPatienceBot(seed: number, botSeed = seed ^ 0x5bd1e995, onStep?: (state: PatienceState) => void): PatienceState {
  const rng = createRng(botSeed);
  let state = createPatience(seed);
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      state = reducePatience(state, { type: 'tick', dt: FRAME_MS });
      continue;
    }
    const playable = playableColumns(state);
    const careless = rng.next() < BOT_DRAW_CHANCE;
    // An empty stock with nothing to play ends the deal in the engine, so one of the two is always possible here.
    if (playable.length > 0 && (!careless || state.stock.length === 0)) state = reducePatience(state, { type: 'tapColumn', column: playable[0] });
    else state = reducePatience(state, { type: 'draw' });
    onStep?.(state);
  }
  return state;
}
