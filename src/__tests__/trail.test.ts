import { botRoute, playTrailBot } from '../game/trail/bot';
import {
  adjacent,
  ALL_GEMS_BONUS,
  buildGrid,
  colOf,
  createTrail,
  FALLBACK,
  fullTrail,
  GEM_POINTS,
  GEN_STEPS,
  gemCount,
  gridScore,
  OFF_PATH_GEMS,
  PATH_MAX,
  PATH_MIN,
  reduceTrail,
  rockCount,
  TRAIL_GRIDS,
  TRAIL_GUARD_MS,
  TrailState,
} from '../game/trail/engine';

/** One tap, then the 150 ms guard. */
function tap(state: TrailState, cell: number): TrailState {
  return reduceTrail(reduceTrail(state, { type: 'tap', cell }), { type: 'tick', dt: TRAIL_GUARD_MS });
}

function walk(state: TrailState, cells: readonly number[]): TrailState {
  let s = state;
  for (const cell of cells) s = tap(s, cell);
  return s;
}

const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

describe("Fil d'Ariane engine (AC-84)", () => {
  /** A self-avoiding trail of orthogonal steps from start to exit, through every gem, on no rock. */
  function expectFullTrail(g: { start: number; exit: number; gems: readonly number[]; rocks: readonly number[] }, solution: readonly number[]) {
    expect(solution[0]).toBe(g.start);
    expect(solution[solution.length - 1]).toBe(g.exit);
    expect(new Set(solution).size).toBe(solution.length);
    for (let i = 1; i < solution.length; i++) expect(adjacent(solution[i - 1], solution[i])).toBe(true);
    for (const gem of g.gems) expect(solution).toContain(gem);
    expect(solution.some((c) => g.rocks.includes(c))).toBe(false);
  }

  it('AC-84: every grid has its start in the left column, its exit in the right column, a 12+ cell path, 1 + k gems on it and 2 next to it that one trail collects, 6 + k rocks off the path, the gems and that trail (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      let rngState = seed * 7919 + 1;
      for (let k = 1; k <= TRAIL_GRIDS; k++) {
        const g = buildGrid(rngState, k);
        rngState = g.rngState;
        expect(g.fallback).toBe(false);
        expect(colOf(g.start)).toBe(0);
        expect(colOf(g.exit)).toBe(5);
        expect(g.path[0]).toBe(g.start);
        expect(g.path[g.path.length - 1]).toBe(g.exit);
        expect(g.path.length).toBeGreaterThanOrEqual(PATH_MIN);
        expect(g.path.length).toBeLessThanOrEqual(PATH_MAX);
        expect(new Set(g.path).size).toBe(g.path.length); // self-avoiding
        for (let i = 1; i < g.path.length; i++) expect(adjacent(g.path[i - 1], g.path[i])).toBe(true);
        expect(g.gems).toHaveLength(gemCount(k));
        expect(new Set(g.gems).size).toBe(g.gems.length);
        const onPath = g.gems.filter((c) => g.path.includes(c));
        expect(onPath).toHaveLength(1 + k);
        expect(onPath.every((c) => c !== g.start && c !== g.exit)).toBe(true);
        const off = g.gems.filter((c) => !g.path.includes(c));
        expect(off).toHaveLength(OFF_PATH_GEMS);
        for (const c of off) expect(g.path.some((p) => adjacent(p, c))).toBe(true);
        expectFullTrail(g, g.solution);
        expect(g.rocks).toHaveLength(rockCount(k));
        expect(new Set(g.rocks).size).toBe(g.rocks.length);
        expect(g.rocks.some((c) => g.path.includes(c) || g.gems.includes(c))).toBe(false);
      }
    }
  });

  it('AC-86: the fallback grid is valid: its full trail collects both off-path gems from its path', () => {
    const start = FALLBACK.path[0];
    const exit = FALLBACK.path[FALLBACK.path.length - 1];
    expect(colOf(start)).toBe(0);
    expect(colOf(exit)).toBe(5);
    for (const c of FALLBACK.offPath) {
      expect(FALLBACK.path).not.toContain(c);
      expect(FALLBACK.path.some((p) => adjacent(p, c))).toBe(true);
    }
    for (const c of FALLBACK.path) expect(FALLBACK.solution).toContain(c); // any path gem is on it too
    expectFullTrail({ start, exit, gems: FALLBACK.offPath, rocks: [] }, FALLBACK.solution);
    expect(fullTrail(start, exit, [...FALLBACK.offPath, ...FALLBACK.path.slice(1, 7)], FALLBACK.path, GEN_STEPS)).not.toBeNull();
    expect(36 - FALLBACK.solution.length).toBeGreaterThanOrEqual(rockCount(TRAIL_GRIDS));
  });

  it('AC-86: the generator starts a round for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createTrail(seed);
      expect(state.status).toBe('playing');
      expect(state.trail).toEqual([state.start]);
    }
  });

  it('AC-84: the trail extends to free neighbours of its head only and steps back from its head', () => {
    const state = createTrail(12);
    const [start, second, third] = state.path;
    // A far cell, a rock and the start itself: nothing changes.
    const far = Array.from({ length: 36 }, (_, i) => i).find((c) => !adjacent(start, c) && c !== start) as number;
    expect(reduceTrail(state, { type: 'tap', cell: far }).events).toEqual([{ kind: 'blocked', cell: far }]);
    for (const rock of state.rocks) expect(reduceTrail(state, { type: 'tap', cell: rock }).trail).toBe(state.trail);
    expect(reduceTrail(state, { type: 'tap', cell: start }).trail).toBe(state.trail); // the start alone: no step back
    // Extend twice along the path; a tap on a trail cell that is not the head changes nothing.
    const two = walk(state, [second, third]);
    expect(two.trail).toEqual([start, second, third]);
    expect(reduceTrail(two, { type: 'tap', cell: start }).trail).toBe(two.trail);
    // A tap on the head steps back one cell.
    const back = tap(two, third);
    expect(back.trail).toEqual([start, second]);
    expect(back.events.length).toBe(0); // the tick after the tap
    expect(reduceTrail(two, { type: 'tap', cell: third }).events).toEqual([{ kind: 'back', cell: third }]);
    // Every rock next to the head is refused.
    const rockNext = state.rocks.find((r) => adjacent(r, second));
    if (rockNext !== undefined) expect(reduceTrail(walk(state, [second]), { type: 'tap', cell: rockNext }).trail).toEqual([start, second]);
  });

  it('AC-84: reaching the exit ends the grid with 50 per gem + 100 when all, a combo with every gem', () => {
    expect(gridScore(4, 4)).toBe(4 * GEM_POINTS + ALL_GEMS_BONUS);
    expect(gridScore(3, 4)).toBe(150);
    expect(gridScore(0, 4)).toBe(0);

    const state = createTrail(5);
    const all = walk(state, state.solution.slice(1));
    expect(all.grid).toBe(2);
    expect(all.score).toBe(gridScore(gemCount(1), gemCount(1)));
    expect(all.combos).toBe(1);
    expect(all.trail).toEqual([all.start]);

    // The seeded path alone holds 1 + k gems: 50 each, no bonus, no combo.
    const exitEvent = reduceTrail(walk(state, state.path.slice(1, -1)), { type: 'tap', cell: state.exit }).events.find((e) => e.kind === 'exit');
    expect(exitEvent).toEqual({ kind: 'exit', grid: 1, gems: 2, total: gemCount(1), points: GEM_POINTS * 2 });
    const pathOnly = walk(state, state.path.slice(1));
    expect(pathOnly.score).toBe(100);
    expect(pathOnly.combos).toBe(0);
  });

  it('AC-84: a gem stepped back off is no longer collected', () => {
    const state = createTrail(31);
    const firstGem = state.path.findIndex((c) => state.gems.includes(c));
    const onGem = walk(state, state.path.slice(1, firstGem + 1));
    expect(onGem.events.length).toBe(0);
    expect(reduceTrail(walk(state, state.path.slice(1, firstGem)), { type: 'tap', cell: state.path[firstGem] }).events).toEqual([
      { kind: 'extend', cell: state.path[firstGem], gem: true },
    ]);
    const back = tap(onGem, state.path[firstGem]);
    expect(back.trail).not.toContain(state.path[firstGem]);
  });

  it('AC-84: a hint gives the next path cell, or the head when the trail left the path; counts down, refused at 0', () => {
    const state = createTrail(44, { hint: 3 });
    const first = reduceTrail(state, { type: 'hint' });
    expect(first.hint).toBe(state.path[1]);
    expect(first.hintsLeft).toBe(2);
    expect(reduceTrail(first, { type: 'hint' }).hintsLeft).toBe(2); // one already shown
    // Leave the path: a free neighbour of the start that is not the next path cell.
    const off = [state.start + 6, state.start - 6, state.start + 1].find((c) => c >= 0 && c < 36 && adjacent(state.start, c) && c !== state.path[1] && !state.rocks.includes(c));
    if (off === undefined) throw new Error('seed 44 should allow leaving the path');
    const left = tap(first, off);
    expect(left.hint).toBeNull(); // a tap spends the shown hint
    const second = reduceTrail(left, { type: 'hint' });
    expect(second.hint).toBe(off); // the head: step back
    expect(second.hintsLeft).toBe(1);
    const third = reduceTrail(tap(second, off), { type: 'hint' });
    expect(third.hint).toBe(state.path[1]);
    expect(third.hintsLeft).toBe(0);
    const none = reduceTrail(tap(third, state.path[1]), { type: 'hint' });
    expect(none.hint).toBeNull();
    expect(none.hintsLeft).toBe(0);
    expect(createTrail(44).hintsLeft).toBe(0);
  });

  it('AC-86: taps less than 150 ms apart are ignored: a double tap does not extend then undo', () => {
    const state = createTrail(9);
    const once = reduceTrail(state, { type: 'tap', cell: state.path[1] });
    expect(once.trail).toHaveLength(2);
    const double = reduceTrail(once, { type: 'tap', cell: state.path[1] });
    expect(double.trail).toBe(once.trail);
    expect(double.events).toEqual([{ kind: 'ignored' }]);
    const almost = reduceTrail(once, { type: 'tick', dt: TRAIL_GUARD_MS - 1 });
    expect(reduceTrail(almost, { type: 'tap', cell: state.path[1] }).trail).toHaveLength(2);
    const ready = reduceTrail(almost, { type: 'tick', dt: 1 });
    expect(reduceTrail(ready, { type: 'tap', cell: state.path[1] }).trail).toHaveLength(1); // now a step back
    expect(reduceTrail(ready, { type: 'tick', dt: 50 })).toBe(ready);
  });

  it('AC-86: the casual bot takes an off-path gem only through a 2-cell detour (gem next to the head, back next to the next path cell)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const state = createTrail(seed);
      const route = botRoute(state);
      for (let i = 0; i < route.length; i++) {
        if (state.path.includes(route[i])) continue;
        // A detour cell is a gem next to the previous path cell, followed by one free cell next to the next path cell.
        expect(state.gems).toContain(route[i]);
        expect(state.path).toContain(i === 0 ? state.start : route[i - 1]);
        expect(state.path).not.toContain(route[i + 1]);
        expect(state.path).toContain(route[i + 2]);
        seen++;
        i++;
      }
      expect(route.filter((c) => state.path.includes(c))).toEqual(state.path.slice(1));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('AC-86: the casual bot (seeded path + 2-cell detours) has a median between 1 and 3 stars over 50 seeds', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 50; seed++) scores.push(playTrailBot(seed).score);
    // Measured: p10 1150, median 1300, p90 1650 (stars 600 / 1 000 / 1 400).
    expect(median(scores)).toBeGreaterThanOrEqual(600);
    expect(median(scores)).toBeLessThan(1400);
  });
});
