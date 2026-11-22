// Chaîne de Nombres: link neighbouring cells holding the same number on a 5 × 6 board, then tap the last cell again:
// the chain merges into a bigger number, the numbers above fall and the top is refilled (docs/PRD.md "Chaîne de
// Nombres", AC-105). Pure reducer on an immutable state, see src/game/contract.ts. Cells are indexed
// `row * 5 + col`, row 0 at the top. The 250 ms guard while a chain resolves is an engine counter advanced by `tick`.
//
// Rule readings (the PRD leaves them open):
// - « tap any other cell to cancel it »: a tap on a cell that cannot extend the chain (far, another value, already in
//   the chain) empties the chain and selects nothing; so does a second tap on a chain of one cell (too short to
//   validate).
// - « dealt again »: a whole new seeded board of 1 to 3 (the big numbers are lost; « best number » keeps the highest
//   number seen in the round). Up to REDEAL_ATTEMPTS seeded boards, then the last one gets a pair by force (its second
//   cell takes the value of its first).
// - The refill draws one number per empty cell, column by column from the left, from the lowest empty cell up.
// - « Mélange » permutes the numbers of the board (same numbers, seeded places), cancels the chain in progress, and
//   plays in the same 250 ms guard; a shuffled board without any pair is dealt again like any other. It is refused
//   during the guard and when none is left.
// - The 25th chain ends the round: its board is refilled but never dealt again.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const CHAIN_COLS = 5;
export const CHAIN_ROWS = 6;
export const CHAIN_CELLS = CHAIN_COLS * CHAIN_ROWS;
/** Seeded numbers (start, refill, redeal) are drawn in 1..SEED_MAX. */
export const SEED_MAX = 3;
/** Cells needed to validate a chain. */
export const CHAIN_MIN = 2;
/** From this length the last cell gains LONG_GAIN instead of SHORT_GAIN, and the chain is a combo. */
export const LONG_CHAIN = 4;
export const SHORT_GAIN = 1;
export const LONG_GAIN = 2;
/** Points of a chain: POINTS_FACTOR × value × cells. */
export const POINTS_FACTOR = 10;
/** Chains in a round. */
export const CHAIN_ROUND = 25;
/** A chain (or a shuffle) resolves in this time; taps are ignored meanwhile (input guard), ms. */
export const CHAIN_GUARD_MS = 250;
/** Seeded boards tried when a board has no pair, before a pair is forced. */
export const REDEAL_ATTEMPTS = 20;

export type ChainEvent =
  /** The first cell of a chain. */
  | { kind: 'start'; cell: number }
  | { kind: 'extend'; cell: number }
  /** The chain in progress was dropped (a tap elsewhere, or a second tap on a chain of one cell). */
  | { kind: 'cancel'; cell: number }
  /** A tap or a shuffle during the 250 ms guard, or a shuffle refused: nothing changes. */
  | { kind: 'ignored' }
  /**
   * A validated chain of `cells` (in tap order) holding `value`: its last cell became `result` and, after the fall,
   * sits on `at`; `changed` are the other cells whose number fell or was refilled.
   */
  | { kind: 'chain'; cells: readonly number[]; value: number; result: number; at: number; changed: readonly number[]; points: number }
  /** The board had no pair: a new one is on the table. */
  | { kind: 'redeal' }
  | { kind: 'shuffle' };

export type ChainState = RoundState<ChainEvent> & {
  /** The 30 numbers of the board (always full between two actions). */
  cells: readonly number[];
  /** The chain in progress, in tap order; its last cell is the one to tap again. */
  chain: readonly number[];
  /** Chains left in the round (25 at the start). */
  chainsLeft: number;
  /** The highest number seen on the board this round. */
  best: number;
  shufflesLeft: number;
  /** Remaining time of the input guard, ms. */
  guardMs: number;
  rngState: number;
};

export type ChainAction = { type: 'tap'; cell: number } | { type: 'shuffle' } | { type: 'tick'; dt: number };

export const cellOf = (col: number, row: number): number => row * CHAIN_COLS + col;
export const colOf = (cell: number): number => cell % CHAIN_COLS;
export const rowOf = (cell: number): number => Math.floor(cell / CHAIN_COLS);

/** The up to 8 cells around a cell (row by row, left to right). */
export function neighbours(cell: number): number[] {
  const col = colOf(cell);
  const row = rowOf(cell);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < CHAIN_ROWS && c >= 0 && c < CHAIN_COLS) out.push(cellOf(c, r));
    }
  }
  return out;
}

export const adjacent = (a: number, b: number): boolean => neighbours(a).includes(b);

/** Two neighbours (8 directions) hold the same number. */
export function hasPair(cells: readonly number[]): boolean {
  return cells.some((value, cell) => neighbours(cell).some((n) => cells[n] === value));
}

/** What the last cell of a chain of `length` cells gains. */
export const chainGain = (length: number): number => (length >= LONG_CHAIN ? LONG_GAIN : SHORT_GAIN);
export const chainPoints = (value: number, length: number): number => POINTS_FACTOR * value * length;

export type Dealt = { cells: number[]; rngState: number; /** Seeded boards drawn. */ attempts: number; /** The pair was forced. */ forced: boolean };

/**
 * A seeded board of 1..SEED_MAX holding at least one pair: the first of up to `attempts` seeded boards that has one;
 * when none has (or `attempts` is 0), one more board is drawn and its second cell takes the value of its first.
 */
export function dealBoard(rngState: number, attempts: number = REDEAL_ATTEMPTS): Dealt {
  const rng = createRng(rngState);
  const draw = () => Array.from({ length: CHAIN_CELLS }, () => 1 + rng.int(SEED_MAX));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const cells = draw();
    if (hasPair(cells)) return { cells, rngState: rng.state(), attempts: attempt, forced: false };
  }
  const cells = draw();
  cells[1] = cells[0];
  return { cells, rngState: rng.state(), attempts: attempts + 1, forced: true };
}

export type Fallen = { cells: number[]; rngState: number; /** Where the kept cell `keep` sits after the fall. */ at: number; /** Cells whose number fell or was refilled. */ changed: number[] };

/**
 * Empties `removed`, packs every column at the bottom and fills the top with seeded numbers of 1..SEED_MAX (column by
 * column from the left, from the lowest empty cell up). `keep` is followed through the fall.
 */
export function collapse(cells: readonly number[], removed: readonly number[], keep: number, rngState: number): Fallen {
  const rng = createRng(rngState);
  const gone = new Set(removed);
  const out = cells.slice();
  const changed: number[] = [];
  let at = keep;
  for (let col = 0; col < CHAIN_COLS; col++) {
    let target = CHAIN_ROWS - 1;
    for (let row = CHAIN_ROWS - 1; row >= 0; row--) {
      const from = cellOf(col, row);
      if (gone.has(from)) continue;
      const to = cellOf(col, target);
      out[to] = cells[from];
      if (from === keep) at = to;
      else if (to !== from) changed.push(to);
      target -= 1;
    }
    for (; target >= 0; target--) {
      const to = cellOf(col, target);
      out[to] = 1 + rng.int(SEED_MAX);
      changed.push(to);
    }
  }
  return { cells: out, rngState: rng.state(), at, changed };
}

export function createChain(seed: number, upgrades: UpgradeLevels = {}): ChainState {
  const dealt = dealBoard(seed >>> 0);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    cells: dealt.cells,
    chain: [],
    chainsLeft: CHAIN_ROUND,
    best: Math.max(...dealt.cells),
    shufflesLeft: upgrades.shuffle ?? 0,
    guardMs: 0,
    rngState: dealt.rngState,
  };
}

type Events = ChainState['events'][number][];

/** The board to play next: `cells` when it holds a pair, else a new deal (event `redeal`). */
function playable(cells: readonly number[], rngState: number, events: Events): { cells: readonly number[]; rngState: number } {
  if (hasPair(cells)) return { cells, rngState };
  const dealt = dealBoard(rngState);
  events.push({ kind: 'redeal' });
  return { cells: dealt.cells, rngState: dealt.rngState };
}

function validate(state: ChainState): ChainState {
  const { chain } = state;
  const last = chain[chain.length - 1];
  const value = state.cells[last];
  const result = value + chainGain(chain.length);
  const points = chainPoints(value, chain.length);
  const merged = state.cells.slice();
  merged[last] = result;
  const fallen = collapse(merged, chain.slice(0, -1), last, state.rngState);
  const score = state.score + points;
  const chainsLeft = state.chainsLeft - 1;
  const best = Math.max(state.best, result);
  let combos = state.combos;
  const events: Events = [{ kind: 'chain', cells: chain, value, result, at: fallen.at, changed: fallen.changed, points }, { kind: 'score', points }];
  if (chain.length >= LONG_CHAIN) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  const next = { ...state, chain: [], score, combos, chainsLeft, best, guardMs: CHAIN_GUARD_MS };
  if (chainsLeft <= 0) {
    events.push({ kind: 'over', score });
    return { ...next, cells: fallen.cells, rngState: fallen.rngState, status: 'over', events };
  }
  const board = playable(fallen.cells, fallen.rngState, events);
  return { ...next, cells: board.cells, rngState: board.rngState, events };
}

function shuffle(state: ChainState): ChainState {
  if (state.guardMs > 0 || state.shufflesLeft <= 0) return { ...state, events: [{ kind: 'ignored' }] };
  const rng = createRng(state.rngState);
  const events: Events = [{ kind: 'shuffle' }];
  const board = playable(rng.shuffle(state.cells), rng.state(), events);
  return { ...state, cells: board.cells, rngState: board.rngState, chain: [], shufflesLeft: state.shufflesLeft - 1, guardMs: CHAIN_GUARD_MS, events };
}

export function reduceChain(state: ChainState, action: ChainAction): ChainState {
  if (action.type === 'tick') {
    if (state.guardMs <= 0 || !(action.dt > 0)) return state;
    return { ...state, guardMs: Math.max(0, state.guardMs - action.dt), events: [] };
  }
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };
  if (action.type === 'shuffle') return shuffle(state);

  const { cell } = action;
  if (state.guardMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  if (!Number.isInteger(cell) || cell < 0 || cell >= CHAIN_CELLS) return { ...state, events: [{ kind: 'ignored' }] };
  const { chain } = state;
  if (chain.length === 0) return { ...state, chain: [cell], events: [{ kind: 'start', cell }] };
  const last = chain[chain.length - 1];
  if (cell === last) {
    if (chain.length < CHAIN_MIN) return { ...state, chain: [], events: [{ kind: 'cancel', cell }] };
    return validate(state);
  }
  if (adjacent(last, cell) && state.cells[cell] === state.cells[last] && !chain.includes(cell)) {
    return { ...state, chain: [...chain, cell], events: [{ kind: 'extend', cell }] };
  }
  return { ...state, chain: [], events: [{ kind: 'cancel', cell }] };
}
