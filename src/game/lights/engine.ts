// Lucioles: a « lights out » on a grid of fireflies (docs/PRD.md "Lucioles", AC-61). Pure reducer on an immutable
// state, see src/game/contract.ts. Grids 1-2 are 4 × 4, grids 3-5 are 5 × 5; cells are indexed `row * size + col`,
// row 0 at the top. Grid k (1..5) is built by pressing 1 + k distinct seeded cells on an all-off grid, so pressing
// the same cells again solves it in par = 1 + k taps (phone test: 3 + k presses on 5 × 5 grids was far too hard).
// The engine keeps `solution` = seeded presses XOR the player's taps: pressing exactly those cells switches every
// firefly off (taps commute and each one is its own inverse), so a hint taken from it is always right.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

/** Largest grid side (grids 3-5); grids 1-2 are 4 × 4. */
export const LIGHTS_SIZE = 5;
export const LIGHTS_GRIDS = 5;
/** Taps beyond par after which an unsolved grid is failed. */
export const LIGHTS_FAIL_AFTER = 15;

export type LightsEvent =
  /** A tap: the cell and every cell it switched (itself + orthogonal neighbours). */
  | { kind: 'toggle'; cell: number; cells: readonly number[] }
  | { kind: 'solved'; grid: number; taps: number; par: number; points: number }
  | { kind: 'failed'; grid: number }
  /** The next grid is on the board. */
  | { kind: 'grid'; grid: number }
  | { kind: 'hint'; cell: number };

export type LightsState = RoundState<LightsEvent> & {
  /** Side of the current grid (4 or 5). */
  size: number;
  /** true = lit firefly; size × size cells. */
  lit: readonly boolean[];
  /** Cells whose press switches the grid off (seeded presses XOR the player's taps). */
  solution: readonly boolean[];
  /** Current grid, 1..5. */
  grid: number;
  par: number;
  /** Taps on the current grid (hints are not taps). */
  taps: number;
  hintsLeft: number;
  /** Cell highlighted by the last hint, null when none is shown. */
  hint: number | null;
  rngState: number;
};

export type LightsAction = { type: 'tap'; cell: number } | { type: 'hint' };

export const parOf = (grid: number): number => 1 + grid;
export const sizeOf = (grid: number): number => (grid <= 2 ? 4 : 5);

export function gridScore(taps: number, par: number): number {
  return Math.max(50, 200 - 20 * Math.max(0, taps - par));
}

/** The cell and its orthogonal neighbours inside a grid of side `size`. */
export function toggledBy(cell: number, size: number): number[] {
  const col = cell % size;
  const row = Math.floor(cell / size);
  const out = [cell];
  if (row > 0) out.push(cell - size);
  if (row < size - 1) out.push(cell + size);
  if (col > 0) out.push(cell - 1);
  if (col < size - 1) out.push(cell + 1);
  return out;
}

export function press(lit: readonly boolean[], cell: number, size: number): boolean[] {
  const next = lit.slice();
  for (const c of toggledBy(cell, size)) next[c] = !next[c];
  return next;
}

export const allOff = (lit: readonly boolean[]): boolean => lit.every((on) => !on);

/** Grid k: 1 + k distinct seeded presses on an all-off grid (redrawn if the presses cancel out). */
export function buildGrid(rngState: number, grid: number): { lit: boolean[]; presses: number[]; rngState: number } {
  const rng = createRng(rngState);
  const size = sizeOf(grid);
  const cells = Array.from({ length: size * size }, (_, i) => i);
  for (;;) {
    const presses = rng.shuffle(cells).slice(0, parOf(grid));
    let lit: boolean[] = new Array<boolean>(size * size).fill(false);
    for (const cell of presses) lit = press(lit, cell, size);
    // Guard: a press set that is a quiet pattern would leave the grid all off; it is drawn again.
    if (!allOff(lit)) return { lit, presses, rngState: rng.state() };
  }
}

function startGrid(state: Omit<LightsState, 'size' | 'lit' | 'solution' | 'par' | 'taps' | 'hint'>, grid: number): LightsState {
  const built = buildGrid(state.rngState, grid);
  const size = sizeOf(grid);
  const solution = new Array<boolean>(size * size).fill(false);
  for (const cell of built.presses) solution[cell] = true;
  return { ...state, grid, size, lit: built.lit, solution, par: parOf(grid), taps: 0, hint: null, rngState: built.rngState };
}

export function createLights(seed: number, upgrades: UpgradeLevels = {}): LightsState {
  return startGrid({ score: 0, combos: 0, status: 'playing', events: [], grid: 1, hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** First cell of the remaining solution in reading order, or null when the grid is off. */
export function hintCell(state: Pick<LightsState, 'solution'>): number | null {
  const index = state.solution.indexOf(true);
  return index < 0 ? null : index;
}

export function reduceLights(state: LightsState, action: LightsAction): LightsState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'hint') {
    // Refused when none is left or one is already shown (a second hint would point at the same cell).
    const cell = hintCell(state);
    if (state.hintsLeft <= 0 || state.hint !== null || cell === null) return { ...state, events: [] };
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: cell, events: [{ kind: 'hint', cell }] };
  }

  const { cell } = action;
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.size * state.size) return { ...state, events: [] };
  const lit = press(state.lit, cell, state.size);
  const solution = state.solution.slice();
  solution[cell] = !solution[cell];
  const taps = state.taps + 1;
  const events: LightsState['events'][number][] = [{ kind: 'toggle', cell, cells: toggledBy(cell, state.size) }];

  const solved = allOff(lit);
  if (!solved && taps < state.par + LIGHTS_FAIL_AFTER) {
    // The hint stays while its cell is still part of the solution.
    const hint = state.hint !== null && solution[state.hint] ? state.hint : null;
    return { ...state, lit, solution, taps, hint, events };
  }

  let score = state.score;
  let combos = state.combos;
  if (solved) {
    const points = gridScore(taps, state.par);
    score += points;
    events.push({ kind: 'solved', grid: state.grid, taps, par: state.par, points }, { kind: 'score', points });
    if (taps <= state.par) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
  } else {
    events.push({ kind: 'failed', grid: state.grid });
  }

  if (state.grid >= LIGHTS_GRIDS) {
    events.push({ kind: 'over', score });
    return { ...state, lit, solution, taps, hint: null, score, combos, status: 'over', events };
  }
  const next = startGrid({ ...state, score, combos }, state.grid + 1);
  events.push({ kind: 'grid', grid: next.grid });
  return { ...next, events };
}
