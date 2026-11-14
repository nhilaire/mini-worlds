// Bloc Glissant: a sliding-block puzzle (« rush hour ») on a 6 × 6 board (docs/PRD.md "Bloc Glissant", AC-77). Pure
// reducer on an immutable state, see src/game/contract.ts. Block 0 is the red block, horizontal, length 2, on row 2;
// the puzzle is solved when it occupies columns 4-5. A swipe moves one block one cell along its axis into a free
// cell. Puzzle k (1..5) is generated backwards from a solved layout (src/game/slide/solver.ts holds the
// breadth-first solver that gives par and the hints). The 120 ms slide is an engine counter advanced by `tick`.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { applyMove, boardOf, EXIT_COL, isSolved, keyOf, layoutOf, legalMoves, parMap, RED_ROW, SLIDE_SIZE, solve } from './solver';
import type { Block, Layout, SlideMove } from './solver';

export { SLIDE_SIZE, RED_ROW, EXIT_COL };
export type { Block, Layout, SlideMove };

export const SLIDE_PUZZLES = 5;
/** Moves beyond par after which an unsolved puzzle is failed. */
export const SLIDE_FAIL_AFTER = 25;
/** A block slides in 120 ms; a swipe meanwhile is ignored (input guard). */
export const SLIDE_MS = 120;
/** Generator bounds (PRD): up to 200 backward moves per attempt, 30 attempts, then the closest attempt. */
export const WALK_MOVES = 200;
export const GEN_ATTEMPTS = 30;

export type Direction = 'left' | 'right' | 'up' | 'down';

export type SlideEvent =
  | { kind: 'slide'; block: number; move: SlideMove }
  /** A swipe across the block's axis or into an occupied cell / the border: nothing moves. */
  | { kind: 'blocked'; block: number }
  /** A swipe during the 120 ms slide of the previous move: ignored. */
  | { kind: 'ignored' }
  | { kind: 'solved'; puzzle: number; moves: number; par: number; points: number }
  | { kind: 'failed'; puzzle: number }
  /** The next puzzle is on the board. */
  | { kind: 'puzzle'; puzzle: number }
  | { kind: 'hint'; move: SlideMove };

export type SlideState = RoundState<SlideEvent> & {
  blocks: Layout;
  /** Current puzzle, 1..5. */
  puzzle: number;
  par: number;
  /** Moves on the current puzzle (hints are not moves). */
  moves: number;
  hintsLeft: number;
  /** Next move of a shortest solution shown by the last hint, null when none is shown. */
  hint: SlideMove | null;
  /** Remaining time of the current slide (input guard), ms. */
  slideMs: number;
  rngState: number;
};

export type SlideAction = { type: 'swipe'; block: number; dir: Direction } | { type: 'hint' } | { type: 'tick'; dt: number };

export const parRange = (puzzle: number): [number, number] => [3 + 2 * puzzle, 7 + 2 * puzzle];

export function puzzleScore(moves: number, par: number): number {
  return Math.max(50, 300 - 15 * Math.max(0, moves - par));
}

/** The one-cell move a swipe asks for, or null when the swipe is across the block's axis. */
export function moveOfSwipe(blocks: Layout, block: number, dir: Direction): SlideMove | null {
  const b = blocks[block];
  if (!b) return null;
  if (b.horizontal) return dir === 'left' ? { block, delta: -1 } : dir === 'right' ? { block, delta: 1 } : null;
  return dir === 'up' ? { block, delta: -1 } : dir === 'down' ? { block, delta: 1 } : null;
}

export function directionOf(blocks: Layout, move: SlideMove): Direction {
  if (blocks[move.block].horizontal) return move.delta < 0 ? 'left' : 'right';
  return move.delta < 0 ? 'up' : 'down';
}

const sameMove = (a: SlideMove, b: SlideMove) => a.block === b.block && a.delta === b.delta;

/** Cells covered by a block. */
export function cellsOf(b: Block): { col: number; row: number }[] {
  return Array.from({ length: b.len }, (_, i) => (b.horizontal ? { col: b.col + i, row: b.row } : { col: b.col, row: b.row + i }));
}

/** Index of the block covering a cell, or -1. */
export function blockAt(blocks: Layout, col: number, row: number): number {
  return blocks.findIndex((b) => cellsOf(b).some((c) => c.col === col && c.row === row));
}

/**
 * A seeded solved layout: the red block at columns 4-5 of row 2 and `others` blocks of length 2 (60 %) or 3,
 * vertical (65 %: they cross the red row) or horizontal, on free cells. No other horizontal block sits on row 2 (it
 * would only wall the red block in, a generator choice the PRD leaves open). A block that finds no room in 40 tries
 * is skipped.
 */
export function solvedLayout(rng: Rng, others: number): Block[] {
  const blocks: Block[] = [{ row: RED_ROW, col: EXIT_COL, len: 2, horizontal: true }];
  const used = new Set<number>([RED_ROW * SLIDE_SIZE + EXIT_COL, RED_ROW * SLIDE_SIZE + EXIT_COL + 1]);
  for (let n = 0; n < others; n++) {
    for (let tries = 0; tries < 40; tries++) {
      const horizontal = rng.next() < 0.35;
      const len = rng.next() < 0.6 ? 2 : 3;
      const row = horizontal ? rng.int(SLIDE_SIZE) : rng.int(SLIDE_SIZE - len + 1);
      const col = horizontal ? rng.int(SLIDE_SIZE - len + 1) : rng.int(SLIDE_SIZE);
      if (horizontal && row === RED_ROW) continue;
      const block = { row, col, len, horizontal };
      const cells = cellsOf(block).map((c) => c.row * SLIDE_SIZE + c.col);
      if (cells.some((c) => used.has(c))) continue;
      for (const c of cells) used.add(c);
      blocks.push(block);
      break;
    }
  }
  return blocks;
}

export type Generated = { blocks: Layout; par: number; attempts: number; rngState: number };

/** The walk of a loose board is solved every few moves (each solve is a breadth-first search). */
export const GEN_CHECK_EVERY = 4;
/** Largest component an attempt maps (layouts); a larger one (a loose board) is walked and solved instead. */
export const GEN_MAP_CAP = 10_000;

/**
 * Puzzle k: from a seeded solved layout with 5 + k other blocks, seeded random legal moves backwards until par is in
 * [3 + 2k, 7 + 2k]; within 30 attempts the first such layout is kept, else the layout of the attempts with the
 * closest par. Reading of « up to 200 random moves backwards » chosen for speed and hit rate (a plain random walk
 * rarely reaches the deep layouts of puzzles 4-5):
 * - a tight board (component of at most GEN_MAP_CAP layouts) is mapped once with the par of every layout reachable
 *   from it; the attempt takes a seeded layout among those whose par is in range (each one is the end of a walk of
 *   legal backward moves), or is dropped when its deepest layout is still out of range;
 * - a loose board walks up to 200 random legal moves, preferring layouts it has not visited, and is solved every
 *   GEN_CHECK_EVERY moves; it stops at the first layout in range.
 */
export function generatePuzzle(rngState: number, puzzle: number): Generated {
  return generateLayout(rngState, 5 + puzzle, parRange(puzzle));
}

/** The generator of `generatePuzzle` for any block count (≤ 10 others) and par range (tests reach the fallback). */
export function generateLayout(rngState: number, others: number, [lo, hi]: [number, number]): Generated {
  const rng = createRng(rngState);
  const gapOf = (par: number) => (par < lo ? lo - par : par > hi ? par - hi : 0);
  let best: { blocks: Layout; par: number; gap: number } = { blocks: [], par: 0, gap: Infinity };
  const found = (blocks: Layout, par: number, attempt: number): Generated => ({ blocks, par, attempts: attempt, rngState: rng.state() });
  for (let attempt = 1; attempt <= GEN_ATTEMPTS; attempt++) {
    let blocks: Layout = solvedLayout(rng, others);
    const mapped = parMap(blocks, GEN_MAP_CAP);
    if (mapped) {
      const inRange = mapped.keys.filter((key) => gapOf(mapped.par(key)) === 0);
      if (inRange.length > 0) {
        const key = rng.pick(inRange);
        return found(layoutOf(mapped.board, key, blocks), mapped.par(key), attempt);
      }
      // Closest layout of this component, kept for the fallback.
      for (const key of mapped.keys) {
        const gap = gapOf(mapped.par(key));
        if (gap < best.gap) best = { blocks: layoutOf(mapped.board, key, blocks), par: mapped.par(key), gap };
      }
      continue;
    }
    const board = boardOf(blocks);
    const visited = new Set<number>([keyOf(board, blocks)]);
    for (let step = 1; step <= WALK_MOVES; step++) {
      const moves = legalMoves(blocks);
      if (moves.length === 0) break;
      const fresh = moves.filter((m) => !visited.has(keyOf(board, applyMove(blocks, m))));
      blocks = applyMove(blocks, rng.pick(fresh.length > 0 ? fresh : moves));
      visited.add(keyOf(board, blocks));
      if (step % GEN_CHECK_EVERY !== 0) continue;
      const path = solve(blocks);
      if (!path) continue;
      const gap = gapOf(path.length);
      if (gap === 0) return found(blocks, path.length, attempt);
      if (gap < best.gap) best = { blocks, par: path.length, gap };
    }
  }
  // Fallback: the closest layout (every layout is solvable: it was reached backwards from a solved one).
  return { blocks: best.blocks, par: best.par, attempts: GEN_ATTEMPTS, rngState: rng.state() };
}

type Carry = Pick<SlideState, 'score' | 'combos' | 'status' | 'hintsLeft' | 'rngState'>;

function startPuzzle(carry: Carry, puzzle: number): SlideState {
  const generated = generatePuzzle(carry.rngState, puzzle);
  return { ...carry, events: [], puzzle, blocks: generated.blocks, par: generated.par, moves: 0, hint: null, slideMs: 0, rngState: generated.rngState };
}

export function createSlide(seed: number, upgrades: UpgradeLevels = {}): SlideState {
  return startPuzzle({ score: 0, combos: 0, status: 'playing', hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** Next move of a shortest solution from the current layout, or null when solved. */
export function nextMove(blocks: Layout): SlideMove | null {
  const path = solve(blocks);
  return path && path.length > 0 ? path[0] : null;
}

export function reduceSlide(state: SlideState, action: SlideAction): SlideState {
  if (action.type === 'tick') {
    if (state.slideMs <= 0 || !(action.dt > 0)) return state;
    return { ...state, slideMs: Math.max(0, state.slideMs - action.dt), events: [] };
  }
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'hint') {
    // Refused when none is left or one is already shown (a second one would point at the same move).
    if (state.hintsLeft <= 0 || state.hint !== null) return { ...state, events: [] };
    const move = nextMove(state.blocks);
    if (!move) return { ...state, events: [] };
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: move, events: [{ kind: 'hint', move }] };
  }

  if (state.slideMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  const move = moveOfSwipe(state.blocks, action.block, action.dir);
  if (!move || !legalMoves(state.blocks).some((m) => sameMove(m, move))) return { ...state, events: [{ kind: 'blocked', block: action.block }] };

  const blocks = applyMove(state.blocks, move);
  const moves = state.moves + 1;
  const events: SlideState['events'][number][] = [{ kind: 'slide', block: move.block, move }];
  const solved = isSolved(blocks);
  if (!solved && moves < state.par + SLIDE_FAIL_AFTER) {
    // A shown hint is spent by any move (the next one would need a new search).
    return { ...state, blocks, moves, hint: null, slideMs: SLIDE_MS, events };
  }

  let score = state.score;
  let combos = state.combos;
  if (solved) {
    const points = puzzleScore(moves, state.par);
    score += points;
    events.push({ kind: 'solved', puzzle: state.puzzle, moves, par: state.par, points }, { kind: 'score', points });
    if (moves <= state.par) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
  } else {
    events.push({ kind: 'failed', puzzle: state.puzzle });
  }

  if (state.puzzle >= SLIDE_PUZZLES) {
    events.push({ kind: 'over', score });
    return { ...state, blocks, moves, hint: null, score, combos, slideMs: SLIDE_MS, status: 'over', events };
  }
  const next = startPuzzle({ score, combos, status: 'playing', hintsLeft: state.hintsLeft, rngState: state.rngState }, state.puzzle + 1);
  events.push({ kind: 'puzzle', puzzle: next.puzzle });
  return { ...next, slideMs: SLIDE_MS, events };
}
