// Miroirs et Laser: flip mirrors to bring a laser beam to its target on a 6 × 6 grid (docs/PRD.md "Miroirs et
// Laser", AC-106). Pure reducer on an immutable state, see src/game/contract.ts. Cells are indexed
// `row * LASER_SIZE + col`, row 0 at the top. The beam enters the left edge of a seeded row heading east, goes
// straight through empty cells, turns a quarter turn on a mirror (« / » or « \ », two-sided) and stops when it leaves
// the grid or enters the target cell (an edge cell without a mirror, which takes the beam from any side).
//
// Puzzle k (1..5): a seeded beam path with 2 + k turns gets its mirrors (a mirror never sits on a cell the path
// crosses elsewhere, the path never crosses the target before its end), k decoy mirrors go on cells off the path,
// then every mirror gets a seeded lean: among a bounded number of draws (LEAN_ATTEMPTS) the unsolved one with the
// highest par is kept, puzzle k aiming at par k + 1 (4 at most; the draws stop as soon as one reaches it). Par is the
// minimum number of flips that solve it, found by a search over every lean of the mirrors (at most 2^12 beams). The
// generator is bounded: GEN_ATTEMPTS paths, then the fixed FALLBACK puzzle.
//
// The 120 ms flip (input guard) and the 800 ms show of a solved puzzle are ms counters advanced by `tick`.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import type { Rng } from '../rng';

export const LASER_SIZE = 6;
export const LASER_CELLS = LASER_SIZE * LASER_SIZE;
export const LASER_PUZZLES = 5;
/** Puzzle k has LASER_BASE_TURNS + k turns on its path and k decoy mirrors. */
export const LASER_BASE_TURNS = 2;
/** The par search tries every lean of the mirrors: never more mirrors than this. */
export const LASER_MAX_MIRRORS = 12;
/** Points of a puzzle solved at par, lost per flip beyond par, and kept whatever the flips. */
export const LASER_PUZZLE_POINTS = 300;
export const LASER_FLIP_PENALTY = 30;
export const LASER_MIN_POINTS = 50;
/** Flips beyond par after which an unsolved puzzle is failed. */
export const LASER_FAIL_AFTER = 10;
/** A mirror flips in 120 ms; a tap meanwhile is ignored (input guard). */
export const LASER_FLIP_MS = 120;
/** A solved puzzle stays shown this long, the beam on the target, before the next puzzle. */
export const SOLVED_SHOW_MS = 800;
/** Generator bounds: paths tried per puzzle, lean draws tried per path. */
export const GEN_ATTEMPTS = 40;
export const LEAN_ATTEMPTS = 20;
/** Puzzle k aims at par k + 1, this much at most. */
export const LASER_MAX_PAR_AIM = 4;
/** Loop guard of the beam: a cell is crossed at most once per heading. */
export const MAX_BEAM_STEPS = 4 * LASER_CELLS;

export type Lean = 'slash' | 'backslash';
export type Dir = 'E' | 'S' | 'W' | 'N';

const STEP: Record<Dir, { dc: number; dr: number }> = { E: { dc: 1, dr: 0 }, S: { dc: 0, dr: 1 }, W: { dc: -1, dr: 0 }, N: { dc: 0, dr: -1 } };
/** New heading of a beam that meets a mirror: « / » sends east to north, « \ » sends east to south. */
const TURN: Record<Lean, Record<Dir, Dir>> = {
  slash: { E: 'N', N: 'E', W: 'S', S: 'W' },
  backslash: { E: 'S', S: 'E', W: 'N', N: 'W' },
};
const SIDEWAYS: Record<Dir, readonly [Dir, Dir]> = { E: ['N', 'S'], W: ['N', 'S'], N: ['E', 'W'], S: ['E', 'W'] };
const LEANS: readonly Lean[] = ['slash', 'backslash'];

export const otherLean = (lean: Lean): Lean => (lean === 'slash' ? 'backslash' : 'slash');

/** The fixed part of a puzzle; the leans of its mirrors (same order as `mirrors`) are the part the player changes. */
export type LaserPuzzle = {
  /** The beam enters cell (0, entryRow) heading east. */
  entryRow: number;
  /** Target cell, on an edge of the grid. */
  target: number;
  /** Cells holding a mirror. */
  mirrors: readonly number[];
};

/** One cell crossed by the beam: heading when it enters, heading when it leaves (null: it stops on the target). */
export type BeamStep = { cell: number; inDir: Dir; outDir: Dir | null };
export type Beam = { cells: number[]; steps: BeamStep[]; reached: boolean };

/**
 * The beam of a puzzle for the given leans: the cells crossed from the entry, in order, and whether the target is
 * reached. The beam stops when it leaves the grid or on the target; MAX_BEAM_STEPS guards against a loop.
 */
export function traceBeam(puzzle: LaserPuzzle, leans: readonly Lean[]): Beam {
  const mirrorOf = new Array<number>(LASER_CELLS).fill(-1);
  puzzle.mirrors.forEach((cell, i) => {
    mirrorOf[cell] = i;
  });
  const steps: BeamStep[] = [];
  const cells: number[] = [];
  let col = 0;
  let row = puzzle.entryRow;
  let dir: Dir = 'E';
  while (col >= 0 && col < LASER_SIZE && row >= 0 && row < LASER_SIZE && steps.length < MAX_BEAM_STEPS) {
    const cell = row * LASER_SIZE + col;
    cells.push(cell);
    if (cell === puzzle.target) {
      steps.push({ cell, inDir: dir, outDir: null });
      return { cells, steps, reached: true };
    }
    const mirror = mirrorOf[cell];
    const outDir: Dir = mirror >= 0 ? TURN[leans[mirror]][dir] : dir;
    steps.push({ cell, inDir: dir, outDir });
    dir = outDir;
    col += STEP[dir].dc;
    row += STEP[dir].dr;
  }
  return { cells, steps, reached: false };
}

export function isSolved(puzzle: LaserPuzzle, leans: readonly Lean[]): boolean {
  return traceBeam(puzzle, leans).reached;
}

/**
 * Mirrors to flip (indices, ascending) in a shortest solution from the given leans: every subset of mirrors is
 * tried, the smallest one that brings the beam to the target wins (the first found in counting order on a tie).
 * [] when already solved, null when no lean of the mirrors solves the puzzle.
 */
export function shortestSolution(puzzle: LaserPuzzle, leans: readonly Lean[]): number[] | null {
  const n = puzzle.mirrors.length;
  if (n > LASER_MAX_MIRRORS) return null;
  let best: number[] | null = null;
  for (let mask = 0; mask < 1 << n; mask++) {
    const flipped: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) flipped.push(i);
    if (best !== null && flipped.length >= best.length) continue;
    if (isSolved(puzzle, leans.map((lean, i) => (mask & (1 << i) ? otherLean(lean) : lean)))) best = flipped;
  }
  return best;
}

/** Par: the minimum number of flips that solve the puzzle from the given leans (Infinity when nothing solves it). */
export function par(puzzle: LaserPuzzle, leans: readonly Lean[]): number {
  return shortestSolution(puzzle, leans)?.length ?? Infinity;
}

/** A mirror to flip on a shortest solution (the hint), or null when solved or unsolvable. */
export function hintMirror(puzzle: LaserPuzzle, leans: readonly Lean[]): number | null {
  const solution = shortestSolution(puzzle, leans);
  return solution && solution.length > 0 ? solution[0] : null;
}

/** Index of the mirror on a cell, or -1. */
export function mirrorAt(puzzle: LaserPuzzle, cell: number): number {
  return puzzle.mirrors.indexOf(cell);
}

export function puzzleScore(flips: number, parFlips: number): number {
  return Math.max(LASER_MIN_POINTS, LASER_PUZZLE_POINTS - LASER_FLIP_PENALTY * Math.max(0, flips - parFlips));
}

/**
 * The fixed fallback puzzle: the beam of row 2 goes up column 2, along row 0 and down column 4 to the bottom edge
 * (3 path mirrors, all leaning the wrong way, 2 decoys).
 */
export const FALLBACK: { puzzle: LaserPuzzle; leans: readonly Lean[] } = {
  puzzle: { entryRow: 2, target: 5 * LASER_SIZE + 4, mirrors: [2 * LASER_SIZE + 2, 2, 4, 3 * LASER_SIZE + 3, 4 * LASER_SIZE] },
  leans: ['backslash', 'backslash', 'slash', 'slash', 'backslash'],
};

const inside = (col: number, row: number) => col >= 0 && col < LASER_SIZE && row >= 0 && row < LASER_SIZE;

type Path = { entryRow: number; target: number; mirrors: number[]; leans: Lean[]; crossed: Set<number> };

/**
 * One seeded beam path with `turns` turns, or null when the walk gets stuck. Each leg runs from the last mirror (or
 * the entry) to a seeded cell ahead that the path has not crossed, where a mirror turns it to a seeded side that
 * stays inside the grid; a leg never runs through a mirror. The last leg runs to the edge: its last cell is the
 * target, which the path must not have crossed before.
 */
function seededPath(rng: Rng, turns: number): Path | null {
  const entryRow = rng.int(LASER_SIZE);
  const mirrors: number[] = [];
  const leans: Lean[] = [];
  const crossed = new Set<number>();
  let col = -1;
  let row = entryRow;
  let dir: Dir = 'E';
  /** Cells ahead of the current position up to the edge or the cell before a mirror. */
  const ahead = (): { cells: number[]; open: boolean } => {
    const cells: number[] = [];
    let c = col + STEP[dir].dc;
    let r = row + STEP[dir].dr;
    while (inside(c, r)) {
      if (mirrors.includes(r * LASER_SIZE + c)) return { cells, open: false };
      cells.push(r * LASER_SIZE + c);
      c += STEP[dir].dc;
      r += STEP[dir].dr;
    }
    return { cells, open: true };
  };
  for (let turn = 0; turn < turns; turn++) {
    const leg = ahead().cells;
    const spots: { cell: number; out: Dir }[] = [];
    for (const cell of leg) {
      if (crossed.has(cell)) continue;
      for (const out of SIDEWAYS[dir]) {
        const c = (cell % LASER_SIZE) + STEP[out].dc;
        const r = Math.floor(cell / LASER_SIZE) + STEP[out].dr;
        if (inside(c, r) && !mirrors.includes(r * LASER_SIZE + c)) spots.push({ cell, out });
      }
    }
    if (spots.length === 0) return null;
    const spot = rng.pick(spots);
    for (const cell of leg.slice(0, leg.indexOf(spot.cell) + 1)) crossed.add(cell);
    const from = dir;
    mirrors.push(spot.cell);
    leans.push(LEANS.find((lean) => TURN[lean][from] === spot.out) as Lean);
    col = spot.cell % LASER_SIZE;
    row = Math.floor(spot.cell / LASER_SIZE);
    dir = spot.out;
  }
  const last = ahead();
  if (!last.open || last.cells.length === 0) return null;
  const target = last.cells[last.cells.length - 1];
  if (crossed.has(target)) return null;
  for (const cell of last.cells) crossed.add(cell);
  return { entryRow, target, mirrors, leans, crossed };
}

export type Generated = {
  puzzle: LaserPuzzle;
  leans: Lean[];
  par: number;
  /** Paths tried (GEN_ATTEMPTS when the fallback is used). */
  attempts: number;
  fallback: boolean;
  rngState: number;
};

/** Par aimed at by puzzle k: k + 1 flips, 4 at most. */
export const parAim = (puzzle: number): number => Math.min(puzzle + 1, LASER_MAX_PAR_AIM);

/** Puzzle k (1..5): a path with 2 + k turns and k decoy mirrors, aiming at par k + 1 (4 at most). */
export function generatePuzzle(rngState: number, puzzle: number): Generated {
  return generateWith(rngState, LASER_BASE_TURNS + puzzle, puzzle, parAim(puzzle));
}

/**
 * The generator of `generatePuzzle` for any number of turns and decoys and any par aim (tests reach the fallback
 * with it). The first path that the walk completes gets up to LEAN_ATTEMPTS seeded lean draws: the unsolved draw
 * with the highest par is kept (the first one on a tie), and the draws stop as soon as one reaches the aim.
 */
export function generateWith(rngState: number, turns: number, decoys: number, aim = 1): Generated {
  const rng = createRng(rngState);
  const possible = turns >= 1 && decoys >= 0 && turns + decoys <= LASER_MAX_MIRRORS;
  for (let attempt = 1; possible && attempt <= GEN_ATTEMPTS; attempt++) {
    const path = seededPath(rng, turns);
    if (!path) continue;
    const free: number[] = [];
    for (let cell = 0; cell < LASER_CELLS; cell++) if (!path.crossed.has(cell)) free.push(cell);
    if (free.length < decoys) continue;
    const mirrors = [...path.mirrors, ...rng.shuffle(free).slice(0, decoys)];
    const puzzle: LaserPuzzle = { entryRow: path.entryRow, target: path.target, mirrors };
    // The path leans solve the puzzle whatever the decoys (they are off the path); checked, never assumed.
    const solution = mirrors.map((_, i) => path.leans[i] ?? 'slash');
    if (!isSolved(puzzle, solution)) continue;
    let best: { leans: Lean[]; par: number } | null = null;
    for (let draw = 0; draw < LEAN_ATTEMPTS && (best === null || best.par < aim); draw++) {
      const leans = mirrors.map(() => rng.pick(LEANS));
      if (isSolved(puzzle, leans)) continue;
      const flips = par(puzzle, leans);
      if (best === null || flips > best.par) best = { leans, par: flips };
    }
    if (best) return { puzzle, leans: best.leans, par: best.par, attempts: attempt, fallback: false, rngState: rng.state() };
  }
  const leans = FALLBACK.leans.slice();
  return { puzzle: FALLBACK.puzzle, leans, par: par(FALLBACK.puzzle, leans), attempts: GEN_ATTEMPTS, fallback: true, rngState: rng.state() };
}

export type LaserEvent =
  /** A tap: the mirror flipped to the given lean. */
  | { kind: 'flip'; mirror: number; lean: Lean }
  /** A tap during the 120 ms flip of the previous one, or while the solved puzzle is shown: nothing changes. */
  | { kind: 'ignored' }
  | { kind: 'solved'; puzzle: number; flips: number; par: number; points: number }
  | { kind: 'failed'; puzzle: number }
  /** The next puzzle is on the board. */
  | { kind: 'puzzle'; puzzle: number }
  | { kind: 'hint'; mirror: number };

export type LaserState = RoundState<LaserEvent> & {
  board: LaserPuzzle;
  /** Lean of each mirror of the board. */
  leans: readonly Lean[];
  /** Current puzzle, 1..5. */
  puzzle: number;
  par: number;
  /** Flips on the current puzzle (hints are not flips). */
  flips: number;
  hintsLeft: number;
  /** Mirror (index) highlighted by the last hint, null when none is shown. */
  hint: number | null;
  /** Remaining time of the current flip (input guard), ms. */
  flipMs: number;
  /** Time left of the solved puzzle on screen (ms); 0 while the puzzle is played. */
  solvedMs: number;
  /** The board is the fixed fallback puzzle (the generator ran out of attempts). */
  fallback: boolean;
  rngState: number;
};

export type LaserAction = { type: 'flip'; mirror: number } | { type: 'hint' } | { type: 'tick'; dt: number };

type Carry = Pick<LaserState, 'score' | 'combos' | 'status' | 'hintsLeft' | 'rngState'>;

function startPuzzle(carry: Carry, puzzle: number): LaserState {
  const generated = generatePuzzle(carry.rngState, puzzle);
  return {
    ...carry,
    events: [],
    board: generated.puzzle,
    leans: generated.leans,
    puzzle,
    par: generated.par,
    flips: 0,
    hint: null,
    flipMs: 0,
    solvedMs: 0,
    fallback: generated.fallback,
    rngState: generated.rngState,
  };
}

export function createLaser(seed: number, upgrades: UpgradeLevels = {}): LaserState {
  return startPuzzle({ score: 0, combos: 0, status: 'playing', hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** After the solved show (or a failed puzzle): the next puzzle, or the end of the round after puzzle 5. */
function nextPuzzle(state: LaserState, events: LaserState['events'][number][]): LaserState {
  if (state.puzzle >= LASER_PUZZLES) {
    events.push({ kind: 'over', score: state.score });
    return { ...state, hint: null, solvedMs: 0, status: 'over', events };
  }
  const next = startPuzzle({ score: state.score, combos: state.combos, status: 'playing', hintsLeft: state.hintsLeft, rngState: state.rngState }, state.puzzle + 1);
  events.push({ kind: 'puzzle', puzzle: next.puzzle });
  return { ...next, flipMs: state.flipMs, events };
}

export function reduceLaser(state: LaserState, action: LaserAction): LaserState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    // A tick without a flip or a solved show in progress returns the same state (no re-render).
    if (!(action.dt > 0) || (state.flipMs <= 0 && state.solvedMs <= 0)) return state;
    const flipMs = Math.max(0, state.flipMs - action.dt);
    if (state.solvedMs <= 0) return { ...state, flipMs, events: [] };
    const solvedMs = Math.max(0, state.solvedMs - action.dt);
    if (solvedMs > 0) return { ...state, flipMs, solvedMs, events: [] };
    return nextPuzzle({ ...state, flipMs: 0, solvedMs: 0 }, []);
  }

  // The solved puzzle is on show: taps and hints change nothing.
  if (state.solvedMs > 0) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'hint') {
    // Refused when none is left or one is already shown (a second one would point at the same mirror).
    if (state.hintsLeft <= 0 || state.hint !== null) return { ...state, events: [] };
    const mirror = hintMirror(state.board, state.leans);
    if (mirror === null) return { ...state, events: [] };
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: mirror, events: [{ kind: 'hint', mirror }] };
  }

  if (state.flipMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  const { mirror } = action;
  if (!Number.isInteger(mirror) || mirror < 0 || mirror >= state.leans.length) return { ...state, events: [] };

  const leans = state.leans.slice();
  leans[mirror] = otherLean(leans[mirror]);
  const flips = state.flips + 1;
  const events: LaserState['events'][number][] = [{ kind: 'flip', mirror, lean: leans[mirror] }];
  const solved = isSolved(state.board, leans);
  if (!solved && flips < state.par + LASER_FAIL_AFTER) {
    // A shown hint is spent by any flip (the next one would need a new search).
    return { ...state, leans, flips, hint: null, flipMs: LASER_FLIP_MS, events };
  }

  if (!solved) {
    events.push({ kind: 'failed', puzzle: state.puzzle });
    return nextPuzzle({ ...state, leans, flips, flipMs: LASER_FLIP_MS }, events);
  }

  const points = puzzleScore(flips, state.par);
  let combos = state.combos;
  events.push({ kind: 'solved', puzzle: state.puzzle, flips, par: state.par, points }, { kind: 'score', points });
  if (flips <= state.par) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  return { ...state, leans, flips, hint: null, score: state.score + points, combos, flipMs: LASER_FLIP_MS, solvedMs: SOLVED_SHOW_MS, events };
}
