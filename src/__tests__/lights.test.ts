import { createRng } from '../game/rng';
import {
  allOff,
  buildGrid,
  createLights,
  gridScore,
  hintCell,
  LIGHTS_FAIL_AFTER,
  LightsState,
  press,
  reduceLights,
  sizeOf,
  toggledBy,
} from '../game/lights/engine';

const tap = (state: LightsState, cell: number) => reduceLights(state, { type: 'tap', cell });

/** The cells of the remaining solution (the seeded presses on a fresh grid). */
const solutionCells = (state: LightsState) => state.solution.flatMap((on, i) => (on ? [i] : []));

/** A cell whose press does not solve the grid (taps that keep the grid unsolved). */
function wastedTap(state: LightsState): number {
  for (let cell = 0; cell < state.size * state.size; cell++) if (!allOff(press(state.lit, cell, state.size))) return cell;
  throw new Error('every tap solves');
}

function solve(state: LightsState): LightsState {
  let s = state;
  for (const cell of solutionCells(state)) s = tap(s, cell);
  return s;
}

const sorted = (cells: number[]) => cells.slice().sort((a, b) => a - b);

describe('Lucioles engine (AC-61)', () => {
  it('AC-61: grids 1-2 are 4 × 4 and grids 3-5 are 5 × 5', () => {
    expect([1, 2, 3, 4, 5].map(sizeOf)).toEqual([4, 4, 5, 5, 5]);
    let state = createLights(17);
    for (let k = 1; k <= 5; k++) {
      expect(state.grid).toBe(k);
      expect(state.size).toBe(k <= 2 ? 4 : 5);
      expect(state.lit).toHaveLength(state.size * state.size);
      expect(state.solution).toHaveLength(state.size * state.size);
      state = solve(state);
    }
  });

  it('AC-61: a tap toggles the cell and its orthogonal neighbours (4 × 4 and 5 × 5)', () => {
    const state = createLights(7);
    expect(state.size).toBe(4);
    const next = tap(state, 5); // (1, 1)
    const changed = next.lit.flatMap((on, i) => (on !== state.lit[i] ? [i] : []));
    expect(changed).toEqual([1, 4, 5, 6, 9]);
    expect(next.taps).toBe(1);
    expect(next.events[0]).toEqual({ kind: 'toggle', cell: 5, cells: toggledBy(5, 4) });
    expect(sorted(toggledBy(0, 4))).toEqual([0, 1, 4]); // corner: 3 cells
    expect(sorted(toggledBy(15, 4))).toEqual([11, 14, 15]);
    expect(sorted(toggledBy(13, 4))).toEqual([9, 12, 13, 14]); // edge: 4 cells
    expect(sorted(toggledBy(12, 5))).toEqual([7, 11, 12, 13, 17]); // 5 × 5 centre
    expect(sorted(toggledBy(4, 5))).toEqual([3, 4, 9]);
    expect(sorted(toggledBy(22, 5))).toEqual([17, 21, 22, 23]);
    // Out-of-grid cells are ignored.
    expect(tap(state, 16).events).toEqual([]);
    expect(tap(state, 16).taps).toBe(0);
  });

  it('AC-61: every generated grid is solvable at par = 1 + k (500 seeds × 5 grids), never starts all off', () => {
    for (let seed = 1; seed <= 500; seed++) {
      let state = createLights(seed * 7919);
      for (let k = 1; k <= 5; k++) {
        expect(state.grid).toBe(k);
        expect(state.par).toBe(1 + k);
        expect(solutionCells(state)).toHaveLength(1 + k); // 1 + k distinct seeded presses
        expect(allOff(state.lit)).toBe(false);
        const scoreBefore = state.score;
        state = solve(state);
        expect(state.events).toContainEqual(expect.objectContaining({ kind: 'solved', grid: k, taps: 1 + k, par: 1 + k, points: 200 }));
        expect(state.score).toBe(scoreBefore + 200);
      }
      expect(state.status).toBe('over');
      expect(state.score).toBe(1000);
      expect(state.combos).toBe(5);
    }
  });

  it('AC-61: grids are seeded (same seed, same grids)', () => {
    expect(createLights(42).lit).toEqual(createLights(42).lit);
    expect(buildGrid(42, 3)).toEqual(buildGrid(42, 3));
    expect(createLights(42).solution).not.toEqual(createLights(43).solution);
  });

  it('AC-61: the grid score is max(50, 200 − 20 × taps beyond par)', () => {
    expect(gridScore(2, 2)).toBe(200);
    expect(gridScore(1, 2)).toBe(200);
    expect(gridScore(3, 2)).toBe(180);
    expect(gridScore(7, 2)).toBe(100);
    expect(gridScore(9, 2)).toBe(60);
    expect(gridScore(10, 2)).toBe(50);
    expect(gridScore(17, 2)).toBe(50);

    // Two wasted taps on the same cell cancel out: solved in par + 2 taps → 160, no combo.
    let state = createLights(3);
    const wasted = wastedTap(state);
    state = tap(tap(state, wasted), wasted);
    state = solve(state);
    expect(state.events).toContainEqual({ kind: 'solved', grid: 1, taps: 4, par: 2, points: 160 });
    expect(state.score).toBe(160);
    expect(state.combos).toBe(0);
    expect(state.events.some((e) => e.kind === 'combo')).toBe(false);
    expect(state.grid).toBe(2);
    expect(state.taps).toBe(0);
  });

  it('AC-61: a combo is a grid solved in at most par taps', () => {
    const solved = solve(createLights(11));
    expect(solved.combos).toBe(1);
    expect(solved.events.filter((e) => e.kind === 'combo')).toHaveLength(1);
  });

  it('AC-61: a grid unsolved after par + 15 taps is failed with 0 points and the next grid comes', () => {
    let state = createLights(5);
    const limit = state.par + LIGHTS_FAIL_AFTER; // 17 taps on grid 1
    for (let i = 0; i < limit - 1; i++) {
      state = tap(state, wastedTap(state));
      expect(state.grid).toBe(1);
    }
    expect(state.taps).toBe(limit - 1);
    state = tap(state, wastedTap(state));
    expect(state.events).toContainEqual({ kind: 'failed', grid: 1 });
    expect(state.events).toContainEqual({ kind: 'grid', grid: 2 });
    expect(state.score).toBe(0);
    expect(state.grid).toBe(2);
    expect(state.taps).toBe(0);
  });

  it('AC-61: the round ends after the 5th grid, even when grids fail', () => {
    let state = createLights(9);
    for (let k = 1; k <= 5; k++) {
      while (state.grid === k && state.status === 'playing') state = tap(state, wastedTap(state));
    }
    expect(state.status).toBe('over');
    expect(state.score).toBe(0);
    expect(state.events).toContainEqual({ kind: 'over', score: 0 });
    // A finished round ignores further input.
    const after = tap(state, 0);
    expect(after.lit).toEqual(state.lit);
    expect(after.events).toEqual([]);
  });

  it('AC-61: « Indice » gives 1 / 2 / 3 hints, each points at a cell of a remaining solution, hints are not taps', () => {
    expect(createLights(1).hintsLeft).toBe(0);
    expect(createLights(1, { hint: 2 }).hintsLeft).toBe(2);
    // No hint without the upgrade.
    const none = reduceLights(createLights(1), { type: 'hint' });
    expect(none.hint).toBeNull();
    expect(none.events).toEqual([]);

    for (let seed = 1; seed <= 200; seed++) {
      let state = createLights(seed, { hint: 3 });
      const rng = createRng(seed);
      // Move to a seeded grid (4 × 4 or 5 × 5), then a few random taps: the hint must account for them.
      const target = 1 + rng.int(5);
      while (state.grid < target) state = solve(state);
      for (let i = 0; i < 1 + rng.int(6); i++) {
        const next = tap(state, rng.int(state.size * state.size));
        if (next.grid !== state.grid) break;
        state = next;
      }
      if (state.grid !== target) continue;
      const taps = state.taps;
      state = reduceLights(state, { type: 'hint' });
      expect(state.hintsLeft).toBe(2);
      expect(state.taps).toBe(taps);
      const cell = state.hint as number;
      expect(state.events).toEqual([{ kind: 'hint', cell }]);
      // Pressing the remaining solution (which includes the hinted cell) switches every firefly off.
      expect(state.solution[cell]).toBe(true);
      let lit = state.lit.slice();
      for (const c of solutionCells(state)) lit = press(lit, c, state.size);
      expect(allOff(lit)).toBe(true);
    }
  });

  it('AC-61: a hint is refused while one is shown and clears when its cell is tapped', () => {
    let state = reduceLights(createLights(21, { hint: 3 }), { type: 'hint' });
    const cell = state.hint as number;
    expect(cell).toBe(hintCell(state));
    const again = reduceLights(state, { type: 'hint' });
    expect(again.hintsLeft).toBe(2);
    expect(again.events).toEqual([]);
    state = tap(state, cell);
    if (state.grid === 1) expect(state.hint).toBeNull();
    expect(state.hintsLeft).toBe(2);
  });
});
