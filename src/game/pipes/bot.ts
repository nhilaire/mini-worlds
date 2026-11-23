// Casual bot of « Plombier Express » (docs/PRD.md "Plombier Express", AC-115): before each tap it thinks for a seeded
// time (600 to 1 000 ms of the grid clock), then turns the first path cell that is not yet right - or, with a seeded
// error chance of 20 %, a random cell off the path (a wasted tap). It never uses hints. Grids grow and their time
// shrinks, so the clock or the taps beat it in the end; a round is capped at BOT_GRID_CAP grids for safety.
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { createPipes, hintCell, PipesState, reducePipes, SOLVED_SHOW_MS } from './engine';

export const BOT_THINK_MIN_MS = 600;
export const BOT_THINK_MAX_MS = 1000;
export const BOT_ERROR = 0.2;
export const BOT_GRID_CAP = 60;

export function playPipesBot(seed: number, upgrades: UpgradeLevels = {}): PipesState {
  const rng = createRng((seed ^ 0x2545f491) >>> 0);
  let state = createPipes(seed, upgrades);
  while (state.status === 'playing' && state.grid <= BOT_GRID_CAP) {
    if (state.solvedMs > 0) {
      state = reducePipes(state, { type: 'tick', dt: SOLVED_SHOW_MS });
      continue;
    }
    state = reducePipes(state, { type: 'tick', dt: BOT_THINK_MIN_MS + rng.int(BOT_THINK_MAX_MS - BOT_THINK_MIN_MS + 1) });
    if (state.status !== 'playing') break;
    const onPath = new Set(state.path.map((p) => p.cell));
    const off = state.pieces.map((_, cell) => cell).filter((cell) => !onPath.has(cell));
    const target = rng.next() < BOT_ERROR && off.length > 0 ? off[rng.int(off.length)] : (hintCell(state) ?? state.path[0].cell);
    state = reducePipes(state, { type: 'tap', cell: target });
  }
  return state;
}
