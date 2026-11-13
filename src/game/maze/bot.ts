// Casual bot of « Labyrinthe Express » (docs/PRD.md AC-86): follows the left wall with one swipe every 0.6 s. At each
// swipe time it turns left if it can, else goes straight, else right, else back (relative to its last run, heading
// east at the start of a maze). A swipe that falls during a run is ignored by the engine, as a player's would be.
import type { UpgradeLevels } from '../contract';
import { bit, createMaze, Dir, MazeState, reduceMaze } from './engine';

export const BOT_SWIPE_MS = 600;
export const BOT_STEP_MS = 50;

export function leftWallDir(state: MazeState, heading: Dir): Dir {
  const open = state.open[state.pos];
  const order: Dir[] = [((heading + 3) % 4) as Dir, heading, ((heading + 1) % 4) as Dir, ((heading + 2) % 4) as Dir];
  return order.find((d) => open & bit(d)) ?? heading;
}

/** Plays a whole round in 50 ms ticks; returns the final state. */
export function playMazeBot(seed: number, upgrades: UpgradeLevels = {}): MazeState {
  let state = createMaze(seed, upgrades);
  let heading: Dir = 1;
  let maze = state.maze;
  let sinceSwipe = BOT_SWIPE_MS;
  while (state.status === 'playing') {
    if (state.maze !== maze) {
      maze = state.maze;
      heading = 1;
    }
    if (sinceSwipe >= BOT_SWIPE_MS) {
      sinceSwipe = 0;
      if (!state.run) {
        const dir = leftWallDir(state, heading);
        state = reduceMaze(state, { type: 'swipe', dir });
        if (state.run) heading = dir;
      } else state = reduceMaze(state, { type: 'swipe', dir: heading }); // ignored during the run
    }
    state = reduceMaze(state, { type: 'tick', dt: BOT_STEP_MS });
    sinceSwipe += BOT_STEP_MS;
  }
  return state;
}
