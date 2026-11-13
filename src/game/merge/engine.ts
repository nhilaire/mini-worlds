// « Fusion de Guerriers » (docs/PRD.md "Fusion de Guerriers", AC-82): a 4 × 4 grid of warriors. Tap a warrior, then
// an adjacent (orthogonal) warrior of the same level: they merge into one warrior of the next level in the second
// cell. Pure reducer on an immutable state (src/game/contract.ts); time comes in through `tick` (elapsed ms) for the
// input guard, randomness (start cells, spawns, the « Vétéran » chance) through the seeded generator kept in the state.
//
// Cells are indexed `row * MERGE_SIZE + col`, row 0 at the top; a cell holds a level (1..) or 0 when empty.
// Rule readings (simplest reading of the PRD, noted here):
// - PRD amendment after the balance measurement: 6 warriors at the start, two recruits after every merge, each one
//   level 2 with the « Vétéran » chance;
// - a tap on another warrior that cannot merge with the selected one selects it instead; a tap on the selected
//   warrior or on an empty cell clears the selection.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const MERGE_SIZE = 4;
export const MERGE_CELLS = MERGE_SIZE * MERGE_SIZE;
export const START_WARRIORS = 6;
/** Recruits after every merge (fewer when the grid has fewer free cells). */
export const RECRUITS = 2;
/** Chance of a level 2 bonus warrior per « Vétéran » level. */
export const VETERAN_CHANCE = 0.1;
/** A merge animates in this time; taps are ignored meanwhile (input guard). */
export const MERGE_GUARD_MS = 200;
/** A merge creating this level or higher is a combo. */
export const COMBO_LEVEL = 5;
/** Seeded attempts at a start with an adjacent pair before the fallback. */
export const START_ATTEMPTS = 50;

export type MergeEvent =
  | BaseEvent
  | { kind: 'select'; cell: number | null }
  | { kind: 'merge'; from: number; to: number; level: number; points: number }
  | { kind: 'spawn'; cell: number; level: number }
  /** A tap during the guard: nothing changes. */
  | { kind: 'ignored' };

export type MergeState = RoundState<MergeEvent> & {
  cells: readonly number[];
  selected: number | null;
  merges: number;
  /** Highest level on the grid so far. */
  best: number;
  veteran: number;
  /** Time left of the merge animation (ms); taps are ignored while > 0. */
  busyMs: number;
  rngState: number;
};

export type MergeAction = { type: 'tap'; cell: number } | { type: 'tick'; dt: number };

export const mergeScore = (level: number): number => 10 * 2 ** (level - 1);

export function neighbours(cell: number): number[] {
  const col = cell % MERGE_SIZE;
  const row = Math.floor(cell / MERGE_SIZE);
  const out: number[] = [];
  if (row > 0) out.push(cell - MERGE_SIZE);
  if (row < MERGE_SIZE - 1) out.push(cell + MERGE_SIZE);
  if (col > 0) out.push(cell - 1);
  if (col < MERGE_SIZE - 1) out.push(cell + 1);
  return out;
}

export const adjacent = (a: number, b: number): boolean => neighbours(a).includes(b);

/** Every adjacent pair [a, b] (a before b in reading order) whose warriors share a level. */
export function mergeablePairs(cells: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < MERGE_CELLS; a++) {
    if (cells[a] === 0) continue;
    for (const b of neighbours(a)) if (b > a && cells[b] === cells[a]) out.push([a, b]);
  }
  return out;
}

export const hasMove = (cells: readonly number[]): boolean => mergeablePairs(cells).length > 0;

/** 4 level-1 warriors on seeded cells including an adjacent pair (bounded attempts, then a fixed fallback). */
export function startCells(rngState: number): { cells: number[]; rngState: number } {
  const rng = createRng(rngState);
  const all = Array.from({ length: MERGE_CELLS }, (_, i) => i);
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    const picked = rng.shuffle(all).slice(0, START_WARRIORS);
    const cells = new Array<number>(MERGE_CELLS).fill(0);
    for (const c of picked) cells[c] = 1;
    if (hasMove(cells)) return { cells, rngState: rng.state() };
  }
  // Fallback (never needed in practice): a pair on the top row and the others spread on the bottom rows.
  const cells = new Array<number>(MERGE_CELLS).fill(0);
  for (const c of [0, 1, 8, 10, 13, 15].slice(0, START_WARRIORS)) cells[c] = 1;
  return { cells, rngState: rng.state() };
}

export function createMerge(seed: number, upgrades: UpgradeLevels = {}): MergeState {
  const start = startCells(seed >>> 0);
  return { score: 0, combos: 0, status: 'playing', events: [], cells: start.cells, selected: null, merges: 0, best: 1, veteran: upgrades.veteran ?? 0, busyMs: 0, rngState: start.rngState };
}

function merge(state: MergeState, from: number, to: number): MergeState {
  const cells = state.cells.slice();
  const level = cells[to] + 1;
  cells[from] = 0;
  cells[to] = level;
  const points = mergeScore(level);
  const merges = state.merges + 1;
  const events: MergeEvent[] = [{ kind: 'merge', from, to, level, points }, { kind: 'score', points }];
  let combos = state.combos;
  if (level >= COMBO_LEVEL) {
    combos += 1;
    events.push({ kind: 'combo' });
  }

  // Spawns: two recruits in seeded empty cells, each level 2 with the « Vétéran » chance, never more than the free
  // cells.
  const rng = createRng(state.rngState);
  for (let k = 0; k < RECRUITS; k++) {
    const free = cells.flatMap((v, i) => (v === 0 ? [i] : []));
    if (free.length === 0) break;
    const cell = rng.pick(free);
    const spawnLevel = rng.next() < VETERAN_CHANCE * state.veteran ? 2 : 1;
    cells[cell] = spawnLevel;
    events.push({ kind: 'spawn', cell, level: spawnLevel });
  }

  const score = state.score + points;
  const best = Math.max(state.best, level, ...cells);
  const next: MergeState = { ...state, cells, selected: null, merges, best, score, combos, busyMs: MERGE_GUARD_MS, rngState: rng.state(), events };
  if (!hasMove(cells)) return { ...next, status: 'over', events: [...events, { kind: 'over', score }] };
  return next;
}

function tap(state: MergeState, cell: number): MergeState {
  if (state.busyMs > 0 || !Number.isInteger(cell) || cell < 0 || cell >= MERGE_CELLS) return { ...state, events: [{ kind: 'ignored' }] };
  const { selected, cells } = state;
  if (cells[cell] === 0 || selected === cell) {
    return selected === null ? { ...state, events: [] } : { ...state, selected: null, events: [{ kind: 'select', cell: null }] };
  }
  if (selected !== null && adjacent(selected, cell) && cells[selected] === cells[cell]) return merge(state, selected, cell);
  return { ...state, selected: cell, events: [{ kind: 'select', cell }] };
}

export function reduceMerge(state: MergeState, action: MergeAction): MergeState {
  if (state.status !== 'playing') return state;
  if (action.type === 'tap') return tap(state, action.cell);
  // Only the guard counts down: the same state comes back when it is already over (no re-render needed).
  if (action.dt <= 0 || state.busyMs <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
  return { ...state, busyMs: Math.max(0, state.busyMs - action.dt), events: [] };
}

/** Casual bot (AC-86): the adjacent pair with the lowest level, top-left first; returns [first tap, second tap]. */
export function casualMergeMove(cells: readonly number[]): [number, number] | null {
  let best: [number, number] | null = null;
  for (const pair of mergeablePairs(cells)) if (best === null || cells[pair[0]] < cells[best[0]]) best = pair;
  return best;
}

/** Plays a whole round with the casual bot (ticks past the guard between merges); returns the final state. */
export function playCasualMerge(seed: number, upgrades: UpgradeLevels = {}, maxMerges = 5000): MergeState {
  let state = createMerge(seed, upgrades);
  for (let i = 0; i < maxMerges && state.status === 'playing'; i++) {
    const move = casualMergeMove(state.cells);
    if (!move) break;
    state = reduceMerge(state, { type: 'tap', cell: move[0] });
    state = reduceMerge(state, { type: 'tap', cell: move[1] });
    state = reduceMerge(state, { type: 'tick', dt: MERGE_GUARD_MS });
  }
  return state;
}
