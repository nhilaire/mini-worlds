// Replay plan of a Bulles en Folie shot (AC-54): the pure list of phases the screen animates after the engine has
// settled a shot. Built from the board before the shot and the events of the shot only, so Jest proves it.
import { BubbleBoard, BubbleState, Cell, Colour, Point, Shift } from './engine';

/** Flight speed of the shot bubble, in bubble units per second. */
export const FLY_UNITS_PER_S = 22;
export const FLY_MIN_MS = 120;
export const FLASH_MS = 250;
export const POP_MS = 120;
export const FALL_MS = 320;
export const PUSH_MS = 180;

export type Phase =
  /** The shot bubble travels along `path` (launcher first) over `board` (before the landing). */
  | { kind: 'fly'; board: BubbleBoard; shift: Shift; colour: Colour; path: readonly Point[]; ms: number }
  /** The popped group glows and pulses; `points` pop above it. */
  | { kind: 'flash'; board: BubbleBoard; shift: Shift; cells: readonly Cell[]; points: number; ms: number }
  /** The popped group shrinks away. */
  | { kind: 'pop'; board: BubbleBoard; shift: Shift; cells: readonly Cell[]; ms: number }
  /** `board` no longer holds the dropped cells; they fall out of the field with their `points`. */
  | { kind: 'fall'; board: BubbleBoard; shift: Shift; cells: readonly Cell[]; colours: readonly Colour[]; points: number; ms: number }
  /** A row was pushed: `board` (the settled board) slides down from one row above. */
  | { kind: 'push'; board: BubbleBoard; shift: Shift; ms: number };

export function withCell(board: BubbleBoard, cell: Cell, colour: Colour | null): BubbleBoard {
  return board.map((cells, row) => (row === cell.row ? cells.map((c, col) => (col === cell.col ? colour : c)) : cells));
}

export function removeCells(board: BubbleBoard, cells: readonly Cell[]): BubbleBoard {
  const gone = new Set(cells.map((c) => `${c.col},${c.row}`));
  return board.map((row, r) => row.map((c, col) => (gone.has(`${col},${r}`) ? null : c)));
}

export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return total;
}

/** The point at `progress` (0..1) of the way along the polyline. */
export function pointAlong(path: readonly Point[], progress: number): Point {
  const total = pathLength(path);
  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= len || i === path.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, remaining / len);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return path[0];
}

/** The phases to animate between the board before the shot and the settled `next` state. Empty when no shot. */
export function buildReplay(before: BubbleBoard, shift: Shift, next: BubbleState): Phase[] {
  const phases: Phase[] = [];
  const shot = next.events.find((e) => e.kind === 'shot');
  if (!shot || shot.kind !== 'shot') return phases;
  phases.push({ kind: 'fly', board: before, shift, colour: shot.colour, path: shot.path, ms: Math.max(FLY_MIN_MS, Math.round((pathLength(shot.path) / FLY_UNITS_PER_S) * 1000)) });
  let board = shot.landing ? withCell(before, shot.landing, shot.colour) : before;
  const pop = next.events.find((e) => e.kind === 'pop');
  if (pop && pop.kind === 'pop') {
    phases.push({ kind: 'flash', board, shift, cells: pop.cells, points: pop.points, ms: FLASH_MS });
    phases.push({ kind: 'pop', board, shift, cells: pop.cells, ms: POP_MS });
    board = removeCells(board, pop.cells);
    const drop = next.events.find((e) => e.kind === 'drop');
    if (drop && drop.kind === 'drop') {
      const colours = drop.cells.map((c) => board[c.row][c.col] ?? 'red');
      board = removeCells(board, drop.cells);
      phases.push({ kind: 'fall', board, shift, cells: drop.cells, colours, points: drop.points, ms: FALL_MS });
    }
  }
  if (next.events.some((e) => e.kind === 'push')) phases.push({ kind: 'push', board: next.board, shift: next.shift, ms: PUSH_MS });
  return phases;
}

export function replayDuration(phases: readonly Phase[]): number {
  return phases.reduce((sum, p) => sum + p.ms, 0);
}
