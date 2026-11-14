// Fil d'Ariane: trace a trail across a 6 × 6 grid from the start (left column) to the exit (right column), picking up
// gems and avoiding rocks (docs/PRD.md "Fil d'Ariane", AC-84). Pure reducer on an immutable state, see
// src/game/contract.ts. Cells are indexed `row * 6 + col`, row 0 at the top. The 150 ms input guard between two taps
// is an engine counter advanced by `tick`.
//
// Rule readings (the PRD leaves them open):
// - « 50 per gem collected »: a gem counts when the trail holds its cell as it reaches the exit; stepping back off a
//   gem puts it back.
// - The seeded path is 12 to 20 cells long, so the 6 + k rocks find room off the path, the gems and the checked full
//   trail (an attempt without that room is drawn again).
// - The guard applies to every accepted tap (extend or step back): any tap less than 150 ms after it is ignored.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import type { Rng } from '../rng';

export const TRAIL_SIZE = 6;
export const TRAIL_GRIDS = 5;
export const PATH_MIN = 12;
export const PATH_MAX = 20;
/** Gems of a grid that sit off the path (next to it), the others are on the path. */
export const OFF_PATH_GEMS = 2;
/** Minimum time between two accepted taps (input guard), ms. */
export const TRAIL_GUARD_MS = 150;
export const GEM_POINTS = 50;
export const ALL_GEMS_BONUS = 100;
/** Generator bounds: seeded attempts (path, then full-trail check), each search limited in visited cells, then a fixed grid. */
export const GEN_ATTEMPTS = 40;
export const GEN_STEPS = 4000;

export type TrailEvent =
  | { kind: 'extend'; cell: number; gem: boolean }
  | { kind: 'back'; cell: number }
  /** A tap on a rock, a far cell or a cell of the trail: nothing changes. */
  | { kind: 'blocked'; cell: number }
  /** A tap less than 150 ms after the previous one: ignored. */
  | { kind: 'ignored' }
  | { kind: 'exit'; grid: number; gems: number; total: number; points: number }
  /** The next grid is on the board. */
  | { kind: 'grid'; grid: number }
  | { kind: 'hint'; cell: number };

export type TrailGrid = {
  start: number;
  exit: number;
  /** The seeded self-avoiding path, start first, exit last. */
  path: readonly number[];
  /** 3 + k gems: 1 + k on the path, then 2 off the path next to it. */
  gems: readonly number[];
  rocks: readonly number[];
  /** The checked trail from start to exit that collects every gem (rocks are never on it). */
  solution: readonly number[];
};

export type TrailState = RoundState<TrailEvent> &
  TrailGrid & {
    /** Current grid, 1..5. */
    grid: number;
    /** The player's trail, start first; its last cell is the head. */
    trail: readonly number[];
    hintsLeft: number;
    /** Cell highlighted by the last hint (next path cell, or the head to step back), null when none is shown. */
    hint: number | null;
    /** Remaining time of the input guard, ms. */
    guardMs: number;
    rngState: number;
  };

export type TrailAction = { type: 'tap'; cell: number } | { type: 'hint' } | { type: 'tick'; dt: number };

export const cellOf = (col: number, row: number): number => row * TRAIL_SIZE + col;
export const colOf = (cell: number): number => cell % TRAIL_SIZE;
export const rowOf = (cell: number): number => Math.floor(cell / TRAIL_SIZE);

export function neighbours(cell: number): number[] {
  const col = colOf(cell);
  const row = rowOf(cell);
  const out: number[] = [];
  if (row > 0) out.push(cell - TRAIL_SIZE);
  if (row < TRAIL_SIZE - 1) out.push(cell + TRAIL_SIZE);
  if (col > 0) out.push(cell - 1);
  if (col < TRAIL_SIZE - 1) out.push(cell + 1);
  return out;
}

export const adjacent = (a: number, b: number): boolean => neighbours(a).includes(b);

export const gemCount = (k: number): number => 3 + k;
export const rockCount = (k: number): number => 6 + k;

/** Points of a grid finished with `gems` of `total` gems on the trail. */
export function gridScore(gems: number, total: number): number {
  return GEM_POINTS * gems + (gems === total ? ALL_GEMS_BONUS : 0);
}

/**
 * Seeded self-avoiding path from `start` to `exit` of PATH_MIN..PATH_MAX cells: a depth-first search that tries the
 * neighbours in seeded order and enters the exit only as the last cell; null when GEN_STEPS cells were visited.
 */
function seededPath(rng: Rng, start: number, exit: number): number[] | null {
  const path = [start];
  const used = new Set<number>([start]);
  const options: number[][] = [rng.shuffle(neighbours(start))];
  let steps = 0;
  while (options.length > 0) {
    if (++steps > GEN_STEPS) return null;
    const choices = options[options.length - 1];
    const next = choices.pop();
    if (next === undefined) {
      options.pop();
      used.delete(path.pop() as number);
      continue;
    }
    if (used.has(next)) continue;
    if (next === exit) {
      if (path.length + 1 >= PATH_MIN) return [...path, exit];
      continue;
    }
    if (path.length + 1 >= PATH_MAX) continue; // no room left for the exit
    path.push(next);
    used.add(next);
    options.push(rng.shuffle(neighbours(next)));
  }
  return null;
}

/**
 * A self-avoiding trail from `start` to `exit` through every cell of `gems` (start and exit excluded), or null when
 * none is found within `maxSteps` visited cells. Depth-first; gems are tried first, then the cells of `prefer` (the
 * seeded path) in its order, so the trail stays close to the path; a branch is cut as soon as a flood fill from the
 * head over the free cells misses a remaining gem or the exit.
 */
export function fullTrail(start: number, exit: number, gems: readonly number[], prefer: readonly number[], maxSteps: number): number[] | null {
  const n = TRAIL_SIZE * TRAIL_SIZE;
  const isGem = new Uint8Array(n);
  for (const g of gems) isGem[g] = 1;
  const rank = new Int32Array(n).fill(n);
  prefer.forEach((c, i) => (rank[c] = i));
  const used = new Uint8Array(n);
  const trail = [start];
  used[start] = 1;
  let left = gems.length;
  let steps = 0;
  const reachable = (head: number): boolean => {
    const seen = new Uint8Array(n);
    const queue = [head];
    seen[head] = 1;
    let gemsSeen = 0;
    let exitSeen = false;
    for (let i = 0; i < queue.length; i++) {
      for (const next of neighbours(queue[i])) {
        if (seen[next] || used[next]) continue;
        seen[next] = 1;
        if (next === exit) {
          exitSeen = true;
          continue; // the exit ends the trail: nothing is reached through it
        }
        if (isGem[next]) gemsSeen++;
        queue.push(next);
      }
    }
    return exitSeen && gemsSeen === left;
  };
  const dfs = (head: number): boolean => {
    if (++steps > maxSteps) return false;
    const options = neighbours(head)
      .filter((c) => !used[c])
      .sort((a, b) => isGem[b] - isGem[a] || rank[a] - rank[b]);
    for (const next of options) {
      if (next === exit) {
        if (left === 0) {
          trail.push(exit);
          return true;
        }
        continue;
      }
      used[next] = 1;
      trail.push(next);
      left -= isGem[next];
      if (reachable(next) && dfs(next)) return true;
      left += isGem[next];
      trail.pop();
      used[next] = 0;
      if (steps > maxSteps) return false;
    }
    return false;
  };
  return dfs(start) ? trail : null;
}

/** Fixed grid used when every seeded attempt fails: a 12-cell path, 2 off-path gems on a known full trail. */
export const FALLBACK: { path: readonly number[]; offPath: readonly number[]; solution: readonly number[] } = {
  path: [cellOf(0, 0), cellOf(1, 0), cellOf(2, 0), cellOf(2, 1), cellOf(1, 1), cellOf(0, 1), cellOf(0, 2), cellOf(1, 2), cellOf(2, 2), cellOf(3, 2), cellOf(4, 2), cellOf(5, 2)],
  offPath: [cellOf(0, 3), cellOf(3, 1)],
  solution: [
    cellOf(0, 0), cellOf(1, 0), cellOf(2, 0), cellOf(2, 1), cellOf(1, 1), cellOf(0, 1), cellOf(0, 2), cellOf(0, 3),
    cellOf(1, 3), cellOf(1, 2), cellOf(2, 2), cellOf(3, 2), cellOf(3, 1), cellOf(4, 1), cellOf(4, 2), cellOf(5, 2),
  ],
};

export type BuiltGrid = TrailGrid & {
  rngState: number;
  fallback: boolean;
};

/**
 * Grid k (PRD amendment of v0.3.0): seeded start / exit rows and a seeded path; 3 + k gems, 1 + k on seeded inner
 * cells of the path and 2 on seeded free cells next to the path, kept only when one self-avoiding trail from start to
 * exit collects them all (`fullTrail`, bounded); 6 + k rocks on seeded cells off the path, off the gems and off that
 * trail. Up to GEN_ATTEMPTS attempts, else the FALLBACK grid.
 */
export function buildGrid(rngState: number, grid: number): BuiltGrid {
  const rng = createRng(rngState);
  const all = Array.from({ length: TRAIL_SIZE * TRAIL_SIZE }, (_, i) => i);
  const finish = (path: readonly number[], pathGems: readonly number[], offPath: readonly number[], solution: readonly number[], fallback: boolean): BuiltGrid | null => {
    const taken = new Set([...path, ...offPath, ...solution]);
    const free = all.filter((c) => !taken.has(c));
    if (free.length < rockCount(grid)) return null;
    const rocks = rng.shuffle(free).slice(0, rockCount(grid));
    return { start: path[0], exit: path[path.length - 1], path, gems: [...pathGems, ...offPath], rocks, solution, rngState: rng.state(), fallback };
  };
  for (let attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
    const start = cellOf(0, rng.int(TRAIL_SIZE));
    const exit = cellOf(TRAIL_SIZE - 1, rng.int(TRAIL_SIZE));
    const path = seededPath(rng, start, exit);
    if (!path) continue;
    const onPath = new Set(path);
    const pathGems = rng.shuffle(path.slice(1, -1)).slice(0, gemCount(grid) - OFF_PATH_GEMS);
    const beside = all.filter((c) => !onPath.has(c) && neighbours(c).some((m) => onPath.has(m)));
    const offPath = rng.shuffle(beside).slice(0, OFF_PATH_GEMS);
    if (offPath.length < OFF_PATH_GEMS) continue;
    const solution = fullTrail(start, exit, [...pathGems, ...offPath], path, GEN_STEPS);
    if (!solution) continue;
    const built = finish(path, pathGems, offPath, solution, false);
    if (built) return built;
  }
  const pathGems = rng.shuffle(FALLBACK.path.slice(1, -1)).slice(0, gemCount(grid) - OFF_PATH_GEMS);
  return finish(FALLBACK.path, pathGems, FALLBACK.offPath, FALLBACK.solution, true) as BuiltGrid;
}

type Carry = Pick<TrailState, 'score' | 'combos' | 'status' | 'hintsLeft' | 'rngState'>;

function startGrid(carry: Carry, grid: number): TrailState {
  const built = buildGrid(carry.rngState, grid);
  return {
    ...carry,
    events: [],
    grid,
    start: built.start,
    exit: built.exit,
    path: built.path,
    gems: built.gems,
    rocks: built.rocks,
    solution: built.solution,
    trail: [built.start],
    hint: null,
    guardMs: 0,
    rngState: built.rngState,
  };
}

export function createTrail(seed: number, upgrades: UpgradeLevels = {}): TrailState {
  return startGrid({ score: 0, combos: 0, status: 'playing', hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** Gems on the trail. */
export function gemsOnTrail(state: Pick<TrailState, 'gems' | 'trail'>): number {
  return state.gems.filter((g) => state.trail.includes(g)).length;
}

/** The trail is still the seeded path's beginning. */
export function followsPath(state: Pick<TrailState, 'trail' | 'path'>): boolean {
  return state.trail.every((cell, i) => state.path[i] === cell);
}

/** The cell a hint shows: the next path cell while the trail follows the path, else the head (step back). */
export function hintCell(state: Pick<TrailState, 'trail' | 'path'>): number {
  return followsPath(state) ? state.path[state.trail.length] : state.trail[state.trail.length - 1];
}

export function reduceTrail(state: TrailState, action: TrailAction): TrailState {
  if (action.type === 'tick') {
    if (state.guardMs <= 0 || !(action.dt > 0)) return state;
    return { ...state, guardMs: Math.max(0, state.guardMs - action.dt), events: [] };
  }
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'hint') {
    // Refused when none is left or one is already shown (a second one would show the same cell).
    if (state.hintsLeft <= 0 || state.hint !== null) return { ...state, events: [] };
    const cell = hintCell(state);
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: cell, events: [{ kind: 'hint', cell }] };
  }

  const { cell } = action;
  if (state.guardMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  const head = state.trail[state.trail.length - 1];
  if (cell === head && state.trail.length > 1) {
    return { ...state, trail: state.trail.slice(0, -1), hint: null, guardMs: TRAIL_GUARD_MS, events: [{ kind: 'back', cell }] };
  }
  const free = Number.isInteger(cell) && cell >= 0 && cell < TRAIL_SIZE * TRAIL_SIZE && !state.rocks.includes(cell) && !state.trail.includes(cell);
  if (!free || !adjacent(head, cell)) return { ...state, events: [{ kind: 'blocked', cell }] };

  const trail = [...state.trail, cell];
  const events: TrailState['events'][number][] = [{ kind: 'extend', cell, gem: state.gems.includes(cell) }];
  if (cell !== state.exit) return { ...state, trail, hint: null, guardMs: TRAIL_GUARD_MS, events };

  const gems = gemsOnTrail({ gems: state.gems, trail });
  const total = state.gems.length;
  const points = gridScore(gems, total);
  const score = state.score + points;
  let combos = state.combos;
  events.push({ kind: 'exit', grid: state.grid, gems, total, points }, { kind: 'score', points });
  if (gems === total) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  if (state.grid >= TRAIL_GRIDS) {
    events.push({ kind: 'over', score });
    return { ...state, trail, hint: null, score, combos, guardMs: TRAIL_GUARD_MS, status: 'over', events };
  }
  const next = startGrid({ score, combos, status: 'playing', hintsLeft: state.hintsLeft, rngState: state.rngState }, state.grid + 1);
  events.push({ kind: 'grid', grid: next.grid });
  return { ...next, guardMs: TRAIL_GUARD_MS, events };
}
