// Raz-de-Couleurs: a flood-it on a 10 x 10 grid of the five bubble colours (docs/PRD.md "Raz-de-Couleurs", AC-63).
// Pure reducer on an immutable state, see src/game/contract.ts. The board is indexed `board[row][col]`, row 0 at the
// top. The tide is the region of the top-left cell's colour connected to it (4 neighbours). A colour tap (not the
// tide's colour) recolours the tide, which then absorbs every connected cell of that colour. Each tap costs a move,
// even one that absorbs nothing. Every random draw goes through the seeded rng, whose state travels in the game state.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng, type Rng } from '../rng';

export const FLOOD_SIZE = 10;
export const FLOOD_CELLS = FLOOD_SIZE * FLOOD_SIZE;
export const BASE_MOVES = 20;
export const MIN_MOVES = 12;
/** A won board scores CLEAR_POINTS + MOVE_POINTS per move left. */
export const CLEAR_POINTS = 500;
export const MOVE_POINTS = 100;
/** A board whose moves run out scores this many points per cell of the tide, and the round is over. */
export const TIDE_CELL_POINTS = 3;
/** Combo (challenges): a board won with this many moves left or more. */
export const COMBO_MOVES_LEFT = 3;

export type FloodColour = 'red' | 'yellow' | 'green' | 'blue' | 'purple';
export const FLOOD_COLOURS: readonly FloodColour[] = ['red', 'yellow', 'green', 'blue', 'purple'];

export type Cell = { col: number; row: number };
export type Board = readonly (readonly FloodColour[])[];

export type FloodEvent =
  /** A valid colour tap: the cells newly absorbed by the tide (possibly none). */
  | { kind: 'flood'; colour: FloodColour; absorbed: readonly Cell[] }
  /** A tap on the tide's own colour (or any tap once the round is over): nothing changes. */
  | { kind: 'refused' }
  /** The board was filled with one colour: its points; the next board is already in the state. */
  | { kind: 'board_won'; board: number; movesLeft: number; points: number }
  /** The moves ran out: the tide's points; the round is over. */
  | { kind: 'board_lost'; board: number; tide: number; points: number };

export type FloodState = RoundState<FloodEvent> & {
  board: Board;
  /** Board number, from 1. */
  boardNumber: number;
  movesLeft: number;
  /** « Coup en plus » level: + 1 move per board per level. */
  moreMovesLevel: number;
  rngState: number;
};

export type FloodAction = { type: 'colour'; colour: FloodColour };

// --- Rules -------------------------------------------------------------------------------------------------------

/** Moves of board n (from 1): 20 − (n − 1), at least 12, + 1 per « Coup en plus » level. */
export function movesForBoard(n: number, moreMovesLevel: number): number {
  return Math.max(MIN_MOVES, BASE_MOVES - (n - 1)) + moreMovesLevel;
}

export function tideColour(board: Board): FloodColour {
  return board[0][0];
}

/** The tide: every cell of the top-left cell's colour connected to it (orthogonal neighbours), in BFS order. */
export function tideCells(board: Board): Cell[] {
  const colour = tideColour(board);
  const seen = new Set<number>([0]);
  const queue: Cell[] = [{ col: 0, row: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const { col, row } = queue[i];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= FLOOD_SIZE || r >= FLOOD_SIZE) continue;
      const key = r * FLOOD_SIZE + c;
      if (seen.has(key) || board[r][c] !== colour) continue;
      seen.add(key);
      queue.push({ col: c, row: r });
    }
  }
  return queue;
}

export function isFilled(board: Board): boolean {
  const colour = tideColour(board);
  return board.every((row) => row.every((c) => c === colour));
}

/** The tide recoloured to `colour` (the board after the tap, before counting the absorbed cells). */
export function recolourTide(board: Board, colour: FloodColour): Board {
  const next = board.map((row) => row.slice());
  for (const { col, row } of tideCells(board)) next[row][col] = colour;
  return next;
}

// --- Construction ------------------------------------------------------------------------------------------------

function generateBoard(rng: Rng): Board {
  for (;;) {
    const board: FloodColour[][] = [];
    for (let row = 0; row < FLOOD_SIZE; row++) {
      const line: FloodColour[] = [];
      for (let col = 0; col < FLOOD_SIZE; col++) line.push(rng.pick(FLOOD_COLOURS));
      board.push(line);
    }
    if (!isFilled(board)) return board; // a board never starts already won
  }
}

export function createFlood(seed: number, upgrades: UpgradeLevels = {}): FloodState {
  const rng = createRng(seed);
  const moreMovesLevel = upgrades.more_moves ?? 0;
  const board = generateBoard(rng);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    board,
    boardNumber: 1,
    movesLeft: movesForBoard(1, moreMovesLevel),
    moreMovesLevel,
    rngState: rng.state(),
  };
}

/** Test helper: the same state with a hand-made board (moves and board number unchanged). */
export function withBoard(state: FloodState, board: Board): FloodState {
  return { ...state, board, events: [] };
}

// --- Reducer -----------------------------------------------------------------------------------------------------

export function reduceFlood(state: FloodState, action: FloodAction): FloodState {
  if (state.status !== 'playing' || action.type !== 'colour' || !FLOOD_COLOURS.includes(action.colour) || action.colour === tideColour(state.board)) {
    return { ...state, events: [{ kind: 'refused' }] };
  }
  const before = new Set(tideCells(state.board).map((c) => c.row * FLOOD_SIZE + c.col));
  const board = recolourTide(state.board, action.colour);
  const tide = tideCells(board);
  const absorbed = tide.filter((c) => !before.has(c.row * FLOOD_SIZE + c.col));
  const movesLeft = state.movesLeft - 1;
  const events: FloodState['events'][number][] = [{ kind: 'flood', colour: action.colour, absorbed }];

  if (tide.length === FLOOD_CELLS) {
    const points = CLEAR_POINTS + MOVE_POINTS * movesLeft;
    const score = state.score + points;
    const combo = movesLeft >= COMBO_MOVES_LEFT;
    events.push({ kind: 'board_won', board: state.boardNumber, movesLeft, points }, { kind: 'score', points });
    if (combo) events.push({ kind: 'combo' });
    const rng = createRng(state.rngState);
    const boardNumber = state.boardNumber + 1;
    return {
      ...state,
      score,
      combos: state.combos + (combo ? 1 : 0),
      events,
      board: generateBoard(rng),
      boardNumber,
      movesLeft: movesForBoard(boardNumber, state.moreMovesLevel),
      rngState: rng.state(),
    };
  }

  if (movesLeft <= 0) {
    const points = TIDE_CELL_POINTS * tide.length;
    const score = state.score + points;
    events.push({ kind: 'board_lost', board: state.boardNumber, tide: tide.length, points }, { kind: 'score', points }, { kind: 'over', score });
    return { ...state, score, status: 'over', events, board, movesLeft: 0 };
  }

  return { ...state, events, board, movesLeft };
}
