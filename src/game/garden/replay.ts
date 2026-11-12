// Replay plan of a Potager Fou swap (AC-51): the pure list of phases the screen animates after the engine has
// settled a swap. Built from the board before the swap and the events of the swap only, so Jest proves it.
import { Board, Cell, GARDEN_COLS, GARDEN_ROWS, GardenState } from './engine';

export const SWAP_MS = 160;
export const FLASH_MS = 300;
export const POP_MS = 140;
export const FALL_MS = 240;

export type Phase =
  /** The two pieces of `board` slide into each other's place. */
  | { kind: 'swap'; board: Board; from: Cell; to: Cell; ms: number }
  /** A refused swap: `board` already holds the swapped pieces, they slide back. */
  | { kind: 'swap_back'; board: Board; from: Cell; to: Cell; ms: number }
  /** The aligned cells are framed and flash; `points` pop above them. */
  | { kind: 'flash'; board: Board; cells: readonly Cell[]; points: number; ms: number }
  /** The aligned cells shrink away. */
  | { kind: 'pop'; board: Board; cells: readonly Cell[]; ms: number }
  /** `board` is the collapsed board; `fallen[row][col]` = rows the piece travelled down (new pieces enter from above). */
  | { kind: 'fall'; board: Board; fallen: readonly (readonly number[])[]; ms: number };

export function swapCells(board: Board, a: Cell, b: Cell): Board {
  const next = board.map((row) => row.slice());
  const tmp = next[a.row][a.col];
  next[a.row][a.col] = next[b.row][b.col];
  next[b.row][b.col] = tmp;
  return next;
}

/**
 * Rows travelled by every piece of the collapsed board: survivors of a column keep their order and slide down by
 * the number of removed cells below them; the new pieces on top all enter from above the board.
 */
export function fallDistances(before: Board, removed: readonly Cell[]): number[][] {
  const gone = new Set(removed.map((c) => c.row * GARDEN_COLS + c.col));
  const fallen = Array.from({ length: GARDEN_ROWS }, () => Array<number>(GARDEN_COLS).fill(0));
  for (let col = 0; col < GARDEN_COLS; col++) {
    const survivors: number[] = [];
    for (let row = 0; row < GARDEN_ROWS; row++) if (!gone.has(row * GARDEN_COLS + col)) survivors.push(row);
    const fresh = GARDEN_ROWS - survivors.length;
    for (let row = 0; row < GARDEN_ROWS; row++) fallen[row][col] = row < fresh ? fresh : row - survivors[row - fresh];
  }
  return fallen;
}

/** The phases to animate between the board before the swap and the settled `next` state. Empty when nothing moved. */
export function buildReplay(before: Board, next: GardenState): Phase[] {
  const phases: Phase[] = [];
  const back = next.events.find((e) => e.kind === 'swap_back');
  if (back && back.kind === 'swap_back') {
    phases.push({ kind: 'swap', board: before, from: back.from, to: back.to, ms: SWAP_MS });
    phases.push({ kind: 'swap_back', board: swapCells(before, back.from, back.to), from: back.from, to: back.to, ms: SWAP_MS });
    return phases;
  }
  const swap = next.events.find((e) => e.kind === 'swap');
  if (!swap || swap.kind !== 'swap') return phases;
  phases.push({ kind: 'swap', board: before, from: swap.from, to: swap.to, ms: SWAP_MS });
  const matches = next.events.filter((e) => e.kind === 'match');
  const shuffled = next.events.some((e) => e.kind === 'shuffle');
  matches.forEach((m, i) => {
    if (m.kind !== 'match') return;
    phases.push({ kind: 'flash', board: m.board, cells: m.cells, points: m.points, ms: FLASH_MS });
    phases.push({ kind: 'pop', board: m.board, cells: m.cells, ms: POP_MS });
    const following = matches[i + 1];
    // The collapsed board of the last step is the final board, unless a shuffle replaced it (then it just appears).
    const after = following && following.kind === 'match' ? following.board : shuffled ? null : next.board;
    if (after) phases.push({ kind: 'fall', board: after, fallen: fallDistances(m.board, m.cells), ms: FALL_MS });
  });
  return phases;
}

export function replayDuration(phases: readonly Phase[]): number {
  return phases.reduce((sum, p) => sum + p.ms, 0);
}
