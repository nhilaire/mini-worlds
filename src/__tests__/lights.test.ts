import { createRng } from '../game/rng';
import {
  allOff,
  buildGrid,
  createLights,
  gridScore,
  hintCell,
  LIGHTS_CELLS,
  LIGHTS_FAIL_AFTER,
  LightsState,
  press,
  reduceLights,
  toggledBy,
} from '../game/lights/engine';

const tap = (state: LightsState, cell: number) => reduceLights(state, { type: 'tap', cell });

/** The seeded presses of the current grid, read back from a fresh state (solution = presses before any tap). */
const solutionCells = (state: LightsState) => state.solution.flatMap((on, i) => (on ? [i] : []));

/** A cell whose press does not solve the grid (taps that keep the grid unsolved). */
function wastedTap(state: LightsState): number {
  for (let cell = 0; cell < LIGHTS_CELLS; cell++) if (!allOff(press(state.lit, cell))) return cell;
  throw new Error('every tap solves');
}

function solve(state: LightsState): LightsState {
  let s = state;
  for (const cell of solutionCells(state)) s = tap(s, cell);
  return s;
}

describe('Lucioles engine (AC-61)', () => {
  it('AC-61: a tap toggles the cell and its orthogonal neighbours', () => {
    const state = createLights(7);
    const next = tap(state, 12); // centre
    const changed = next.lit.flatMap((on, i) => (on !== state.lit[i] ? [i] : []));
    expect(changed).toEqual([7, 11, 12, 13, 17]);
    expect(toggledBy(0).sort((a, b) => a - b)).toEqual([0, 1, 5]); // corner: 3 cells
    expect(toggledBy(4).sort((a, b) => a - b)).toEqual([3, 4, 9]);
    expect(toggledBy(22).sort((a, b) => a - b)).toEqual([17, 21, 22, 23]); // edge: 4 cells
    expect(next.taps).toBe(1);
    expect(next.events[0]).toEqual({ kind: 'toggle', cell: 12, cells: toggledBy(12) });
  });

  it('AC-61: every generated grid is solvable at par (500 seeds × 5 grids), never starts all off', () => {
    for (let seed = 1; seed <= 500; seed++) {
      let state = createLights(seed * 7919);
      for (let k = 1; k <= 5; k++) {
        expect(state.grid).toBe(k);
        expect(state.par).toBe(3 + k);
        expect(solutionCells(state)).toHaveLength(3 + k); // 3 + k distinct seeded presses
        expect(allOff(state.lit)).toBe(false);
        const scoreBefore = state.score;
        state = solve(state);
        expect(state.events).toContainEqual(expect.objectContaining({ kind: 'solved', grid: k, taps: 3 + k, par: 3 + k, points: 200 }));
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
    expect(createLights(42).lit).not.toEqual(createLights(43).lit);
  });

  it('AC-61: the grid score is max(50, 200 − 20 × taps beyond par)', () => {
    expect(gridScore(4, 4)).toBe(200);
    expect(gridScore(3, 4)).toBe(200);
    expect(gridScore(5, 4)).toBe(180);
    expect(gridScore(9, 4)).toBe(100);
    expect(gridScore(11, 4)).toBe(60);
    expect(gridScore(12, 4)).toBe(50);
    expect(gridScore(19, 4)).toBe(50);

    // Two wasted taps on the same cell cancel out: solved in par + 2 taps → 160, no combo.
    let state = createLights(3);
    const wasted = wastedTap(state);
    state = tap(tap(state, wasted), wasted);
    state = solve(state);
    expect(state.events).toContainEqual({ kind: 'solved', grid: 1, taps: 6, par: 4, points: 160 });
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
    const limit = state.par + LIGHTS_FAIL_AFTER; // 19 taps on grid 1
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
      // A few random taps first: the hint must account for them.
      for (let i = 0; i < 1 + rng.int(6); i++) {
        const next = tap(state, rng.int(LIGHTS_CELLS));
        if (next.grid !== state.grid) break;
        state = next;
      }
      if (state.grid !== 1) continue;
      const taps = state.taps;
      state = reduceLights(state, { type: 'hint' });
      expect(state.hintsLeft).toBe(2);
      expect(state.taps).toBe(taps);
      const cell = state.hint as number;
      expect(state.events).toEqual([{ kind: 'hint', cell }]);
      // Pressing the remaining solution (which includes the hinted cell) switches every firefly off.
      expect(state.solution[cell]).toBe(true);
      let lit = state.lit.slice();
      for (const c of solutionCells(state)) lit = press(lit, c);
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
