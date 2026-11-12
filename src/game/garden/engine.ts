// Potager Fou: a match-3 on a 7 x 8 board of vegetables (docs/PRD.md "Potager Fou", AC-22..AC-25). Pure reducer on
// an immutable state, see src/game/contract.ts. The board is indexed `board[row][col]` with row 0 at the top:
// removed pieces let the ones above fall and new pieces enter from the top. Every random draw goes through the
// seeded rng; its state travels in the game state so that the same seed and actions always give the same states.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng, type Rng } from '../rng';

export const GARDEN_COLS = 7;
export const GARDEN_ROWS = 8;
export const BASE_MOVES = 20;
/** The 6th type (onion) joins the refill pool from this valid move, counted from 1. */
export const ONION_FROM_MOVE = 11;

export type Veg = 'carrot' | 'tomato' | 'eggplant' | 'corn' | 'broccoli' | 'onion';
export const ALL_VEGS: readonly Veg[] = ['carrot', 'tomato', 'eggplant', 'corn', 'broccoli', 'onion'];
/** The five types of the initial board and of the refill before the 11th move. */
export const BASE_VEGS: readonly Veg[] = ALL_VEGS.slice(0, 5);

export type Cell = { col: number; row: number };
export type Board = readonly (readonly Veg[])[];
/** One maximal horizontal or vertical run of 3+ identical pieces and its base points (100 / 200 / 400). */
export type Line = { cells: readonly Cell[]; points: number };
export type Move = { from: Cell; to: Cell };

export type GardenEvent =
  | { kind: 'swap'; from: Cell; to: Cell }
  | { kind: 'swap_back'; from: Cell; to: Cell }
  /**
   * One cascade step: the lines found, the union of their cells (removed), the multiplied points and the board in
   * which the lines are visible (the screen replays the step from it, AC-51).
   */
  | { kind: 'match'; step: number; lines: readonly Line[]; cells: readonly Cell[]; points: number; board: Board }
  | { kind: 'cascade'; step: number }
  | { kind: 'shuffle' };

export type GardenState = RoundState<GardenEvent> & {
  board: Board;
  movesLeft: number;
  /** Valid moves consumed so far. */
  movesUsed: number;
  /** « Récolte en cascade » level: the cascade multiplier is 1 + (k - 1) * (1 + 0.5 * level). */
  cascadeLevel: number;
  rngState: number;
};

export type GardenAction = { type: 'swap'; from: Cell; to: Cell };

// --- Board queries ---------------------------------------------------------------------------------------------

export function linePoints(length: number): number {
  return length >= 5 ? 400 : length === 4 ? 200 : 100;
}

function scanRuns(board: Board, horizontal: boolean): Line[] {
  const outer = horizontal ? GARDEN_ROWS : GARDEN_COLS;
  const inner = horizontal ? GARDEN_COLS : GARDEN_ROWS;
  const at = (o: number, i: number): Veg => (horizontal ? board[o][i] : board[i][o]);
  const cell = (o: number, i: number): Cell => (horizontal ? { col: i, row: o } : { col: o, row: i });
  const lines: Line[] = [];
  for (let o = 0; o < outer; o++) {
    let start = 0;
    for (let i = 1; i <= inner; i++) {
      if (i < inner && at(o, i) === at(o, start)) continue;
      const length = i - start;
      if (length >= 3) {
        const cells: Cell[] = [];
        for (let j = start; j < i; j++) cells.push(cell(o, j));
        lines.push({ cells, points: linePoints(length) });
      }
      start = i;
    }
  }
  return lines;
}

/** Every maximal run of 3+ identical pieces; an L or T yields one horizontal and one vertical line. */
export function findLines(board: Board): readonly Line[] {
  return [...scanRuns(board, true), ...scanRuns(board, false)];
}

export function hasLine(board: Board): boolean {
  return findLines(board).length > 0;
}

function inBounds(c: Cell): boolean {
  return Number.isInteger(c.col) && Number.isInteger(c.row) && c.col >= 0 && c.col < GARDEN_COLS && c.row >= 0 && c.row < GARDEN_ROWS;
}

function areNeighbours(a: Cell, b: Cell): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

function swapCells(board: Board, a: Cell, b: Cell): Board {
  const next = board.map((row) => row.slice());
  next[a.row][a.col] = board[b.row][b.col];
  next[b.row][b.col] = board[a.row][a.col];
  return next;
}

/** Every swap of orthogonal neighbours that creates a line (each pair once: `to` is right of or below `from`). */
export function findValidMoves(board: Board): readonly Move[] {
  const moves: Move[] = [];
  for (let row = 0; row < GARDEN_ROWS; row++) {
    for (let col = 0; col < GARDEN_COLS; col++) {
      const from = { col, row };
      for (const to of [{ col: col + 1, row }, { col, row: row + 1 }]) {
        if (inBounds(to) && board[to.row][to.col] !== board[row][col] && hasLine(swapCells(board, from, to))) {
          moves.push({ from, to });
        }
      }
    }
  }
  return moves;
}

// --- Board construction ------------------------------------------------------------------------------------------

/** Fills the board piece by piece, never completing a line of 3 with the two pieces on the left or above. */
function fillWithoutLines(rng: Rng, pool: readonly Veg[]): Veg[][] {
  const board: Veg[][] = [];
  for (let row = 0; row < GARDEN_ROWS; row++) {
    const line: Veg[] = [];
    for (let col = 0; col < GARDEN_COLS; col++) {
      const candidates = pool.filter(
        (veg) =>
          !(col >= 2 && line[col - 1] === veg && line[col - 2] === veg) &&
          !(row >= 2 && board[row - 1][col] === veg && board[row - 2][col] === veg),
      );
      line.push(rng.pick(candidates));
    }
    board.push(line);
  }
  return board;
}

/** A board with no line of 3 and at least one valid move. */
function generateBoard(rng: Rng, pool: readonly Veg[]): Board {
  for (;;) {
    const board = fillWithoutLines(rng, pool);
    if (findValidMoves(board).length > 0) return board;
  }
}

/** Lays the given pieces out again without completing a line; null when the bag runs into a dead end. */
function layOutWithoutLines(rng: Rng, pieces: readonly Veg[]): Veg[][] | null {
  const bag = new Map<Veg, number>();
  for (const veg of pieces) bag.set(veg, (bag.get(veg) ?? 0) + 1);
  const board: Veg[][] = [];
  for (let row = 0; row < GARDEN_ROWS; row++) {
    const line: Veg[] = [];
    for (let col = 0; col < GARDEN_COLS; col++) {
      // Each remaining piece is a candidate (types with many pieces left come up more often, so the bag empties evenly).
      const candidates: Veg[] = [];
      for (const [veg, count] of bag) {
        const lineLeft = col >= 2 && line[col - 1] === veg && line[col - 2] === veg;
        const lineAbove = row >= 2 && board[row - 1][col] === veg && board[row - 2][col] === veg;
        if (!lineLeft && !lineAbove) for (let i = 0; i < count; i++) candidates.push(veg);
      }
      if (candidates.length === 0) return null;
      const veg = rng.pick(candidates);
      bag.set(veg, (bag.get(veg) ?? 1) - 1);
      line.push(veg);
    }
    board.push(line);
  }
  return board;
}

/** Permutes the current pieces into a board with no line and a valid move; draws a fresh board after too many tries. */
function shuffleBoard(rng: Rng, board: Board, pool: readonly Veg[]): Board {
  const pieces = board.flat();
  for (let attempt = 0; attempt < 50; attempt++) {
    const next = layOutWithoutLines(rng, pieces);
    if (next && findValidMoves(next).length > 0) return next;
  }
  return generateBoard(rng, pool);
}

const key = (c: Cell): number => c.row * GARDEN_COLS + c.col;

function uniqueCells(lines: readonly Line[]): Cell[] {
  const seen = new Set<number>();
  const cells: Cell[] = [];
  for (const line of lines) {
    for (const cell of line.cells) {
      if (!seen.has(key(cell))) {
        seen.add(key(cell));
        cells.push(cell);
      }
    }
  }
  return cells;
}

/** Removes the cells, lets the pieces above fall and refills from the top (column by column, top to bottom). */
function collapse(board: Board, removed: readonly Cell[], rng: Rng, pool: readonly Veg[]): Board {
  const gone = new Set(removed.map(key));
  const columns: Veg[][] = [];
  for (let col = 0; col < GARDEN_COLS; col++) {
    const kept: Veg[] = [];
    for (let row = 0; row < GARDEN_ROWS; row++) if (!gone.has(key({ col, row }))) kept.push(board[row][col]);
    const fresh: Veg[] = [];
    for (let i = kept.length; i < GARDEN_ROWS; i++) fresh.push(rng.pick(pool));
    columns.push([...fresh, ...kept]);
  }
  return Array.from({ length: GARDEN_ROWS }, (_, row) => columns.map((column) => column[row]));
}

// --- Engine ---------------------------------------------------------------------------------------------------------

export function createGarden(seed: number, upgrades: UpgradeLevels = {}): GardenState {
  const rng = createRng(seed);
  const board = generateBoard(rng, BASE_VEGS);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    board,
    movesLeft: BASE_MOVES + (upgrades.extra_move ?? 0),
    movesUsed: 0,
    cascadeLevel: upgrades.cascade ?? 0,
    rngState: rng.state(),
  };
}

/** Replaces the board (tests craft exact situations with it); events are cleared. */
export function withBoard(state: GardenState, board: Board): GardenState {
  return { ...state, board: board.map((row) => row.slice()), events: [] };
}

export function movesLeft(state: GardenState): number {
  return state.movesLeft;
}

function refillPool(movesUsed: number): readonly Veg[] {
  return movesUsed >= ONION_FROM_MOVE ? ALL_VEGS : BASE_VEGS;
}

export function reduceGarden(state: GardenState, action: GardenAction): GardenState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };
  const { from, to } = action;
  if (!inBounds(from) || !inBounds(to) || !areNeighbours(from, to)) return { ...state, events: [] };

  // A dead board never reaches the player in normal play (createGarden and every swap guarantee a valid move);
  // the guard keeps the reducer total for states built by hand: the board is shuffled and the swap is dropped.
  if (findValidMoves(state.board).length === 0) {
    const rng = createRng(state.rngState);
    const board = shuffleBoard(rng, state.board, refillPool(state.movesUsed));
    return { ...state, board, rngState: rng.state(), events: [{ kind: 'shuffle' }] };
  }

  let board = swapCells(state.board, from, to);
  if (!hasLine(board)) return { ...state, events: [{ kind: 'swap_back', from, to }] };

  const movesUsed = state.movesUsed + 1;
  const movesLeftAfter = state.movesLeft - 1;
  const pool = refillPool(movesUsed);
  const m = 1 + 0.5 * state.cascadeLevel;
  const rng = createRng(state.rngState);
  const events: GardenState['events'][number][] = [{ kind: 'swap', from, to }];
  let score = state.score;
  let combos = state.combos;
  let step = 0;
  for (let lines = findLines(board); lines.length > 0; lines = findLines(board)) {
    step += 1;
    const cells = uniqueCells(lines);
    const points = lines.reduce((sum, line) => sum + line.points, 0) * (1 + (step - 1) * m);
    events.push({ kind: 'match', step, lines, cells, points, board });
    if (step >= 2) {
      combos += 1;
      events.push({ kind: 'cascade', step }, { kind: 'combo' });
    }
    events.push({ kind: 'score', points });
    score += points;
    board = collapse(board, cells, rng, pool);
  }

  let status: GardenState['status'] = 'playing';
  if (movesLeftAfter <= 0) {
    status = 'over';
    events.push({ kind: 'over', score });
  } else if (findValidMoves(board).length === 0) {
    board = shuffleBoard(rng, board, pool);
    events.push({ kind: 'shuffle' });
  }
  return { ...state, board, score, combos, status, events, movesLeft: movesLeftAfter, movesUsed, rngState: rng.state() };
}
