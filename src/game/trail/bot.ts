// Casual bot of Fil d'Ariane (docs/PRD.md, AC-86, v0.3.0 amendment): it follows the seeded path and takes an
// off-path gem only when a 2-cell detour reaches it: out from the head onto the gem, then one free cell back next to
// the next path cell (the two detour cells and the two path cells form a square); otherwise it skips that gem.
// Reading of « out and back »: the gem is the cell next to the head (a gem only next to the following path cell is
// skipped). No lookahead beyond that.
import { adjacent, createTrail, neighbours, reduceTrail, TRAIL_GUARD_MS } from './engine';
import type { TrailState } from './engine';

/** The 2-cell detour from `head` to `next` through an off-path gem not yet on the trail, or null. */
export function gemDetour(state: Pick<TrailState, 'path' | 'gems' | 'rocks'>, trail: readonly number[], head: number, next: number): [number, number] | null {
  const onPath = new Set(state.path);
  const free = (c: number) => !onPath.has(c) && !state.rocks.includes(c) && !trail.includes(c);
  for (const gem of state.gems) {
    if (onPath.has(gem) || !free(gem)) continue;
    if (!adjacent(head, gem)) continue;
    const back = neighbours(gem).find((c) => free(c) && adjacent(c, next));
    if (back !== undefined) return [gem, back];
  }
  return null;
}

/** The cells the bot taps on the current grid, in order (the start excluded). */
export function botRoute(state: TrailState): number[] {
  const route: number[] = [];
  const trail = [state.path[0]];
  for (let i = 0; i + 1 < state.path.length; i++) {
    const detour = gemDetour(state, trail, state.path[i], state.path[i + 1]);
    if (detour) {
      route.push(...detour);
      trail.push(...detour);
    }
    route.push(state.path[i + 1]);
    trail.push(state.path[i + 1]);
  }
  return route;
}

/** Plays a whole round; returns the final state. */
export function playTrailBot(seed: number): TrailState {
  let state = createTrail(seed);
  while (state.status === 'playing') {
    const grid = state.grid;
    for (const cell of botRoute(state)) {
      state = reduceTrail(state, { type: 'tap', cell });
      state = reduceTrail(state, { type: 'tick', dt: TRAIL_GUARD_MS });
      if (state.grid !== grid || state.status !== 'playing') break;
    }
    if (state.grid === grid && state.status === 'playing') throw new Error(`bot route did not reach the exit of grid ${grid}`);
  }
  return state;
}
