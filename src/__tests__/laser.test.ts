import { ICON } from '../art/icons/laser';
import { gameById } from '../game/core/content';
import { playLaserBot } from '../game/laser/bot';
import {
  createLaser,
  FALLBACK,
  GEN_ATTEMPTS,
  generatePuzzle,
  generateWith,
  hintMirror,
  isSolved,
  LASER_BASE_TURNS,
  LASER_CELLS,
  LASER_FAIL_AFTER,
  LASER_FLIP_MS,
  LASER_MAX_MIRRORS,
  LASER_PUZZLES,
  LASER_SIZE,
  LaserPuzzle,
  LEAN_ATTEMPTS,
  parAim,
  LaserState,
  Lean,
  mirrorAt,
  otherLean,
  par,
  puzzleScore,
  reduceLaser,
  shortestSolution,
  SOLVED_SHOW_MS,
  traceBeam,
} from '../game/laser/engine';

const at = (col: number, row: number) => row * LASER_SIZE + col;

/** One flip, then the 120 ms of its animation. */
function play(state: LaserState, mirror: number): LaserState {
  return reduceLaser(reduceLaser(state, { type: 'flip', mirror }), { type: 'tick', dt: LASER_FLIP_MS });
}

/** Flips a shortest solution: the puzzle is then solved and shown. */
function playSolution(state: LaserState): LaserState {
  let s = state;
  for (const mirror of shortestSolution(state.board, state.leans) ?? []) s = play(s, mirror);
  return s;
}

/** A mirror whose flip alone does not solve the puzzle: flipping it twice wastes two flips. */
function idleMirror(state: LaserState): number {
  const mirror = state.leans.findIndex((_, m) => !isSolved(state.board, state.leans.map((lean, i) => (i === m ? otherLean(lean) : lean))));
  if (mirror < 0) throw new Error('every mirror solves the puzzle');
  return mirror;
}

/**
 * Independent brute force (its own beam on vectors, not the engine's tables): every lean of the mirrors is tried;
 * returns whether the given leans solve, the fewest flips to a solving lean, and the turns of each solving beam.
 */
function bruteForce(puzzle: LaserPuzzle, leans: readonly Lean[]) {
  const reach = (current: readonly Lean[]): number | null => {
    let x = 0;
    let y = puzzle.entryRow;
    let dx = 1;
    let dy = 0;
    let turns = 0;
    for (let steps = 0; steps < 1000 && x >= 0 && x < 6 && y >= 0 && y < 6; steps++) {
      if (y * 6 + x === puzzle.target) return turns;
      const m = puzzle.mirrors.indexOf(y * 6 + x);
      if (m >= 0) {
        // « / » swaps and negates the vector, « \ » swaps it (y grows downwards).
        [dx, dy] = current[m] === 'slash' ? [-dy, -dx] : [dy, dx];
        turns += 1;
      }
      x += dx;
      y += dy;
    }
    return null;
  };
  const n = puzzle.mirrors.length;
  let fewest = Infinity;
  const solvingTurns = new Set<number>();
  for (let mask = 0; mask < 1 << n; mask++) {
    const turns = reach(leans.map((lean, i) => ((mask >> i) & 1 ? otherLean(lean) : lean)));
    if (turns === null) continue;
    solvingTurns.add(turns);
    let bits = 0;
    for (let i = 0; i < n; i++) bits += (mask >> i) & 1;
    fewest = Math.min(fewest, bits);
  }
  return { solved: reach(leans) !== null, fewest, solvingTurns };
}

const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

const onEdge = (cell: number) => cell % LASER_SIZE === 0 || cell % LASER_SIZE === LASER_SIZE - 1 || cell < LASER_SIZE || cell >= LASER_CELLS - LASER_SIZE;

describe('Miroirs et Laser engine (AC-106)', () => {
  it('AC-106: the beam goes straight through empty cells and stops when it leaves the grid', () => {
    const beam = traceBeam({ entryRow: 3, target: at(0, 0), mirrors: [] }, []);
    expect(beam.cells).toEqual([at(0, 3), at(1, 3), at(2, 3), at(3, 3), at(4, 3), at(5, 3)]);
    expect(beam.reached).toBe(false);
    expect(beam.steps.every((s) => s.inDir === 'E' && s.outDir === 'E')).toBe(true);
    // A mirror off the beam changes nothing.
    expect(traceBeam({ entryRow: 3, target: at(0, 0), mirrors: [at(2, 1)] }, ['slash']).cells).toEqual(beam.cells);
  });

  it('AC-106: the beam turns on « / » and « \\ » as the lean says, from each of the 4 directions', () => {
    const far = at(5, 5); // a target none of these beams meets
    // Heading east at (3, 2): « / » sends it north, « \ » south.
    expect(traceBeam({ entryRow: 2, target: far, mirrors: [at(3, 2)] }, ['slash']).cells).toEqual([at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(3, 1), at(3, 0)]);
    expect(traceBeam({ entryRow: 2, target: at(0, 0), mirrors: [at(3, 2)] }, ['backslash']).cells).toEqual([at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(3, 3), at(3, 4), at(3, 5)]);
    // Heading south at (2, 3) (after « \ » at (2, 0)): « / » sends it west, « \ » east.
    const south: LaserPuzzle = { entryRow: 0, target: far, mirrors: [at(2, 0), at(2, 3)] };
    expect(traceBeam(south, ['backslash', 'slash']).cells).toEqual([at(0, 0), at(1, 0), at(2, 0), at(2, 1), at(2, 2), at(2, 3), at(1, 3), at(0, 3)]);
    expect(traceBeam(south, ['backslash', 'backslash']).cells).toEqual([at(0, 0), at(1, 0), at(2, 0), at(2, 1), at(2, 2), at(2, 3), at(3, 3), at(4, 3), at(5, 3)]);
    // Heading north at (2, 2) (after « / » at (2, 5)): « / » sends it east, « \ » west.
    const north: LaserPuzzle = { entryRow: 5, target: at(0, 0), mirrors: [at(2, 5), at(2, 2)] };
    expect(traceBeam(north, ['slash', 'slash']).cells).toEqual([at(0, 5), at(1, 5), at(2, 5), at(2, 4), at(2, 3), at(2, 2), at(3, 2), at(4, 2), at(5, 2)]);
    expect(traceBeam(north, ['slash', 'backslash']).cells).toEqual([at(0, 5), at(1, 5), at(2, 5), at(2, 4), at(2, 3), at(2, 2), at(1, 2), at(0, 2)]);
    // Heading west at (1, 2) (after « \ » at (4, 0) and « / » at (4, 2)): « / » sends it south, « \ » north.
    const west: LaserPuzzle = { entryRow: 0, target: far, mirrors: [at(4, 0), at(4, 2), at(1, 2)] };
    const lead = [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0), at(4, 1), at(4, 2), at(3, 2), at(2, 2), at(1, 2)];
    expect(traceBeam(west, ['backslash', 'slash', 'slash']).cells).toEqual([...lead, at(1, 3), at(1, 4), at(1, 5)]);
    expect(traceBeam(west, ['backslash', 'slash', 'backslash']).cells).toEqual([...lead, at(1, 1), at(1, 0)]);
    // The headings of each step follow the turns.
    const steps = traceBeam(west, ['backslash', 'slash', 'slash']).steps;
    expect(steps[4]).toEqual({ cell: at(4, 0), inDir: 'E', outDir: 'S' });
    expect(steps[6]).toEqual({ cell: at(4, 2), inDir: 'S', outDir: 'W' });
    expect(steps[9]).toEqual({ cell: at(1, 2), inDir: 'W', outDir: 'S' });
    expect(traceBeam(west, ['backslash', 'slash', 'slash']).reached).toBe(false);
  });

  it('AC-106: the puzzle is solved when the beam enters the target, where it stops', () => {
    const puzzle: LaserPuzzle = { entryRow: 2, target: at(3, 0), mirrors: [at(3, 2)] };
    const lit = traceBeam(puzzle, ['slash']);
    expect(lit.reached).toBe(true);
    expect(lit.cells).toEqual([at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(3, 1), at(3, 0)]);
    expect(lit.steps[lit.steps.length - 1]).toEqual({ cell: at(3, 0), inDir: 'N', outDir: null });
    expect(traceBeam(puzzle, ['backslash']).reached).toBe(false);
    expect(isSolved(puzzle, ['slash'])).toBe(true);
    expect(par(puzzle, ['slash'])).toBe(0);
    expect(par(puzzle, ['backslash'])).toBe(1);
    expect(par({ entryRow: 2, target: at(0, 5), mirrors: [at(3, 2)] }, ['slash'])).toBe(Infinity);
    expect(mirrorAt(puzzle, at(3, 2))).toBe(0);
    expect(mirrorAt(puzzle, at(3, 3))).toBe(-1);
  });

  it('AC-106: every generated puzzle starts unsolved and is solvable in exactly its par (brute force, 100 seeded rounds)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let rngState = seed * 7919;
      for (let k = 1; k <= LASER_PUZZLES; k++) {
        const g = generatePuzzle(rngState, k);
        rngState = g.rngState;
        expect(g.fallback).toBe(false);
        expect(g.attempts).toBeLessThanOrEqual(GEN_ATTEMPTS);
        // 2 + k mirrors of the path and k decoys, on different cells; the target is an edge cell without a mirror.
        expect(g.puzzle.mirrors).toHaveLength(LASER_BASE_TURNS + 2 * k);
        expect(g.puzzle.mirrors.length).toBeLessThanOrEqual(LASER_MAX_MIRRORS);
        expect(new Set(g.puzzle.mirrors).size).toBe(g.puzzle.mirrors.length);
        expect(g.puzzle.mirrors.every((c) => c >= 0 && c < LASER_CELLS)).toBe(true);
        expect(g.leans).toHaveLength(g.puzzle.mirrors.length);
        expect(onEdge(g.puzzle.target)).toBe(true);
        expect(g.puzzle.mirrors).not.toContain(g.puzzle.target);
        expect(g.puzzle.entryRow).toBeGreaterThanOrEqual(0);
        expect(g.puzzle.entryRow).toBeLessThan(LASER_SIZE);

        const brute = bruteForce(g.puzzle, g.leans);
        expect(traceBeam(g.puzzle, g.leans).reached).toBe(false);
        expect(brute.solved).toBe(false);
        expect(g.par).toBeGreaterThanOrEqual(1);
        expect(g.par).toBe(brute.fewest);
        expect(par(g.puzzle, g.leans)).toBe(brute.fewest);
        // The seeded path with 2 + k turns is one of the solving beams.
        expect(brute.solvingTurns.has(LASER_BASE_TURNS + k)).toBe(true);
        // The shortest solution of the engine has par flips and brings the beam to the target.
        const solution = shortestSolution(g.puzzle, g.leans) as number[];
        expect(solution).toHaveLength(g.par);
        expect(traceBeam(g.puzzle, g.leans.map((lean, i) => (solution.includes(i) ? otherLean(lean) : lean))).reached).toBe(true);
      }
    }
  }, 120_000);

  it('AC-106: the kept lean draw is the unsolved one with the highest par, puzzle k aiming at par min(k + 1, 4)', () => {
    expect([1, 2, 3, 4, 5].map(parAim)).toEqual([2, 3, 4, 4, 4]);
    expect(LEAN_ATTEMPTS).toBeLessThanOrEqual(20); // bounded draws
    let reached = 0;
    let total = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let rngState = seed * 7919;
      for (let k = 1; k <= LASER_PUZZLES; k++) {
        const turns = LASER_BASE_TURNS + k;
        // Same seed, same path: without an aim the first unsolved draw is kept; aiming never gives a lower par, and
        // an aim out of reach keeps the best of all the draws.
        const first = generateWith(rngState, turns, k, 1);
        const aimed = generatePuzzle(rngState, k);
        const best = generateWith(rngState, turns, k, 99);
        expect(aimed.puzzle).toEqual(first.puzzle);
        expect(best.puzzle).toEqual(first.puzzle);
        expect(aimed.par).toBeGreaterThanOrEqual(first.par);
        expect(best.par).toBeGreaterThanOrEqual(aimed.par);
        if (first.par >= parAim(k)) expect(aimed.leans).toEqual(first.leans); // stops at the first draw at the aim
        if (aimed.par < parAim(k)) expect(aimed.par).toBe(best.par); // below the aim only when no draw reaches it
        expect(isSolved(best.puzzle, best.leans)).toBe(false);
        expect(best.par).toBe(bruteForce(best.puzzle, best.leans).fewest);
        if (aimed.par >= parAim(k)) reached += 1;
        total += 1;
        rngState = aimed.rngState;
      }
    }
    // Measured over 2 000 seeds: the aim is reached by 99 %, 89 %, 79 %, 73 % and 71 % of puzzles 1 to 5.
    expect(reached / total).toBeGreaterThan(0.7);
  }, 120_000);

  it('AC-106 / AC-108: the generator is bounded: an impossible request falls back to the fixed puzzle', () => {
    for (const [turns, decoys] of [[30, 0], [LASER_MAX_MIRRORS, 1], [0, 2]]) {
      const g = generateWith(9, turns, decoys);
      expect(g.fallback).toBe(true);
      expect(g.attempts).toBe(GEN_ATTEMPTS);
      expect(g.puzzle).toBe(FALLBACK.puzzle);
      expect(g.leans).toEqual(FALLBACK.leans);
    }
    // 12 turns fit the search bound but rarely fit the grid: whatever comes out is a sound puzzle.
    const tight = generateWith(9, LASER_MAX_MIRRORS, 0);
    expect(tight.par).toBe(bruteForce(tight.puzzle, tight.leans).fewest);
    const brute = bruteForce(FALLBACK.puzzle, FALLBACK.leans);
    expect(brute.solved).toBe(false);
    expect(brute.fewest).toBe(3);
    expect(par(FALLBACK.puzzle, FALLBACK.leans)).toBe(3);
    expect(onEdge(FALLBACK.puzzle.target)).toBe(true);
  });

  it('AC-108: the generator starts a round for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createLaser(seed * 104_729);
      expect(state.status).toBe('playing');
      expect(state.puzzle).toBe(1);
      expect(state.flips).toBe(0);
      expect(isSolved(state.board, state.leans)).toBe(false);
      expect(state.par).toBe(par(state.board, state.leans));
      expect(state.par).toBeGreaterThanOrEqual(1);
    }
  });

  it('AC-106: a tap flips the mirror to the other lean and counts one flip', () => {
    const state = createLaser(42);
    const mirror = idleMirror(state);
    const flipped = reduceLaser(state, { type: 'flip', mirror });
    expect(flipped.leans[mirror]).toBe(otherLean(state.leans[mirror]));
    expect(flipped.leans.filter((lean, i) => lean !== state.leans[i])).toHaveLength(1);
    expect(flipped.flips).toBe(1);
    expect(flipped.events).toEqual([{ kind: 'flip', mirror, lean: flipped.leans[mirror] }]);
    expect(state.leans[mirror]).not.toBe(flipped.leans[mirror]); // the previous state is untouched
    const back = play(reduceLaser(flipped, { type: 'tick', dt: LASER_FLIP_MS }), mirror);
    expect(back.leans).toEqual(state.leans);
    expect(back.flips).toBe(2);
    // Not a mirror: nothing changes.
    for (const bad of [-1, state.leans.length, 1.5, Number.NaN]) {
      const refused = reduceLaser(state, { type: 'flip', mirror: bad });
      expect(refused.leans).toBe(state.leans);
      expect(refused.flips).toBe(0);
    }
  });

  it('AC-106: scoring is max(50, 300 − 30 per flip beyond par); a puzzle at par is a combo', () => {
    expect(puzzleScore(3, 3)).toBe(300);
    expect(puzzleScore(2, 3)).toBe(300);
    expect(puzzleScore(4, 3)).toBe(270);
    expect(puzzleScore(3 + 8, 3)).toBe(60);
    expect(puzzleScore(3 + 9, 3)).toBe(50);
    expect(puzzleScore(3 + 20, 3)).toBe(50);

    const state = createLaser(5);
    const atPar = playSolution(state);
    expect(atPar.flips).toBe(state.par);
    expect(atPar.score).toBe(300);
    expect(atPar.combos).toBe(1);
    const idle = idleMirror(state);
    const late = playSolution(play(play(state, idle), idle));
    expect(late.flips).toBe(state.par + 2);
    expect(late.score).toBe(240);
    expect(late.combos).toBe(0);
  });

  it('AC-106: a puzzle still unsolved after par + 10 flips is failed (0 points) and the next one starts', () => {
    let s = createLaser(8);
    const limit = s.par + LASER_FAIL_AFTER;
    const mirror = idleMirror(s);
    for (let i = 0; i < limit - 1; i++) s = play(s, mirror);
    expect(s.puzzle).toBe(1);
    expect(s.flips).toBe(limit - 1);
    const failed = reduceLaser(s, { type: 'flip', mirror });
    expect(failed.events).toContainEqual({ kind: 'failed', puzzle: 1 });
    expect(failed.events).toContainEqual({ kind: 'puzzle', puzzle: 2 });
    expect(failed.events.some((e) => e.kind === 'score')).toBe(false);
    expect(failed.score).toBe(0);
    expect(failed.puzzle).toBe(2);
    expect(failed.flips).toBe(0);
    expect(failed.solvedMs).toBe(0); // a failed puzzle is not shown: the next one comes at once
    // The last flip allowed still scores when it solves: par + 9 wasted flips are too many, par + 8 leave room.
    let t = createLaser(8);
    for (let i = 0; i < LASER_FAIL_AFTER - 2; i++) t = play(t, mirror);
    const solved = playSolution(t);
    expect(solved.flips).toBe(limit - 2);
    expect(solved.score).toBe(puzzleScore(limit - 2, solved.par));
    expect(solved.score).toBe(60);
  });

  it('AC-106: a hint highlights a mirror to flip on a shortest solution, counts down and is refused at 0', () => {
    for (const seed of [3, 4, 5, 6, 7]) {
      const state = createLaser(seed, { hint: 2 });
      expect(state.hintsLeft).toBe(2);
      const hinted = reduceLaser(state, { type: 'hint' });
      const mirror = hinted.hint as number;
      expect(mirror).toBe(hintMirror(state.board, state.leans));
      expect(hinted.events).toEqual([{ kind: 'hint', mirror }]);
      expect(hinted.hintsLeft).toBe(1);
      expect(hinted.flips).toBe(0); // a hint is not a flip
      // A second hint while one is shown is refused.
      expect(reduceLaser(hinted, { type: 'hint' }).hintsLeft).toBe(1);
      // Flipping the hinted mirror brings the puzzle one flip closer to solved (brute force), and the hint is spent.
      const after = reduceLaser(hinted, { type: 'flip', mirror });
      expect(bruteForce(after.board, after.leans).fewest).toBe(state.par - 1);
      expect(after.hint).toBeNull();
    }
    const state = createLaser(3, { hint: 1 });
    const spent = play(reduceLaser(state, { type: 'hint' }), idleMirror(state));
    expect(spent.hintsLeft).toBe(0);
    const none = reduceLaser(spent, { type: 'hint' });
    expect(none.hint).toBeNull();
    expect(none.hintsLeft).toBe(0);
    expect(createLaser(3).hintsLeft).toBe(0);
    expect(reduceLaser(createLaser(3), { type: 'hint' }).hint).toBeNull();
    expect(createLaser(3, { hint: 3 }).hintsLeft).toBe(3);
  });

  it('AC-106: a solved puzzle stays 800 ms with the beam on the target; a round is 5 puzzles', () => {
    let s = createLaser(77);
    for (let k = 1; k <= LASER_PUZZLES; k++) {
      expect(s.puzzle).toBe(k);
      const { par: parFlips } = s;
      const solution = shortestSolution(s.board, s.leans) as number[];
      for (const mirror of solution.slice(0, -1)) s = play(s, mirror);
      const solved = reduceLaser(s, { type: 'flip', mirror: solution[solution.length - 1] });
      expect(solved.events).toContainEqual({ kind: 'solved', puzzle: k, flips: parFlips, par: parFlips, points: 300 });
      expect(solved.events).toContainEqual({ kind: 'score', points: 300 });
      expect(solved.events).toContainEqual({ kind: 'combo' });
      // The solved puzzle stays on the board, the beam on its target.
      expect(solved.puzzle).toBe(k);
      expect(solved.status).toBe('playing');
      expect(solved.solvedMs).toBe(SOLVED_SHOW_MS);
      expect(traceBeam(solved.board, solved.leans).reached).toBe(true);
      expect(solved.score).toBe(300 * k);
      // Taps and hints meanwhile change nothing, even after the 120 ms of the flip.
      const shown = reduceLaser(solved, { type: 'tick', dt: SOLVED_SHOW_MS - 1 });
      expect(shown.puzzle).toBe(k);
      expect(shown.solvedMs).toBe(1);
      const tapped = reduceLaser(shown, { type: 'flip', mirror: 0 });
      expect(tapped.leans).toBe(shown.leans);
      expect(tapped.flips).toBe(parFlips);
      expect(tapped.events).toEqual([{ kind: 'ignored' }]);
      expect(reduceLaser({ ...shown, hintsLeft: 1 }, { type: 'hint' }).hint).toBeNull();
      s = reduceLaser(shown, { type: 'tick', dt: 1 });
      if (k < LASER_PUZZLES) {
        expect(s.events).toEqual([{ kind: 'puzzle', puzzle: k + 1 }]);
        expect(s.flips).toBe(0);
        expect(s.solvedMs).toBe(0);
        expect(isSolved(s.board, s.leans)).toBe(false);
      }
    }
    expect(s.status).toBe('over');
    expect(s.events).toEqual([{ kind: 'over', score: 1500 }]);
    expect(s.score).toBe(LASER_PUZZLES * 300);
    expect(s.combos).toBe(LASER_PUZZLES);
    // A finished round ignores everything.
    const after = reduceLaser(s, { type: 'flip', mirror: 0 });
    expect(after.score).toBe(1500);
    expect(after.events).toEqual([]);
    expect(reduceLaser(after, { type: 'tick', dt: 50 })).toBe(after);
  });

  it('AC-106: the same seed gives the same round, another seed another one', () => {
    expect(createLaser(123)).toEqual(createLaser(123));
    expect(playLaserBot(9)).toEqual(playLaserBot(9));
    const boards = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(createLaser(seed).board)));
    expect(boards.size).toBeGreaterThan(1);
  });

  it('AC-108: a tap during the 120 ms flip is ignored (double tap changes nothing)', () => {
    const state = createLaser(21);
    const mirror = idleMirror(state);
    const flipped = reduceLaser(state, { type: 'flip', mirror });
    expect(flipped.flips).toBe(1);
    expect(flipped.flipMs).toBe(LASER_FLIP_MS);
    const double = reduceLaser(flipped, { type: 'flip', mirror });
    expect(double.leans).toBe(flipped.leans);
    expect(double.flips).toBe(1);
    expect(double.score).toBe(flipped.score);
    expect(double.events).toEqual([{ kind: 'ignored' }]);
    const almost = reduceLaser(flipped, { type: 'tick', dt: LASER_FLIP_MS - 10 });
    expect(reduceLaser(almost, { type: 'flip', mirror }).flips).toBe(1);
    const done = reduceLaser(almost, { type: 'tick', dt: 10 });
    expect(reduceLaser(done, { type: 'flip', mirror }).flips).toBe(2);
    // A tick without a flip in progress returns the same state (no re-render).
    expect(reduceLaser(done, { type: 'tick', dt: 50 })).toBe(done);
  });

  it('AC-108: the casual bot (shortest flip, 40 % random mirror) has a median between 1 and 3 stars over 50 seeds, and every seed finishes', () => {
    const { stars } = gameById('laser');
    const scores: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const final = playLaserBot(seed);
      expect(final.status).toBe('over');
      expect(final.puzzle).toBe(LASER_PUZZLES);
      scores.push(final.score);
    }
    // Measured: min 690, p25 1020, median 1165, p90 1350, max 1470 (maximum possible 1 500).
    expect(median(scores)).toBeGreaterThanOrEqual(stars[0]);
    expect(median(scores)).toBeLessThan(stars[2]);
    expect(Math.max(...scores)).toBeLessThanOrEqual(LASER_PUZZLES * 300);
  }, 120_000);

  it('the icon is a 12 × 12 sprite', () => {
    expect(ICON.rows).toHaveLength(12);
    for (const row of ICON.rows) {
      expect(row).toHaveLength(12);
      for (const ch of row) expect(ch === '.' || ch in ICON.legend).toBe(true);
    }
  });
});
