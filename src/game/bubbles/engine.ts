// « Bulles en Folie » (bubble shooter) engine: a pure reducer over an immutable state (docs/PRD.md, section
// "Bulles en Folie"). No React, no timers, no Date: randomness goes through the seeded rng whose state is kept in
// the round state, so the same seed and the same actions always give the same states (AC-16).
//
// Geometry, in bubble units (diameter = 1): 9 columns, hexagonal packing. A "shifted" row holds 8 cells moved
// right by half a cell. Without any pushed row, odd rows are shifted; every row push flips the parity (`shift`),
// so that each row keeps its horizontal position while moving down one row. Row r has its centre at
// y = 0.5 + r × ROW_HEIGHT; the walls are at x = 0 and x = 9; the launcher sits centred just under row 11.

import type { BaseEvent, RoundState } from '../contract';
import { createRng } from '../rng';

export const BUBBLE_COLS = 9;
export const BUBBLE_ROWS = 12;
export const ROW_HEIGHT = Math.sqrt(3) / 2;
export const INITIAL_ROWS = 5;
export const QUEUE_LENGTH = 3;
export const POP_POINTS = 10;
export const DROP_POINTS = 20;
export const REFILL_BONUS = 500;
export const MIN_ANGLE = 10;
export const COLOURS = ['red', 'yellow', 'green', 'blue', 'purple'] as const;

export type Colour = (typeof COLOURS)[number];
export type Cell = { col: number; row: number };
export type Point = { x: number; y: number };
/** rows × cols; a cell that is not valid for its row's parity is always null. */
export type BubbleBoard = readonly (readonly (Colour | null)[])[];
export type Shift = 0 | 1;

export type BubbleEvent =
  | { kind: 'shot'; colour: Colour; path: readonly Point[]; landing: Cell | null; bounces: number }
  | { kind: 'pop'; cells: readonly Cell[]; points: number }
  | { kind: 'drop'; cells: readonly Cell[]; points: number }
  | { kind: 'push' }
  | { kind: 'refill'; bonus: typeof REFILL_BONUS }
  | { kind: 'too_flat' };

export type BubbleState = RoundState<BubbleEvent> & {
  board: BubbleBoard;
  /** Row parity: row r is shifted right by half a cell when (r + shift) is odd. Flips on every push. */
  shift: Shift;
  current: Colour;
  /** The colours to come, in order (the « Prochaine bulle » upgrade shows the first `next` ones). */
  queue: readonly Colour[];
  shotsFired: number;
  shotsSincePush: number;
  /** Shots left before the next row push (HUD). */
  shotsUntilPush: number;
  rngState: number;
  /** Upgrade levels: wall bounces shown by the aim guide, next bubbles shown. */
  aim: number;
  next: number;
};

export type BubbleAction = { type: 'shoot'; angle: number };

export type ShotResult = {
  /** Polyline from the launcher: one vertex per wall bounce, then the contact point (before snapping). */
  path: readonly Point[];
  landing: Cell | null;
  bounces: number;
};

export const LAUNCHER: Point = { x: BUBBLE_COLS / 2, y: 0.5 + BUBBLE_ROWS * ROW_HEIGHT };
const MIN_X = 0.5;
const MAX_X = BUBBLE_COLS - 0.5;
const MAX_SEGMENTS = 64;

// ---------------------------------------------------------------------------------------------------- geometry

export function isRowShifted(row: number, shift: Shift = 0): boolean {
  return (row + shift) % 2 === 1;
}

export function isCellValid(col: number, row: number, shift: Shift = 0): boolean {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (row < 0 || row >= BUBBLE_ROWS || col < 0) return false;
  return col < (isRowShifted(row, shift) ? BUBBLE_COLS - 1 : BUBBLE_COLS);
}

export function cellCenter(col: number, row: number, shift: Shift = 0): Point {
  return { x: col + 0.5 + (isRowShifted(row, shift) ? 0.5 : 0), y: 0.5 + row * ROW_HEIGHT };
}

/** The (up to six) valid cells around a cell. */
export function neighbours(col: number, row: number, shift: Shift = 0): Cell[] {
  const side = isRowShifted(row, shift) ? [col, col + 1] : [col - 1, col];
  const candidates: Cell[] = [
    { col: col - 1, row },
    { col: col + 1, row },
    { col: side[0], row: row - 1 },
    { col: side[1], row: row - 1 },
    { col: side[0], row: row + 1 },
    { col: side[1], row: row + 1 },
  ];
  return candidates.filter((c) => isCellValid(c.col, c.row, shift));
}

export function emptyBoard(): BubbleBoard {
  return Array.from({ length: BUBBLE_ROWS }, () => Array<Colour | null>(BUBBLE_COLS).fill(null));
}

function cellsOf(board: BubbleBoard): Cell[] {
  const out: Cell[] = [];
  board.forEach((cells, row) => cells.forEach((c, col) => c && out.push({ col, row })));
  return out;
}

function withCell(board: BubbleBoard, cell: Cell, colour: Colour | null): BubbleBoard {
  return board.map((cells, row) => (row === cell.row ? cells.map((c, col) => (col === cell.col ? colour : c)) : cells));
}

function coloursOnBoard(board: BubbleBoard): Colour[] {
  return COLOURS.filter((colour) => board.some((cells) => cells.includes(colour)));
}

// -------------------------------------------------------------------------------------------------- simulation

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestFree(board: BubbleBoard, shift: Shift, candidates: readonly Cell[], from: Point): Cell | null {
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (const cell of candidates) {
    if (!isCellValid(cell.col, cell.row, shift) || board[cell.row][cell.col] !== null) continue;
    const d = distance(cellCenter(cell.col, cell.row, shift), from);
    if (d < bestDistance) {
      bestDistance = d;
      best = cell;
    }
  }
  return best;
}

function allCells(shift: Shift): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < BUBBLE_ROWS; row++)
    for (let col = 0; col < BUBBLE_COLS; col++) if (isCellValid(col, row, shift)) out.push({ col, row });
  return out;
}

/**
 * Flies a bubble from the launcher along `angle` (degrees from the horizontal, 90 = straight up), bouncing on the
 * side walls, until it touches a bubble or the top; then snaps it to the nearest free cell adjacent to the touched
 * bubble (or the nearest free top-row cell). Exact ray geometry, so the result is deterministic. The screen uses
 * the path for the animation and, truncated after `aim` bounces, for the aim guide.
 */
export function simulateShot(board: BubbleBoard, angle: number, shift: Shift = 0): ShotResult {
  const rad = (angle * Math.PI) / 180;
  let dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  if (dy >= 0) return { path: [LAUNCHER], landing: null, bounces: 0 };
  const bubbles = cellsOf(board).map((cell) => ({ cell, centre: cellCenter(cell.col, cell.row, shift) }));
  const path: Point[] = [LAUNCHER];
  let p = LAUNCHER;
  let bounces = 0;
  let touched: Cell | null = null;
  for (let segment = 0; segment < MAX_SEGMENTS; segment++) {
    const tWall = dx > 1e-9 ? (MAX_X - p.x) / dx : dx < -1e-9 ? (MIN_X - p.x) / dx : Infinity;
    const tTop = (0.5 - p.y) / dy;
    let tHit = Infinity;
    let hit: Cell | null = null;
    for (const { cell, centre } of bubbles) {
      // Smallest t >= 0 with |p + t·d − centre| = 1 (d is a unit vector).
      const ox = p.x - centre.x;
      const oy = p.y - centre.y;
      const b = dx * ox + dy * oy;
      const c = ox * ox + oy * oy - 1;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = c <= 0 ? 0 : -b - Math.sqrt(disc);
      if (t >= 0 && t < tHit) {
        tHit = t;
        hit = cell;
      }
    }
    const t = Math.min(tWall, tTop, tHit);
    p = { x: p.x + dx * t, y: p.y + dy * t };
    path.push(p);
    if (t === tHit) {
      touched = hit;
      break;
    }
    if (t === tTop) break;
    dx = -dx;
    bounces++;
  }
  const candidates = touched
    ? neighbours(touched.col, touched.row, shift)
    : Array.from({ length: BUBBLE_COLS }, (_, col) => ({ col, row: 0 }));
  const landing = nearestFree(board, shift, candidates, p) ?? nearestFree(board, shift, allCells(shift), p);
  return { path, landing, bounces };
}

// -------------------------------------------------------------------------------------------------- resolution

function sameColourGroup(board: BubbleBoard, shift: Shift, start: Cell): Cell[] {
  const colour = board[start.row][start.col];
  const seen = new Set<string>([`${start.col},${start.row}`]);
  const group: Cell[] = [start];
  for (let i = 0; i < group.length; i++) {
    for (const n of neighbours(group[i].col, group[i].row, shift)) {
      const key = `${n.col},${n.row}`;
      if (!seen.has(key) && board[n.row][n.col] === colour) {
        seen.add(key);
        group.push(n);
      }
    }
  }
  return group;
}

/** Bubbles that are not connected (through other bubbles) to the top row. */
function disconnected(board: BubbleBoard, shift: Shift): Cell[] {
  const seen = new Set<string>();
  const queue: Cell[] = [];
  board[0].forEach((c, col) => {
    if (c) {
      seen.add(`${col},0`);
      queue.push({ col, row: 0 });
    }
  });
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbours(queue[i].col, queue[i].row, shift)) {
      const key = `${n.col},${n.row}`;
      if (!seen.has(key) && board[n.row][n.col] !== null) {
        seen.add(key);
        queue.push(n);
      }
    }
  }
  return cellsOf(board).filter((cell) => !seen.has(`${cell.col},${cell.row}`));
}

function removeCells(board: BubbleBoard, cells: readonly Cell[]): BubbleBoard {
  const gone = new Set(cells.map((c) => `${c.col},${c.row}`));
  return board.map((row, r) => row.map((c, col) => (gone.has(`${col},${r}`) ? null : c)));
}

/** Row push every 6 shots, every 5 from the 20th shot, every 4 from the 40th. */
export function pushInterval(shotsFired: number): number {
  return shotsFired >= 40 ? 4 : shotsFired >= 20 ? 5 : 6;
}

type Draw = { next(): number };

function randomRow(rng: Draw, row: number, shift: Shift): (Colour | null)[] {
  return Array.from({ length: BUBBLE_COLS }, (_, col) =>
    isCellValid(col, row, shift) ? COLOURS[Math.floor(rng.next() * COLOURS.length)] : null,
  );
}

function filledBoard(rng: Draw, shift: Shift): BubbleBoard {
  return emptyBoard().map((row, r) => (r < INITIAL_ROWS ? randomRow(rng, r, shift) : row));
}

function pushRow(board: BubbleBoard, shift: Shift, rng: Draw): { board: BubbleBoard; shift: Shift } {
  const newShift: Shift = shift === 0 ? 1 : 0;
  return { board: [randomRow(rng, 0, newShift), ...board.slice(0, BUBBLE_ROWS - 1)], shift: newShift };
}

function drawColour(rng: Draw, board: BubbleBoard): Colour {
  const present = coloursOnBoard(board);
  const pool = present.length > 0 ? present : COLOURS;
  return pool[Math.floor(rng.next() * pool.length)];
}

/** Queued colours that vanished from the board are redrawn among the colours still present. */
function refreshQueue(rng: Draw, board: BubbleBoard, queue: readonly Colour[]): Colour[] {
  const present = coloursOnBoard(board);
  return queue.map((colour) => (present.includes(colour) ? colour : drawColour(rng, board)));
}

function bottomRowOccupied(board: BubbleBoard): boolean {
  return board[BUBBLE_ROWS - 1].some((c) => c !== null);
}

// ------------------------------------------------------------------------------------------------------ engine

export function createBubbles(seed: number, upgrades: { aim?: number; next?: number } = {}): BubbleState {
  const rng = createRng(seed);
  const board = filledBoard(rng, 0);
  const current = drawColour(rng, board);
  const queue = Array.from({ length: QUEUE_LENGTH }, () => drawColour(rng, board));
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    board,
    shift: 0,
    current,
    queue,
    shotsFired: 0,
    shotsSincePush: 0,
    shotsUntilPush: pushInterval(0),
    rngState: rng.state(),
    aim: upgrades.aim ?? 0,
    next: upgrades.next ?? 0,
  };
}

export function reduceBubbles(state: BubbleState, action: BubbleAction): BubbleState {
  if (state.status !== 'playing' || action.type !== 'shoot') return { ...state, events: [] };
  if (!(action.angle >= MIN_ANGLE && action.angle <= 180 - MIN_ANGLE)) {
    return { ...state, events: [{ kind: 'too_flat' }] };
  }

  const events: (BubbleEvent | BaseEvent)[] = [];
  const rng = createRng(state.rngState);
  let { board, shift } = state;
  let points = 0;
  let combo = false;

  const shot = simulateShot(board, action.angle, shift);
  events.push({ kind: 'shot', colour: state.current, path: shot.path, landing: shot.landing, bounces: shot.bounces });
  if (shot.landing) {
    board = withCell(board, shot.landing, state.current);
    const group = sameColourGroup(board, shift, shot.landing);
    if (group.length >= 3) {
      board = removeCells(board, group);
      const popPoints = group.length * POP_POINTS;
      points += popPoints;
      events.push({ kind: 'pop', cells: group, points: popPoints });
      if (group.length >= 5) combo = true;
      const dropped = disconnected(board, shift);
      if (dropped.length > 0) {
        board = removeCells(board, dropped);
        const dropPoints = dropped.length * DROP_POINTS;
        points += dropPoints;
        events.push({ kind: 'drop', cells: dropped, points: dropPoints });
        combo = true;
      }
    }
  }
  if (cellsOf(board).length === 0) {
    board = filledBoard(rng, shift);
    points += REFILL_BONUS;
    events.push({ kind: 'refill', bonus: REFILL_BONUS });
  }

  // Pressure: the push happens after the shot is resolved.
  const shotsFired = state.shotsFired + 1;
  let shotsSincePush = state.shotsSincePush + 1;
  if (shotsSincePush >= pushInterval(shotsFired)) {
    ({ board, shift } = pushRow(board, shift, rng));
    shotsSincePush = 0;
    events.push({ kind: 'push' });
  }

  // Next colours: the queue advances by one; colours no longer on the board are redrawn among those present.
  const [current, ...queue] = refreshQueue(rng, board, [...state.queue, drawColour(rng, board)]);

  const score = state.score + points;
  if (points > 0) events.push({ kind: 'score', points });
  if (combo) events.push({ kind: 'combo' });
  const over = shot.landing === null || bottomRowOccupied(board);
  if (over) events.push({ kind: 'over', score });

  return {
    ...state,
    score,
    combos: state.combos + (combo ? 1 : 0),
    status: over ? 'over' : 'playing',
    events,
    board,
    shift,
    current,
    queue,
    shotsFired,
    shotsSincePush,
    shotsUntilPush: pushInterval(shotsFired) - shotsSincePush,
    rngState: rng.state(),
  };
}
