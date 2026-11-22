// Casual bot of Glisse-Fusion (docs/PRD.md, AC-108): plays the move that scores the most right now (ties: down, then
// left, right, up, so that the gems pile up in a corner), with a seeded 25 % chance of a random possible move
// instead. No lookahead beyond the move itself, no undo. It plays the real reducer (swipes, then 50 ms ticks through
// the move guard).
import { createRng } from '../rng';
import { acceptsInput, createTiles, Dir, reduceTiles, slide, TilesState } from './engine';

export const BOT_RANDOM_CHANCE = 0.25;
/** Tie-break order of the bot: down, left, right, up. */
export const BOT_ORDER: readonly Dir[] = [2, 3, 1, 0];
const FRAME_MS = 50;

/** The possible move that scores the most now (first of BOT_ORDER on a tie), null when nothing can move. */
export function greedyMove(cells: readonly number[]): Dir | null {
  let best: Dir | null = null;
  let bestPoints = -1;
  for (const dir of BOT_ORDER) {
    const slid = slide(cells, dir);
    if (slid.changed && slid.points > bestPoints) {
      best = dir;
      bestPoints = slid.points;
    }
  }
  return best;
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playTilesBot(seed: number, botSeed = seed ^ 0x5bd1e995): TilesState {
  const rng = createRng(botSeed);
  let state = createTiles(seed);
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      state = reduceTiles(state, { type: 'tick', dt: FRAME_MS });
      continue;
    }
    const possible = BOT_ORDER.filter((dir) => slide(state.cells, dir).changed);
    // The reducer ends the round when nothing can move, so a move is always possible here.
    const greedy = greedyMove(state.cells) as Dir;
    const dir = rng.next() < BOT_RANDOM_CHANCE ? possible[rng.int(possible.length)] : greedy;
    state = reduceTiles(state, { type: 'swipe', dir });
  }
  return state;
}
