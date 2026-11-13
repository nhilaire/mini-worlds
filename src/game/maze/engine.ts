// « Labyrinthe Express » (docs/PRD.md "Labyrinthe Express"): seeded perfect mazes of 7 × 7, 9 × 9, 11 × 11...; a
// swipe sends the explorer running cell by cell (12 cells/s) until a wall ahead, a junction or the exit. Pure
// reducer: the round timer, the maze clock (combo) and the run animation are ms counters advanced by `tick`.
//
// Cells are indexed y × size + x, (0, 0) top-left. `open[i]` is a bit mask of the open sides of cell i.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export type Dir = 0 | 1 | 2 | 3; // north, east, south, west (screen y grows downward)
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const bit = (d: Dir): number => 1 << d;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export const ROUND_MS = 60_000;
export const EXTRA_TIME_MS = 5_000; // per « Sablier » level
export const CELLS_PER_S = 12;
export const CELL_MS = 1000 / CELLS_PER_S;
export const MAZE_POINTS = 100;
export const PATH_CELL_POINTS = 2;
export const COMBO_MS = 15_000;

export type Run = { path: readonly number[]; dir: Dir; elapsedMs: number };

export type MazeEvent =
  | BaseEvent
  /** The explorer starts running `cells` cells towards `dir`. */
  | { kind: 'run'; dir: Dir; cells: number }
  /** A swipe into a wall: nothing happens. */
  | { kind: 'blocked'; dir: Dir }
  /** A swipe during a run: ignored (input guard). */
  | { kind: 'ignored' }
  /** The explorer reached the exit of maze `maze` in `ms`; the next maze starts. */
  | { kind: 'exit'; maze: number; ms: number; points: number };

export type MazeState = RoundState<MazeEvent> & {
  /** Current maze, from 1. */
  maze: number;
  /** Side of the current maze: 5 + 2n. */
  size: number;
  open: readonly number[];
  /** Cell of the explorer (the start of the run while running). */
  pos: number;
  exit: number;
  /** Cells of the shortest path from start to exit, both included. */
  pathCells: number;
  run: Run | null;
  timeLeftMs: number;
  /** Time spent in the current maze (combo under 15 s). */
  mazeMs: number;
  rngState: number;
};

export type MazeAction = { type: 'swipe'; dir: Dir } | { type: 'tick'; dt: number };

export function mazeSize(maze: number): number {
  return 5 + 2 * maze;
}

/**
 * Perfect maze by randomized depth-first search (iterative): every cell is visited exactly once, so the generator is
 * bounded by construction (size² steps) and always yields a spanning tree - one path between any two cells.
 */
export function generateMaze(size: number, rngState: number): { open: number[]; rngState: number } {
  const rng = createRng(rngState);
  const n = size * size;
  const open = new Array<number>(n).fill(0);
  const visited = new Array<boolean>(n).fill(false);
  const stack = [0];
  visited[0] = true;
  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    const x = cell % size;
    const y = Math.floor(cell / size);
    const options = DIRS.filter((d) => {
      const nx = x + DX[d];
      const ny = y + DY[d];
      return nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny * size + nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const d = options[rng.int(options.length)];
    const next = (y + DY[d]) * size + x + DX[d];
    open[cell] |= bit(d);
    open[next] |= bit(opposite(d));
    visited[next] = true;
    stack.push(next);
  }
  return { open, rngState: rng.state() };
}

export function neighbour(size: number, cell: number, d: Dir): number {
  return cell + DY[d] * size + DX[d];
}

/** Cells of the shortest path between two cells (both included), by breadth-first search. */
export function shortestPathCells(open: readonly number[], size: number, from: number, to: number): number {
  const dist = new Array<number>(open.length).fill(-1);
  dist[from] = 1;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (cell === to) return dist[cell];
    for (const d of DIRS) {
      if (!(open[cell] & bit(d))) continue;
      const next = neighbour(size, cell, d);
      if (dist[next] < 0) {
        dist[next] = dist[cell] + 1;
        queue.push(next);
      }
    }
  }
  return -1;
}

/** A junction: an open side other than forward and back (corners included: the run stops there). */
function isJunction(open: number, d: Dir): boolean {
  return (open & ~(bit(d) | bit(opposite(d)))) !== 0;
}

/** Cells the explorer runs through for a swipe towards `dir` (start excluded); empty into a wall. */
export function runPath(open: readonly number[], size: number, from: number, exit: number, dir: Dir): number[] {
  const path: number[] = [];
  let cell = from;
  while (open[cell] & bit(dir)) {
    cell = neighbour(size, cell, dir);
    path.push(cell);
    if (cell === exit || isJunction(open[cell], dir)) break;
  }
  return path;
}

function startMaze(maze: number, rngState: number): Pick<MazeState, 'maze' | 'size' | 'open' | 'pos' | 'exit' | 'pathCells' | 'run' | 'mazeMs' | 'rngState'> {
  const size = mazeSize(maze);
  const generated = generateMaze(size, rngState);
  const exit = size * size - 1;
  return { maze, size, open: generated.open, pos: 0, exit, pathCells: shortestPathCells(generated.open, size, 0, exit), run: null, mazeMs: 0, rngState: generated.rngState };
}

export function roundMs(upgrades: UpgradeLevels): number {
  return ROUND_MS + EXTRA_TIME_MS * (upgrades.extra_time ?? 0);
}

export function createMaze(seed: number, upgrades: UpgradeLevels = {}): MazeState {
  return { score: 0, combos: 0, status: 'playing', events: [], timeLeftMs: roundMs(upgrades), ...startMaze(1, seed >>> 0) };
}

/** Points of a solved maze: 100 + 2 × shortest path cells. */
export function mazePoints(pathCells: number): number {
  return MAZE_POINTS + PATH_CELL_POINTS * pathCells;
}

function swipe(state: MazeState, dir: Dir): MazeState {
  if (state.run) return { ...state, events: [{ kind: 'ignored' }] };
  const path = runPath(state.open, state.size, state.pos, state.exit, dir);
  if (path.length === 0) return { ...state, events: [{ kind: 'blocked', dir }] };
  return { ...state, run: { path, dir, elapsedMs: 0 }, events: [{ kind: 'run', dir, cells: path.length }] };
}

function tick(state: MazeState, dt: number): MazeState {
  if (dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
  const run = state.run;
  if (run) {
    const total = run.path.length * CELL_MS;
    const elapsed = run.elapsedMs + dt;
    const arrivesIn = total - run.elapsedMs; // ms into this tick when the run ends
    if (elapsed < total || arrivesIn > state.timeLeftMs) {
      return advanceClock({ ...state, run: { ...run, elapsedMs: Math.min(elapsed, total) } }, dt, []);
    }
    const pos = run.path[run.path.length - 1];
    if (pos !== state.exit) return advanceClock({ ...state, pos, run: null }, dt, []);
    // The exit is reached inside this tick: score it at the arrival time, then the rest of the tick runs in the next maze.
    const ms = state.mazeMs + arrivesIn;
    const points = mazePoints(state.pathCells);
    const combo = ms < COMBO_MS;
    const events: MazeEvent[] = [{ kind: 'exit', maze: state.maze, ms, points }, { kind: 'score', points }];
    if (combo) events.push({ kind: 'combo' });
    const next = { ...state, ...startMaze(state.maze + 1, state.rngState), score: state.score + points, combos: state.combos + (combo ? 1 : 0) };
    return advanceClock({ ...next, mazeMs: -arrivesIn }, dt, events);
  }
  return advanceClock(state, dt, []);
}

function advanceClock(state: MazeState, dt: number, events: MazeEvent[]): MazeState {
  const timeLeftMs = Math.max(0, state.timeLeftMs - dt);
  const mazeMs = state.mazeMs + dt;
  if (timeLeftMs <= 0) return { ...state, timeLeftMs, mazeMs, run: null, status: 'over', events: [...events, { kind: 'over', score: state.score }] };
  return { ...state, timeLeftMs, mazeMs, events };
}

export function reduceMaze(state: MazeState, action: MazeAction): MazeState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'swipe':
      return swipe(state, action.dir);
  }
}

/** Where to draw the explorer, in cells (fractions while running). */
export function explorerAt(state: MazeState): { x: number; y: number } {
  const { size, pos, run } = state;
  const at = (cell: number) => ({ x: cell % size, y: Math.floor(cell / size) });
  if (!run) return at(pos);
  const progress = run.elapsedMs / CELL_MS;
  const index = Math.min(run.path.length, Math.floor(progress));
  const from = at(index === 0 ? pos : run.path[index - 1]);
  if (index >= run.path.length) return from;
  const to = at(run.path[index]);
  const f = progress - index;
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
}

/** Seconds shown on the HUD (rounded up). */
export function secondsLeft(state: MazeState): number {
  return Math.ceil(state.timeLeftMs / 1000);
}
