// « Fruits en Fusion » (docs/PRD.md "Fruits en Fusion", AC-76): a 6 × 8 grid where the player drops fruits into
// columns. Pure reducer on an immutable state (src/game/contract.ts); time comes in through `tick` (elapsed ms) for
// the input guard, randomness (the next fruit) through the seeded generator kept in the state.
//
// Cells are indexed `row * FRUIT_COLS + col`, row 0 at the top; a cell holds a fruit index 0..7 or null. Gravity keeps
// every column packed at the bottom. Rule readings (simplest reading of the PRD, noted here):
// - « merges with all of them » = the fruit and the fruits of its kind that touch it directly (orthogonal neighbours),
//   not the whole connected group;
// - after a drop or a sweep, the cells to check are the dropped fruit (or the fruits moved by the sweep); after each
//   merge, the created fruit and every fruit moved by gravity join them; the next merge is the first cell to check,
//   bottom-up then left to right, that touches a fruit of its kind; a checked cell without a match leaves the list;
// - merges started by a sweep score as usual but a combo counts only for a drop (PRD: « a drop that chains 2 merges »);
// - a sweep on an empty grid is refused (it would waste a use);
// - no fruit limit (v0.4.0 phone test): the round ends when the jar overflows, that is when, after a drop and its
//   merges, every column is full; fruits 1-40 are drawn among 0-3, 41-120 among 0-4, the next ones among 0-5;
// - from the 41st piece, every 5th piece is a stone (user decision after measuring: without it a careful player, and
//   the casual bot, never overflowed): it is dropped like a fruit, never merges, scores nothing, and only « Coup de
//   balai » removes it from the bottom row.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const FRUIT_COLS = 6;
export const FRUIT_ROWS = 8;
export const FRUIT_KINDS = 8;
/** The first 40 fruits are drawn among indexes 0..NEXT_MAX; later ones among a wider range (nextMaxFor). */
export const NEXT_MAX = 3;
/** A stone: dropped like a fruit, it never merges (every 5th piece from the 41st). */
export const STONE = FRUIT_KINDS;
/** From this piece on, every STONE_EVERY-th piece is a stone. */
export const STONES_FROM = 41;
export const STONE_EVERY = 5;
/** A column holding this many fruits or more shows a red line at its top. */
export const DANGER_HEIGHT = 7;
/** Safety cap of a bot round (drops); every bot round overflows long before. */
export const FRUIT_BOT_CAP = 400;
export const WATERMELON = FRUIT_KINDS - 1;
export const VANISH_POINTS = 2000;
/** The drop plays in this time; taps are ignored meanwhile (input guard). */
export const FRUIT_GUARD_MS = 300;
/** Each merge or vanish step is replayed in this time: flash 280 + shrink 220 + fall 180 ms (AC-91). */
export const MERGE_STEP_MS = 680;

/** Input guard of a drop or a sweep: the drop, then every merge step of its replay (AC-91). */
export const guardFor = (steps: number): number => FRUIT_GUARD_MS + MERGE_STEP_MS * steps;
/**
 * Star thresholds measured with the casual bot over 50 seeds (1 star ≈ p25, 2 stars ≈ p90, 3 stars ≈ 2 × median,
 * multiples of 50); to copy into src/game/core/content.ts. v0.4.0 phone test (no fruit limit, stones): p25 16 260,
 * median 19 230, p90 24 600.
 */
export const FRUIT_STARS = [16250, 24600, 38450] as const;

export type Cell = number | null;

export type FruitEvent =
  | BaseEvent
  | { kind: 'drop'; col: number; row: number; fruit: number }
  /** `cells` merged into `fruit` at `at`; `points` scored. `board`: the grid just before this step (for the replay). */
  | { kind: 'merge'; cells: readonly number[]; at: number; fruit: number; points: number; board: readonly Cell[] }
  /** Touching pastèques vanished. `board`: the grid just before this step. */
  | { kind: 'vanish'; cells: readonly number[]; points: number; board: readonly Cell[] }
  | { kind: 'sweep'; cells: readonly number[] }
  /** A tap during the guard, on a full column, or a sweep refused. */
  | { kind: 'ignored' };

export type FruitState = RoundState<FruitEvent> & {
  cells: readonly Cell[];
  next: number;
  sweepsLeft: number;
  /** Time left of the drop animation (ms); taps are ignored while > 0. */
  busyMs: number;
  /** Drops so far (also keys the screen animations). */
  drops: number;
  rngState: number;
};

export type FruitAction = { type: 'drop'; col: number } | { type: 'sweep' } | { type: 'tick'; dt: number };

export const mergePoints = (fruit: number): number => 10 * 2 ** fruit;
export const cellOf = (col: number, row: number): number => row * FRUIT_COLS + col;
export const colOf = (cell: number): number => cell % FRUIT_COLS;
export const rowOf = (cell: number): number => Math.floor(cell / FRUIT_COLS);

export function neighbours(cell: number): number[] {
  const col = colOf(cell);
  const row = rowOf(cell);
  const out: number[] = [];
  if (row > 0) out.push(cell - FRUIT_COLS);
  if (row < FRUIT_ROWS - 1) out.push(cell + FRUIT_COLS);
  if (col > 0) out.push(cell - 1);
  if (col < FRUIT_COLS - 1) out.push(cell + 1);
  return out;
}

/** Number of fruits in a column. */
export function height(cells: readonly Cell[], col: number): number {
  let n = 0;
  for (let row = 0; row < FRUIT_ROWS; row++) if (cells[cellOf(col, row)] !== null) n += 1;
  return n;
}

export const columnFull = (cells: readonly Cell[], col: number): boolean => cells[cellOf(col, 0)] !== null;
/** A column holding DANGER_HEIGHT fruits or more (red line at its top). */
export const columnInDanger = (cells: readonly Cell[], col: number): boolean => cells[cellOf(col, FRUIT_ROWS - DANGER_HEIGHT)] !== null;
export const boardFull = (cells: readonly Cell[]): boolean => Array.from({ length: FRUIT_COLS }, (_, c) => c).every((c) => columnFull(cells, c));

/** Lowest empty row of a column, or -1 when full. */
export function landingRow(cells: readonly Cell[], col: number): number {
  for (let row = FRUIT_ROWS - 1; row >= 0; row--) if (cells[cellOf(col, row)] === null) return row;
  return -1;
}

/** Packs every column at the bottom; returns the new cells and the moves (from → to). */
export function gravity(cells: readonly Cell[]): { cells: Cell[]; moves: Map<number, number> } {
  const out: Cell[] = new Array<Cell>(FRUIT_COLS * FRUIT_ROWS).fill(null);
  const moves = new Map<number, number>();
  for (let col = 0; col < FRUIT_COLS; col++) {
    let target = FRUIT_ROWS - 1;
    for (let row = FRUIT_ROWS - 1; row >= 0; row--) {
      const from = cellOf(col, row);
      if (cells[from] === null) continue;
      const to = cellOf(col, target);
      out[to] = cells[from];
      if (to !== from) moves.set(from, to);
      target -= 1;
    }
  }
  return { cells: out, moves };
}

/** Bottom-up, then left to right. */
const checkOrder = (a: number, b: number): number => rowOf(b) - rowOf(a) || colOf(a) - colOf(b);

/** Lowest of the cells, left-most on a tie. */
const lowest = (cells: readonly number[]): number => cells.slice().sort(checkOrder)[0];

type Resolved = { cells: Cell[]; events: FruitEvent[]; points: number; merges: number };

/** Runs the merges starting from the cells to check, until nothing merges (each merge removes a fruit: bounded). */
export function resolve(start: readonly Cell[], toCheck: Iterable<number>): Resolved {
  let cells = start.slice();
  let pending = new Set<number>(toCheck);
  const events: FruitEvent[] = [];
  let points = 0;
  let merges = 0;
  while (pending.size > 0) {
    const order = [...pending].sort(checkOrder);
    const cell = order[0];
    pending.delete(cell);
    const fruit = cells[cell];
    if (fruit === null || fruit === STONE) continue; // a stone never merges
    const mates = neighbours(cell).filter((n) => cells[n] === fruit);
    if (mates.length === 0) continue;
    const group = [cell, ...mates];
    const board = cells.slice();
    for (const c of group) {
      cells[c] = null;
      pending.delete(c);
    }
    let created: number | null = null;
    if (fruit === WATERMELON) {
      points += VANISH_POINTS;
      events.push({ kind: 'vanish', cells: group, points: VANISH_POINTS, board }, { kind: 'score', points: VANISH_POINTS });
    } else {
      const at = lowest(group);
      const value = fruit + 1;
      cells[at] = value;
      created = at;
      const gained = mergePoints(value);
      points += gained;
      events.push({ kind: 'merge', cells: group, at, fruit: value, points: gained, board }, { kind: 'score', points: gained });
    }
    merges += 1;
    const fallen = gravity(cells);
    cells = fallen.cells;
    const remapped = new Set<number>();
    for (const c of pending) remapped.add(fallen.moves.get(c) ?? c);
    if (created !== null) remapped.add(fallen.moves.get(created) ?? created);
    for (const to of fallen.moves.values()) remapped.add(to);
    pending = remapped;
  }
  return { cells, events, points, merges };
}

/** Highest index of the n-th fruit of a round (1-based): 3 up to the 40th, 4 up to the 120th, then 5. */
export function nextMaxFor(fruitNumber: number): number {
  if (fruitNumber <= 40) return NEXT_MAX;
  return fruitNumber <= 120 ? NEXT_MAX + 1 : NEXT_MAX + 2;
}

/** True when the n-th piece of a round (1-based) is a stone: the 45th, 50th, 55th... */
export function isStonePiece(pieceNumber: number): boolean {
  return pieceNumber >= STONES_FROM && pieceNumber % STONE_EVERY === 0;
}

function drawNext(rngState: number, fruitNumber: number): { next: number; rngState: number } {
  const rng = createRng(rngState);
  const drawn = rng.int(nextMaxFor(fruitNumber) + 1);
  const next = isStonePiece(fruitNumber) ? STONE : drawn;
  return { next, rngState: rng.state() };
}

export function createFruit(seed: number, upgrades: UpgradeLevels = {}): FruitState {
  const first = drawNext(seed >>> 0, 1);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    cells: new Array<Cell>(FRUIT_COLS * FRUIT_ROWS).fill(null),
    next: first.next,
    sweepsLeft: upgrades.sweep ?? 0,
    busyMs: 0,
    drops: 0,
    rngState: first.rngState,
  };
}

const ignored = (state: FruitState): FruitState => ({ ...state, events: [{ kind: 'ignored' }] });

function drop(state: FruitState, col: number): FruitState {
  if (state.busyMs > 0 || !Number.isInteger(col) || col < 0 || col >= FRUIT_COLS) return ignored(state);
  const row = landingRow(state.cells, col);
  if (row < 0) return ignored(state);
  const placed = state.cells.slice();
  const at = cellOf(col, row);
  placed[at] = state.next;
  const result = resolve(placed, [at]);
  const events: FruitEvent[] = [{ kind: 'drop', col, row, fruit: state.next }, ...result.events];
  let combos = state.combos;
  if (result.merges >= 2) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  const score = state.score + result.points;
  const drawn = drawNext(state.rngState, state.drops + 2); // the fruit after this drop
  const next: FruitState = { ...state, cells: result.cells, score, combos, next: drawn.next, rngState: drawn.rngState, busyMs: guardFor(result.merges), drops: state.drops + 1, events };
  // The round ends when the jar overflows: after the drop and its merges, the next fruit fits in no column.
  if (boardFull(result.cells)) return { ...next, status: 'over', events: [...events, { kind: 'over', score }] };
  return next;
}

function sweep(state: FruitState): FruitState {
  if (state.busyMs > 0 || state.sweepsLeft <= 0) return ignored(state);
  const bottom = Array.from({ length: FRUIT_COLS }, (_, c) => cellOf(c, FRUIT_ROWS - 1)).filter((c) => state.cells[c] !== null);
  if (bottom.length === 0) return ignored(state);
  const cleared = state.cells.slice();
  for (const c of bottom) cleared[c] = null;
  const fallen = gravity(cleared);
  const result = resolve(fallen.cells, fallen.moves.values());
  const score = state.score + result.points;
  return {
    ...state,
    cells: result.cells,
    score,
    sweepsLeft: state.sweepsLeft - 1,
    busyMs: guardFor(result.merges),
    events: [{ kind: 'sweep', cells: bottom }, ...result.events],
  };
}

export function reduceFruit(state: FruitState, action: FruitAction): FruitState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      // Only the guard counts down: the same state comes back when it is already over (no re-render needed).
      if (action.dt <= 0 || state.busyMs <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      return { ...state, busyMs: Math.max(0, state.busyMs - action.dt), events: [] };
    }
    case 'drop':
      return drop(state, action.col);
    case 'sweep':
      return sweep(state);
  }
}

/**
 * Casual bot (AC-86): drops on a column whose top fruit matches the next fruit (the lowest such column, left-most on
 * a tie), else on the lowest column (fewest fruits, left-most on a tie). No sweep, no lookahead.
 */
export function casualFruitMove(state: Pick<FruitState, 'cells' | 'next'>): number {
  let best = -1;
  let bestHeight = Infinity;
  let fallback = -1;
  let fallbackHeight = Infinity;
  for (let col = 0; col < FRUIT_COLS; col++) {
    if (columnFull(state.cells, col)) continue;
    const h = height(state.cells, col);
    const top = h === 0 ? null : state.cells[cellOf(col, FRUIT_ROWS - h)];
    if (top === state.next && h < bestHeight) {
      best = col;
      bestHeight = h;
    }
    if (h < fallbackHeight) {
      fallback = col;
      fallbackHeight = h;
    }
  }
  return best >= 0 ? best : fallback;
}

/** Plays a whole round with the casual bot (ticks past the guard between drops); returns the final state. */
export function playCasualFruit(seed: number, upgrades: UpgradeLevels = {}, maxDrops = FRUIT_BOT_CAP): FruitState {
  let state = createFruit(seed, upgrades);
  for (let i = 0; i < maxDrops && state.status === 'playing'; i++) {
    state = reduceFruit(state, { type: 'drop', col: casualFruitMove(state) });
    state = reduceFruit(state, { type: 'tick', dt: state.busyMs });
  }
  return state;
}
