import {
  buildGrid,
  createPipes,
  E,
  filledCells,
  gridScore,
  hintCell,
  isSolved,
  N,
  openings,
  Piece,
  PIPES_CELLS,
  PIPES_FAIL_AFTER,
  PIPES_SIZE,
  PipesState,
  reducePipes,
  S,
  SOLVED_SHOW_MS,
  turnsToFit,
  W,
  WATER_RUN_MS,
  wateredCells,
  waterFront,
  waterOrder,
} from '../game/pipes/engine';

const tap = (state: PipesState, cell: number) => reducePipes(state, { type: 'tap', cell });
const tick = (state: PipesState, dt = 50) => reducePipes(state, { type: 'tick', dt });

/** Lets the solved grid's pause run out, frame by frame (50 ms steps). */
function settle(state: PipesState): PipesState {
  let s = state;
  for (let i = 0; i < 100 && s.solvedMs > 0; i++) s = tick(s);
  return s;
}

/** Turns every path cell right, in path order, with the minimal number of taps. */
function solve(state: PipesState): PipesState {
  let s = state;
  const grid = state.grid;
  for (const p of state.path) {
    const n = turnsToFit(s.pieces[p.cell], p.need) as number;
    for (let i = 0; i < n && s.grid === grid && s.solvedMs === 0; i++) s = tap(s, p.cell);
  }
  return s;
}

/** A cell outside the path whose turn does not solve the grid (wasted taps). */
function wastedTap(state: PipesState): number {
  const onPath = new Set(state.path.map((p) => p.cell));
  for (let cell = 0; cell < PIPES_CELLS; cell++) {
    if (onPath.has(cell)) continue;
    const pieces = state.pieces.slice();
    pieces[cell] = { ...pieces[cell], rot: pieces[cell].rot + 1 };
    if (!isSolved(pieces, state.entryRow, state.exitRow)) return cell;
  }
  throw new Error('no wasted tap');
}

const adjacent = (a: number, b: number) => Math.abs((a % PIPES_SIZE) - (b % PIPES_SIZE)) + Math.abs(Math.floor(a / PIPES_SIZE) - Math.floor(b / PIPES_SIZE)) === 1;

describe('Plombier Express engine (AC-62)', () => {
  it('AC-62: a tap turns the piece a quarter turn clockwise', () => {
    expect(openings({ kind: 'straight', rot: 0 })).toBe(E | W);
    expect(openings({ kind: 'straight', rot: 1 })).toBe(N | S);
    expect(openings({ kind: 'elbow', rot: 0 })).toBe(N | E);
    expect(openings({ kind: 'elbow', rot: 1 })).toBe(E | S);
    expect(openings({ kind: 'elbow', rot: 2 })).toBe(S | W);
    expect(openings({ kind: 'elbow', rot: 3 })).toBe(W | N);

    const state = createPipes(5);
    const cell = wastedTap(state);
    const next = tap(state, cell);
    expect(next.pieces[cell]).toEqual({ kind: state.pieces[cell].kind, rot: (state.pieces[cell].rot + 1) % 4 });
    expect(next.taps).toBe(1);
    expect(next.turns[cell]).toBe(1);
    expect(next.events).toEqual([{ kind: 'turn', cell }]);
  });

  it('AC-62: every grid has a seeded entry-to-exit path that connects once turned right, never starts solved, par ≥ 1 (500 seeds × 5 grids)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      let state = createPipes(seed * 104729);
      for (let k = 1; k <= 5; k++) {
        expect(state.grid).toBe(k);
        const { path, pieces, entryRow, exitRow } = state;
        // The path is self-avoiding, adjacent step to step, from the left of the entry row to the right of the exit row.
        expect(path[0].cell).toBe(entryRow * PIPES_SIZE);
        expect(path[path.length - 1].cell).toBe(exitRow * PIPES_SIZE + PIPES_SIZE - 1);
        expect(new Set(path.map((p) => p.cell)).size).toBe(path.length);
        for (let i = 1; i < path.length; i++) expect(adjacent(path[i - 1].cell, path[i].cell)).toBe(true);
        // Every path piece can be turned to its needed openings; par is the sum of the minimal clockwise turns.
        let par = 0;
        for (const p of path) {
          const t = turnsToFit(pieces[p.cell], p.need);
          expect(t).not.toBeNull();
          if (pieces[p.cell].kind === 'straight') expect(t).toBeLessThanOrEqual(1);
          par += t as number;
        }
        expect(state.par).toBe(par);
        expect(state.par).toBeGreaterThanOrEqual(1);
        expect(isSolved(pieces, entryRow, exitRow)).toBe(false);

        const before = state.score;
        state = solve(state);
        expect(state.events).toContainEqual(expect.objectContaining({ kind: 'solved', grid: k }));
        const solved = state.events.find((e) => e.kind === 'solved') as { taps: number; par: number; points: number };
        expect(solved.taps).toBeLessThanOrEqual(solved.par); // solved at par (or earlier through another path)
        expect(solved.points).toBe(300);
        expect(state.score).toBe(before + 300);
        state = settle(state);
      }
      expect(state.status).toBe('over');
      expect(state.score).toBe(1500);
      expect(state.combos).toBe(5);
    }
  });

  it('AC-62: grids are seeded (same seed, same grids)', () => {
    expect(buildGrid(77)).toEqual(buildGrid(77));
    expect(createPipes(77).pieces).toEqual(createPipes(77).pieces);
    expect(createPipes(77).pieces).not.toEqual(createPipes(78).pieces);
  });

  it('AC-62: solved detection follows any connected path, not only the seeded one', () => {
    // Row 2 made of straight pieces W–E: a straight line from entry row 2 to exit row 2.
    const pieces: Piece[] = Array.from({ length: PIPES_CELLS }, () => ({ kind: 'elbow', rot: 0 }));
    for (let c = 0; c < PIPES_SIZE; c++) pieces[2 * PIPES_SIZE + c] = { kind: 'straight', rot: 2 };
    expect(isSolved(pieces, 2, 2)).toBe(true);
    // Detour through row 1: elbow (W,N) at col 1 row 2... built as a U: (0,2) E–W, (1,2) W–N, (1,1) S–E, (2,1) W–E, (3,1) W–S, (3,2) N–E, (4,2) W–E.
    const detour = pieces.slice();
    const at = (c: number, r: number) => r * PIPES_SIZE + c;
    detour[at(1, 2)] = { kind: 'elbow', rot: 3 }; // W | N
    detour[at(1, 1)] = { kind: 'elbow', rot: 1 }; // E | S
    detour[at(2, 1)] = { kind: 'straight', rot: 0 };
    detour[at(3, 1)] = { kind: 'elbow', rot: 1 + 1 }; // S | W
    detour[at(3, 2)] = { kind: 'elbow', rot: 0 }; // N | E
    detour[at(2, 2)] = { kind: 'straight', rot: 1 }; // blocks the straight line
    expect(isSolved(detour, 2, 2)).toBe(true);
    const water = wateredCells(detour, 2);
    expect(water[at(2, 1)]).toBe(true);
    expect(water[at(2, 2)]).toBe(false);
    // The exit must open to the right side.
    const closed = pieces.slice();
    closed[at(4, 2)] = { kind: 'elbow', rot: 3 }; // W | N
    expect(isSolved(closed, 2, 2)).toBe(false);
    // The entry must open to the left side.
    const noEntry = pieces.slice();
    noEntry[at(0, 2)] = { kind: 'straight', rot: 1 };
    expect(wateredCells(noEntry, 2).some(Boolean)).toBe(false);
  });

  it('AC-62: the grid score is max(50, 300 − 15 × taps beyond par); a combo is a grid solved within par', () => {
    expect(gridScore(3, 3)).toBe(300);
    expect(gridScore(4, 3)).toBe(285);
    expect(gridScore(13, 3)).toBe(150);
    expect(gridScore(19, 3)).toBe(60);
    expect(gridScore(20, 3)).toBe(50);
    expect(gridScore(40, 3)).toBe(50);

    // Four wasted turns of the same off-path cell bring it back: solved in par + 4 taps → 240, no combo.
    let state = createPipes(12);
    const cell = wastedTap(state);
    for (let i = 0; i < 4; i++) state = tap(state, cell);
    const par = state.par;
    state = solve(state);
    const solved = state.events.find((e) => e.kind === 'solved') as { taps: number; points: number };
    expect(solved.taps).toBeLessThanOrEqual(par + 4);
    expect(solved.points).toBe(gridScore(solved.taps, par));
    expect(state.combos).toBe(solved.taps <= par ? 1 : 0);
    expect(state.events.filter((e) => e.kind === 'combo')).toHaveLength(solved.taps <= par ? 1 : 0);
    state = settle(state);
    expect(state.grid).toBe(2);
    expect(state.taps).toBe(0);
  });

  it('AC-62: a grid unsolved after par + 20 taps is failed with 0 points; the round ends after 5 grids', () => {
    let state = createPipes(31);
    const limit = state.par + PIPES_FAIL_AFTER;
    for (let i = 0; i < limit - 1; i++) state = tap(state, wastedTap(state));
    expect(state.grid).toBe(1);
    state = tap(state, wastedTap(state));
    expect(state.events).toContainEqual({ kind: 'failed', grid: 1 });
    expect(state.events).toContainEqual({ kind: 'grid', grid: 2 });
    expect(state.score).toBe(0);
    for (let k = 2; k <= 5; k++) while (state.grid === k && state.status === 'playing') state = tap(state, wastedTap(state));
    expect(state.status).toBe('over');
    expect(state.events).toContainEqual({ kind: 'over', score: 0 });
    expect(tap(state, 0).events).toEqual([]);
  });

  it('AC-62: « Indice » gives 1 / 2 / 3 hints; a hint shows a path cell not yet turned right and is not a tap', () => {
    expect(createPipes(1).hintsLeft).toBe(0);
    expect(reducePipes(createPipes(1), { type: 'hint' }).events).toEqual([]);
    for (let seed = 1; seed <= 200; seed++) {
      let state = createPipes(seed, { hint: 3 });
      expect(state.hintsLeft).toBe(3);
      state = reducePipes(state, { type: 'hint' });
      const cell = state.hint as number;
      const p = state.path.find((q) => q.cell === cell);
      expect(p).toBeDefined();
      expect(openings(state.pieces[cell])).not.toBe(p!.need);
      expect(state.taps).toBe(0);
      expect(state.hintsLeft).toBe(2);
      expect(cell).toBe(hintCell(state));
      // Refused while shown.
      expect(reducePipes(state, { type: 'hint' }).hintsLeft).toBe(2);
      // Turned right → the hint disappears (unless the grid was solved and replaced).
      const n = turnsToFit(state.pieces[cell], p!.need) as number;
      for (let i = 0; i < n; i++) state = tap(state, cell);
      if (state.grid === 1) expect(state.hint).toBeNull();
    }
  });
});

describe('Plombier Express solved grid shown (AC-88)', () => {
  it('AC-88: a solved grid stays on the board for 1 s with its points, then the next grid comes (50 ms frames)', () => {
    const start = createPipes(2026);
    const solved = solve(start);
    // Same grid, now solved, pieces kept; the points are counted at once (they pop on screen).
    expect(solved.grid).toBe(1);
    expect(solved.status).toBe('playing');
    expect(solved.solvedMs).toBe(SOLVED_SHOW_MS);
    expect(isSolved(solved.pieces, solved.entryRow, solved.exitRow)).toBe(true);
    expect(solved.events).toContainEqual(expect.objectContaining({ kind: 'solved', grid: 1, points: 300 }));
    expect(solved.events).toContainEqual({ kind: 'score', points: 300 });
    expect(solved.events.some((e) => e.kind === 'grid')).toBe(false);
    expect(solved.score).toBe(300);
    expect(solved.hint).toBeNull();

    let s = solved;
    for (let t = 50; t < SOLVED_SHOW_MS; t += 50) {
      s = tick(s);
      expect(s.grid).toBe(1);
      expect(s.pieces).toBe(solved.pieces);
      expect(s.solvedMs).toBe(SOLVED_SHOW_MS - t);
    }
    s = tick(s);
    expect(s.solvedMs).toBe(0);
    expect(s.grid).toBe(2);
    expect(s.taps).toBe(0);
    expect(s.score).toBe(300);
    expect(s.events).toEqual([{ kind: 'grid', grid: 2 }]);
    expect(s.pieces).not.toEqual(solved.pieces);
  });

  it('AC-88: taps and hints are ignored while the solved grid is shown (a double tap changes nothing)', () => {
    const solved = solve(createPipes(2026, { hint: 3 }));
    expect(solved.solvedMs).toBeGreaterThan(0);
    for (let cell = 0; cell < PIPES_CELLS; cell++) {
      const after = tap(tap(solved, cell), cell);
      expect(after.pieces).toEqual(solved.pieces);
      expect(after.taps).toBe(solved.taps);
      expect(after.score).toBe(solved.score);
      expect(after.grid).toBe(1);
      expect(after.solvedMs).toBe(solved.solvedMs);
      expect(after.events).toEqual([{ kind: 'ignored' }]);
    }
    const hinted = reducePipes(solved, { type: 'hint' });
    expect(hinted.hintsLeft).toBe(solved.hintsLeft);
    expect(hinted.hint).toBeNull();
    expect(hinted.events).toEqual([{ kind: 'ignored' }]);
    // A tick of 0 ms or a tick outside the pause changes nothing.
    expect(tick(solved, 0).solvedMs).toBe(solved.solvedMs);
    const playing = createPipes(2026);
    expect(tick(playing, 500)).toBe(playing);
  });

  it('AC-88: the water fills the connected pieces in path order, from the entry to the exit, then the whole pipe is held', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const solved = solve(createPipes(seed * 7919));
      const order = waterOrder(solved.pieces, solved.entryRow);
      const watered = wateredCells(solved.pieces, solved.entryRow);
      expect(order.map((o) => o >= 0)).toEqual(watered);
      // Each step of the water is one cell further: every filled cell (but the entry) touches a cell one step before.
      const entry = solved.entryRow * PIPES_SIZE;
      const exit = solved.exitRow * PIPES_SIZE + PIPES_SIZE - 1;
      expect(order[entry]).toBe(0);
      for (let cell = 0; cell < PIPES_CELLS; cell++) {
        if (order[cell] <= 0) continue;
        const before = [cell - 1, cell + 1, cell - PIPES_SIZE, cell + PIPES_SIZE].filter((c) => c >= 0 && c < PIPES_CELLS && adjacent(c, cell));
        expect(before.some((c) => order[c] === order[cell] - 1)).toBe(true);
      }
      // Frame by frame: only the entry at first, the filled set only grows, cells fill in their order, the exit is
      // reached within the run and everything connected is filled for the rest of the pause.
      let s = solved;
      let previous = filledCells(s);
      expect(previous.filter(Boolean)).toHaveLength(1);
      expect(previous[entry]).toBe(true);
      let exitAt = -1;
      for (let t = 50; t < SOLVED_SHOW_MS; t += 50) {
        s = tick(s);
        const now = filledCells(s);
        const front = waterFront(s);
        for (let cell = 0; cell < PIPES_CELLS; cell++) {
          if (previous[cell]) expect(now[cell]).toBe(true);
          expect(now[cell]).toBe(order[cell] >= 0 && order[cell] < front);
        }
        if (now[exit] && exitAt < 0) exitAt = t;
        if (t >= WATER_RUN_MS) expect(now).toEqual(watered);
        previous = now;
      }
      expect(exitAt).toBeGreaterThan(0);
      expect(exitAt).toBeLessThanOrEqual(WATER_RUN_MS);
      // Outside the pause, every connected cell is drawn with water.
      expect(filledCells(createPipes(seed))).toEqual(wateredCells(createPipes(seed).pieces, createPipes(seed).entryRow));
    }
  });

  it('AC-88: the 5th solved grid is shown 1 s too, then the round ends; a failed grid has no pause', () => {
    let state = createPipes(404);
    for (let k = 1; k <= 4; k++) state = settle(solve(state));
    expect(state.grid).toBe(5);
    state = solve(state);
    expect(state.status).toBe('playing');
    expect(state.solvedMs).toBe(SOLVED_SHOW_MS);
    expect(state.events.some((e) => e.kind === 'over')).toBe(false);
    state = settle(state);
    expect(state.status).toBe('over');
    expect(state.events).toEqual([{ kind: 'over', score: 1500 }]);

    let failing = createPipes(31);
    const limit = failing.par + PIPES_FAIL_AFTER;
    for (let i = 0; i < limit; i++) failing = tap(failing, wastedTap(failing));
    expect(failing.events).toContainEqual({ kind: 'failed', grid: 1 });
    expect(failing.grid).toBe(2);
    expect(failing.solvedMs).toBe(0);
  });
});
