// Duo Synchro: two characters on a 6 × 6 grid with walls, moved by one command (docs/PRD.md "Duo Synchro", AC-107).
// Pure reducer on an immutable state, see src/game/contract.ts. A move sends both characters one cell in the same
// direction, each one only if its own target cell is free (inside the grid, no wall); they may share a cell. The
// puzzle is solved when each one stands on its own exit after the same move. Puzzle k (1..5) has 6 + k seeded walls
// and seeded starts; its exits are the furthest joint positions (breadth-first search) whose distance, the par, is
// in [4 + k, 7 + 2k]. A puzzle is failed (0 points) after par + 25 moves, or at once when a move leaves the exits out
// of reach (a dead end: e.g. two characters on one cell never part again). The 120 ms move and the 800 ms a finished
// puzzle stays shown are engine counters advanced by `tick`.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const TWINS_SIZE = 6;
export const TWINS_CELLS = TWINS_SIZE * TWINS_SIZE;
export const TWINS_PUZZLES = 5;
/** Moves beyond par after which an unsolved puzzle is failed. */
export const TWINS_FAIL_AFTER = 25;
/** Puzzle score: TWINS_SCORE_MAX at par, TWINS_SCORE_PER_MOVE less per move beyond par, never under TWINS_SCORE_MIN. */
export const TWINS_SCORE_MAX = 300;
export const TWINS_SCORE_PER_MOVE = 15;
export const TWINS_SCORE_MIN = 50;
/** A move animates in 120 ms; swipes and taps meanwhile are ignored (input guard). */
export const TWINS_MOVE_MS = 120;
/** A solved or failed puzzle stays shown this long before the next one (or the end of the round). */
export const TWINS_SHOW_MS = 800;
/** Generator bound (PRD): seeded boards tried before the fixed fallback puzzle. */
export const GEN_ATTEMPTS = 30;

export type Direction = 'up' | 'right' | 'down' | 'left';
/** Fixed order of the searches (the first shortest solution found is the hint). */
export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

/** Cells of the two characters (a: blue round, b: orange square), as row × 6 + column. */
export type Positions = { a: number; b: number };
/** Wall cells (sorted) and the exit of each character. */
export type TwinsPuzzle = { walls: readonly number[]; exits: Positions };

export type TwinsEvent =
  /** An accepted move: which character moved (the other one bumped into a wall or the edge). */
  | { kind: 'move'; direction: Direction; a: boolean; b: boolean }
  /** Neither character can move that way: nothing changes, the move is not counted. */
  | { kind: 'blocked'; direction: Direction }
  /** A move during the 120 ms animation or while a finished puzzle is shown: ignored. */
  | { kind: 'ignored' }
  | { kind: 'solved'; puzzle: number; moves: number; par: number; points: number }
  /** Failed: the exits can no longer be reached (dead end), or par + 25 moves were played. */
  | { kind: 'failed'; puzzle: number; reason: 'dead_end' | 'moves' }
  /** The next puzzle is on the grid. */
  | { kind: 'puzzle'; puzzle: number }
  | { kind: 'hint'; direction: Direction };

export type TwinsState = RoundState<TwinsEvent> & {
  board: TwinsPuzzle;
  positions: Positions;
  /** Current puzzle, 1..5. */
  puzzle: number;
  par: number;
  /** Moves on the current puzzle (hints and blocked moves are not moves). */
  moves: number;
  hintsLeft: number;
  /** Direction of the next move of a shortest solution shown by the last hint, null when none is shown. */
  hint: Direction | null;
  /** Remaining time of the current move animation (input guard), ms. */
  slideMs: number;
  /** How the current puzzle ended, null while it is played. */
  result: 'solved' | 'failed' | null;
  /** Remaining time the finished puzzle stays shown, ms. */
  shownMs: number;
  rngState: number;
};

export type TwinsAction = { type: 'move'; direction: Direction } | { type: 'hint' } | { type: 'tick'; dt: number };

export const colOf = (cell: number) => cell % TWINS_SIZE;
export const rowOf = (cell: number) => Math.floor(cell / TWINS_SIZE);
export const cellAt = (col: number, row: number) => row * TWINS_SIZE + col;

export const wallCount = (puzzle: number) => 6 + puzzle;
export const parRange = (puzzle: number): [number, number] => [4 + puzzle, 7 + 2 * puzzle];

export function puzzleScore(moves: number, par: number): number {
  return Math.max(TWINS_SCORE_MIN, TWINS_SCORE_MAX - TWINS_SCORE_PER_MOVE * Math.max(0, moves - par));
}

const DELTAS: Record<Direction, { dc: number; dr: number }> = { up: { dc: 0, dr: -1 }, right: { dc: 1, dr: 0 }, down: { dc: 0, dr: 1 }, left: { dc: -1, dr: 0 } };

/** The cell one step away, or the same cell when the step leaves the grid or enters a wall. */
function stepCell(blocked: ArrayLike<number | boolean>, cell: number, direction: Direction): number {
  const col = colOf(cell) + DELTAS[direction].dc;
  const row = rowOf(cell) + DELTAS[direction].dr;
  if (col < 0 || col >= TWINS_SIZE || row < 0 || row >= TWINS_SIZE) return cell;
  const target = cellAt(col, row);
  return blocked[target] ? cell : target;
}

function wallMap(walls: readonly number[]): Uint8Array {
  const blocked = new Uint8Array(TWINS_CELLS);
  for (const wall of walls) blocked[wall] = 1;
  return blocked;
}

/** One command: each character moves one cell if its own target cell is free; the other one's cell never blocks. */
export function step(puzzle: TwinsPuzzle, positions: Positions, direction: Direction): Positions {
  const blocked = wallMap(puzzle.walls);
  return { a: stepCell(blocked, positions.a, direction), b: stepCell(blocked, positions.b, direction) };
}

export function isSolved(puzzle: TwinsPuzzle, positions: Positions): boolean {
  return positions.a === puzzle.exits.a && positions.b === puzzle.exits.b;
}

const keyOf = (positions: Positions) => positions.a * TWINS_CELLS + positions.b;
const positionsOf = (key: number): Positions => ({ a: Math.floor(key / TWINS_CELLS), b: key % TWINS_CELLS });

/**
 * Breadth-first search on the joint positions (at most 36 × 36). Returns the distance in moves of every joint
 * position from `start` (-1 when it cannot be reached) and the move that first reached it (index in DIRECTIONS).
 */
function explore(walls: readonly number[], start: Positions): { dist: Int16Array; via: Int8Array; from: Int16Array } {
  const blocked = wallMap(walls);
  const dist = new Int16Array(TWINS_CELLS * TWINS_CELLS).fill(-1);
  const via = new Int8Array(TWINS_CELLS * TWINS_CELLS).fill(-1);
  const from = new Int16Array(TWINS_CELLS * TWINS_CELLS).fill(-1);
  const queue = [keyOf(start)];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    const at = positionsOf(key);
    for (let d = 0; d < DIRECTIONS.length; d++) {
      const next = stepCell(blocked, at.a, DIRECTIONS[d]) * TWINS_CELLS + stepCell(blocked, at.b, DIRECTIONS[d]);
      if (dist[next] >= 0) continue;
      dist[next] = dist[key] + 1;
      via[next] = d;
      from[next] = key;
      queue.push(next);
    }
  }
  return { dist, via, from };
}

/** A shortest list of moves from `positions` to the exits ([] when already there), or null when there is none. */
export function solve(puzzle: TwinsPuzzle, positions: Positions): Direction[] | null {
  const { dist, via, from } = explore(puzzle.walls, positions);
  let key = keyOf(puzzle.exits);
  if (dist[key] < 0) return null;
  const path: Direction[] = [];
  while (via[key] >= 0) {
    path.push(DIRECTIONS[via[key]]);
    key = from[key];
  }
  return path.reverse();
}

/** Direction of the next move of a shortest solution, or null when solved or when the exits are out of reach. */
export function nextMove(puzzle: TwinsPuzzle, positions: Positions): Direction | null {
  const path = solve(puzzle, positions);
  return path && path.length > 0 ? path[0] : null;
}

export type Generated = { board: TwinsPuzzle; start: Positions; par: number; attempts: number; fallback: boolean; rngState: number };

/**
 * The fixed puzzle used when no seeded board has a pair of exits in range: 7 walls, par 9 (inside the range of every
 * puzzle number: [5, 9] for puzzle 1 up to [9, 17] for puzzle 5).
 *
 *     . . . . . .      A, B: starts      a, b: exits      #: wall
 *     . . b . . .
 *     . . . a A .      up, right, right, right, left, down, down, up, left
 *     . B # # . .
 *     . . # . # .
 *     . # . # # .
 */
export const FALLBACK_PAR = 9;
export const FALLBACK: { board: TwinsPuzzle; start: Positions } = {
  board: { walls: [20, 21, 26, 28, 31, 33, 34], exits: { a: 15, b: 8 } },
  start: { a: 16, b: 19 },
};

const ALL_CELLS: readonly number[] = Array.from({ length: TWINS_CELLS }, (_, i) => i);

/**
 * Puzzle k: 6 + k seeded walls, two seeded starts on different free cells, then the exits are the furthest joint
 * positions on two different cells whose distance from the starts is in [4 + k, 7 + 2k] (a seeded pick among the
 * joint positions at that distance). A board without such a pair is dropped; after 30 boards, the fixed fallback.
 */
export function generatePuzzle(rngState: number, puzzle: number): Generated {
  return generateBoard(rngState, wallCount(puzzle), parRange(puzzle));
}

/** The generator of `generatePuzzle` for any wall count (≤ 34) and par range (tests reach the fallback). */
export function generateBoard(rngState: number, wallCells: number, [lo, hi]: [number, number]): Generated {
  const rng = createRng(rngState);
  for (let attempt = 1; attempt <= GEN_ATTEMPTS; attempt++) {
    const cells = rng.shuffle(ALL_CELLS);
    const walls = cells.slice(0, wallCells).sort((x, y) => x - y);
    const start = { a: cells[wallCells], b: cells[wallCells + 1] };
    const { dist } = explore(walls, start);
    let par = -1;
    let furthest: number[] = [];
    for (let key = 0; key < dist.length; key++) {
      const d = dist[key];
      if (d < lo || d > hi || d < par) continue;
      const at = positionsOf(key);
      if (at.a === at.b) continue;
      if (d > par) furthest = [];
      par = d;
      furthest.push(key);
    }
    if (furthest.length === 0) continue;
    const exits = positionsOf(rng.pick(furthest));
    return { board: { walls, exits }, start, par, attempts: attempt, fallback: false, rngState: rng.state() };
  }
  return { board: FALLBACK.board, start: FALLBACK.start, par: FALLBACK_PAR, attempts: GEN_ATTEMPTS, fallback: true, rngState: rng.state() };
}

type Carry = Pick<TwinsState, 'score' | 'combos' | 'status' | 'hintsLeft' | 'rngState'>;

function startPuzzle(carry: Carry, puzzle: number): TwinsState {
  const generated = generatePuzzle(carry.rngState, puzzle);
  return {
    ...carry,
    events: [],
    puzzle,
    board: generated.board,
    positions: generated.start,
    par: generated.par,
    moves: 0,
    hint: null,
    slideMs: 0,
    result: null,
    shownMs: 0,
    rngState: generated.rngState,
  };
}

export function createTwins(seed: number, upgrades: UpgradeLevels = {}): TwinsState {
  return startPuzzle({ score: 0, combos: 0, status: 'playing', hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** True when a move would be taken now (no animation running, no finished puzzle shown). */
export function acceptsInput(state: TwinsState): boolean {
  return state.status === 'playing' && state.slideMs <= 0 && state.result === null;
}

export function reduceTwins(state: TwinsState, action: TwinsAction): TwinsState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    if (!(action.dt > 0) || (state.slideMs <= 0 && state.result === null)) return state;
    const slideMs = Math.max(0, state.slideMs - action.dt);
    if (state.result === null) return { ...state, slideMs, events: [] };
    const shownMs = Math.max(0, state.shownMs - action.dt);
    if (shownMs > 0) return { ...state, slideMs, shownMs, events: [] };
    // The finished puzzle has been shown: the round ends after the 5th one, else the next puzzle starts.
    if (state.puzzle >= TWINS_PUZZLES) return { ...state, slideMs: 0, shownMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
    const next = startPuzzle({ score: state.score, combos: state.combos, status: 'playing', hintsLeft: state.hintsLeft, rngState: state.rngState }, state.puzzle + 1);
    return { ...next, events: [{ kind: 'puzzle', puzzle: next.puzzle }] };
  }

  if (action.type === 'hint') {
    // Refused when none is left, one is already shown (a second one would point the same way) or the puzzle is over.
    if (state.hintsLeft <= 0 || state.hint !== null || state.result !== null) return { ...state, events: [] };
    const direction = nextMove(state.board, state.positions);
    if (!direction) return { ...state, events: [] };
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: direction, events: [{ kind: 'hint', direction }] };
  }

  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };
  const { direction } = action;
  const positions = step(state.board, state.positions, direction);
  const a = positions.a !== state.positions.a;
  const b = positions.b !== state.positions.b;
  if (!a && !b) return { ...state, events: [{ kind: 'blocked', direction }] };

  const moves = state.moves + 1;
  const events: TwinsState['events'][number][] = [{ kind: 'move', direction, a, b }];
  const solved = isSolved(state.board, positions);
  // A dead end: no list of moves brings both characters to their exits any more.
  const deadEnd = !solved && solve(state.board, positions) === null;
  if (!solved && !deadEnd && moves < state.par + TWINS_FAIL_AFTER) {
    // A shown hint is spent by any move (the next one would need a new search).
    return { ...state, positions, moves, hint: null, slideMs: TWINS_MOVE_MS, events };
  }

  let score = state.score;
  let combos = state.combos;
  if (solved) {
    const points = puzzleScore(moves, state.par);
    score += points;
    events.push({ kind: 'solved', puzzle: state.puzzle, moves, par: state.par, points }, { kind: 'score', points });
    if (moves <= state.par) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
  } else {
    events.push({ kind: 'failed', puzzle: state.puzzle, reason: deadEnd ? 'dead_end' : 'moves' });
  }
  // The finished puzzle stays on the grid; the tick that ends its 800 ms brings the next one or ends the round.
  return { ...state, positions, moves, hint: null, score, combos, slideMs: TWINS_MOVE_MS, result: solved ? 'solved' : 'failed', shownMs: TWINS_SHOW_MS, events };
}
