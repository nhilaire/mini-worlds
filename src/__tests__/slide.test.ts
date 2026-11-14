import { playSlideBot } from '../game/slide/bot';
import {
  createSlide,
  directionOf,
  GEN_ATTEMPTS,
  generateLayout,
  generatePuzzle,
  nextMove,
  parRange,
  puzzleScore,
  reduceSlide,
  SLIDE_FAIL_AFTER,
  SLIDE_MS,
  SLIDE_PUZZLES,
  SlideState,
} from '../game/slide/engine';
import { Block, EXIT_COL, isSolved, legalMoves, RED_ROW, SlideMove, solve } from '../game/slide/solver';

/** One swipe for a move, then the 120 ms slide. */
function play(state: SlideState, move: SlideMove): SlideState {
  const next = reduceSlide(state, { type: 'swipe', block: move.block, dir: directionOf(state.blocks, move) });
  return reduceSlide(next, { type: 'tick', dt: SLIDE_MS });
}

function playSolution(state: SlideState): SlideState {
  let s = state;
  for (const move of solve(state.blocks) ?? []) s = play(s, move);
  return s;
}

/** A legal move of a block other than the red one and its undo: two moves that keep the puzzle unsolved. */
function wasteTwo(state: SlideState): SlideState {
  const move = legalMoves(state.blocks).find((m) => m.block !== 0);
  if (!move) throw new Error('no other block can move');
  const once = play(state, move);
  return play(once, { block: move.block, delta: move.delta === 1 ? -1 : 1 });
}

const occupied = (blocks: readonly Block[]) => {
  const cells: number[] = [];
  for (const b of blocks) for (let i = 0; i < b.len; i++) cells.push(b.horizontal ? b.row * 6 + b.col + i : (b.row + i) * 6 + b.col);
  return cells;
};

const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

// A hand-made board: red at columns 0-1 of row 2, a vertical block at column 2 rows 1-2 (blocking), a horizontal
// block at row 0 columns 3-5, a vertical block at column 3 rows 3-5.
const BOARD: Block[] = [
  { row: RED_ROW, col: 0, len: 2, horizontal: true },
  { row: 1, col: 2, len: 2, horizontal: false },
  { row: 0, col: 3, len: 3, horizontal: true },
  { row: 3, col: 3, len: 3, horizontal: false },
];
const withBoard = (blocks: Block[]): SlideState => ({ ...createSlide(1), blocks, par: solve(blocks)?.length ?? 0, moves: 0 });

describe('Bloc Glissant engine (AC-77)', () => {
  it('AC-77: a swipe moves a block one cell along its axis into a free cell only', () => {
    const state = withBoard(BOARD);
    // Across the axis: nothing moves.
    const across = reduceSlide(state, { type: 'swipe', block: 0, dir: 'up' });
    expect(across.blocks).toBe(state.blocks);
    expect(across.events).toEqual([{ kind: 'blocked', block: 0 }]);
    // Into another block (red → column 2 is the vertical block) and through the border: nothing moves.
    expect(reduceSlide(state, { type: 'swipe', block: 0, dir: 'right' }).blocks).toBe(state.blocks);
    expect(reduceSlide(state, { type: 'swipe', block: 0, dir: 'left' }).blocks).toBe(state.blocks);
    expect(reduceSlide(state, { type: 'swipe', block: 2, dir: 'right' }).blocks).toBe(state.blocks);
    // Row 0 column 2 is free: the vertical block moves one cell up.
    const up = reduceSlide(state, { type: 'swipe', block: 1, dir: 'up' });
    expect(up.blocks[1]).toEqual({ row: 0, col: 2, len: 2, horizontal: false });
    expect(up.moves).toBe(1);
    expect(up.blocks.filter((b, i) => b !== state.blocks[i])).toHaveLength(1);
    // Then the red block can slide right, one cell per swipe (after the 120 ms slide).
    const right = play(reduceSlide(up, { type: 'tick', dt: SLIDE_MS }), { block: 0, delta: 1 });
    expect(right.blocks[0].col).toBe(1);
    // The legal moves of any layout are exactly the one-cell moves into free cells.
    for (const move of legalMoves(BOARD)) {
      const moved = reduceSlide(state, { type: 'swipe', block: move.block, dir: directionOf(BOARD, move) });
      const cells = occupied(moved.blocks);
      expect(new Set(cells).size).toBe(cells.length);
    }
  });

  it('AC-77: a puzzle is solved when the red block covers columns 4-5', () => {
    const state = createSlide(42);
    expect(state.blocks[0]).toMatchObject({ row: RED_ROW, len: 2, horizontal: true });
    expect(state.blocks[0].col).toBeLessThan(EXIT_COL);
    let s = state;
    const path = solve(state.blocks) ?? [];
    for (const move of path.slice(0, -1)) s = play(s, move);
    expect(s.puzzle).toBe(1);
    const last = reduceSlide(s, { type: 'swipe', block: path[path.length - 1].block, dir: directionOf(s.blocks, path[path.length - 1]) });
    const solved = last.events.find((e) => e.kind === 'solved');
    expect(solved).toEqual({ kind: 'solved', puzzle: 1, moves: state.par, par: state.par, points: 300 });
    expect(last.puzzle).toBe(2);
    expect(isSolved(last.blocks)).toBe(false); // the next puzzle is on the board
  });

  it('AC-77: every generated puzzle is solvable with its par in [3 + 2k, 7 + 2k] (30 seeded rounds)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let rngState = seed;
      for (let k = 1; k <= SLIDE_PUZZLES; k++) {
        const g = generatePuzzle(rngState, k);
        rngState = g.rngState;
        const [lo, hi] = parRange(k);
        expect(g.attempts).toBeLessThanOrEqual(GEN_ATTEMPTS);
        expect(g.par).toBeGreaterThanOrEqual(lo);
        expect(g.par).toBeLessThanOrEqual(hi);
        expect(solve(g.blocks)?.length).toBe(g.par);
        expect(g.blocks).toHaveLength(6 + k);
        const cells = occupied(g.blocks);
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells.every((c) => c >= 0 && c < 36)).toBe(true);
      }
    }
  }, 120_000);

  it('AC-77 / AC-86: the generator is bounded: an impossible par range keeps the closest attempt after 30 attempts', () => {
    const g = generateLayout(9, 10, [60, 70]); // a par no 6 × 6 board of 11 blocks reaches
    expect(g.attempts).toBe(GEN_ATTEMPTS);
    expect(g.blocks.length).toBeGreaterThan(0);
    expect(solve(g.blocks)?.length).toBe(g.par);
  });

  it('AC-86: the generator starts a round for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createSlide(seed * 7919);
      expect(state.status).toBe('playing');
      expect(state.puzzle).toBe(1);
      expect(solve(state.blocks)?.length).toBe(state.par);
      expect(state.par).toBeGreaterThan(0);
    }
  }, 120_000);

  it('AC-77: the 5 puzzles of a round are generated in about a second at most', () => {
    const times: number[] = [];
    for (const seed of [11, 22, 33]) {
      const t0 = performance.now();
      let rngState = seed;
      for (let k = 1; k <= SLIDE_PUZZLES; k++) rngState = generatePuzzle(rngState, k).rngState;
      times.push(performance.now() - t0);
    }
    // Measured on the dev machine: about 100-400 ms per round in Jest.
    expect(median(times)).toBeLessThan(1000);
  });

  it('AC-77: scoring is max(50, 300 − 15 per move beyond par); a puzzle at par is a combo', () => {
    expect(puzzleScore(9, 9)).toBe(300);
    expect(puzzleScore(8, 9)).toBe(300);
    expect(puzzleScore(10, 9)).toBe(285);
    expect(puzzleScore(9 + 16, 9)).toBe(60);
    expect(puzzleScore(9 + 17, 9)).toBe(50);
    expect(puzzleScore(9 + 30, 9)).toBe(50);

    const state = createSlide(5);
    const atPar = playSolution(state);
    expect(atPar.score).toBe(300);
    expect(atPar.combos).toBe(1);
    const late = playSolution(wasteTwo(createSlide(5)));
    expect(late.score).toBe(270);
    expect(late.combos).toBe(0);
  });

  it('AC-77: a puzzle still unsolved after par + 25 moves is failed (0 points) and the next one starts', () => {
    let s = createSlide(8);
    const par = s.par;
    const move = legalMoves(s.blocks).find((m) => m.block !== 0) as SlideMove;
    const undo: SlideMove = { block: move.block, delta: move.delta === 1 ? -1 : 1 };
    for (let i = 0; i < par + SLIDE_FAIL_AFTER - 1; i++) s = play(s, i % 2 === 0 ? move : undo);
    expect(s.puzzle).toBe(1);
    expect(s.moves).toBe(par + SLIDE_FAIL_AFTER - 1);
    const failed = reduceSlide(s, { type: 'swipe', block: move.block, dir: directionOf(s.blocks, s.moves % 2 === 0 ? move : undo) });
    expect(failed.events).toContainEqual({ kind: 'failed', puzzle: 1 });
    expect(failed.events).toContainEqual({ kind: 'puzzle', puzzle: 2 });
    expect(failed.score).toBe(0);
    expect(failed.puzzle).toBe(2);
    expect(failed.moves).toBe(0);
  });

  it('AC-77: a hint shows the next move of a shortest solution, counts down and is refused at 0', () => {
    const state = createSlide(3, { hint: 2 });
    expect(state.hintsLeft).toBe(2);
    const hinted = reduceSlide(state, { type: 'hint' });
    const expected = nextMove(state.blocks) as SlideMove;
    expect(hinted.hint).toEqual(expected);
    expect(hinted.hintsLeft).toBe(1);
    expect(hinted.moves).toBe(0); // a hint is not a move
    // A second hint while one is shown is refused.
    expect(reduceSlide(hinted, { type: 'hint' }).hintsLeft).toBe(1);
    // Playing the hinted move brings the puzzle one move closer to solved, and the hint is spent.
    const after = play(hinted, expected);
    expect(solve(after.blocks)?.length).toBe(state.par - 1);
    expect(after.hint).toBeNull();
    const second = reduceSlide(after, { type: 'hint' });
    expect(second.hintsLeft).toBe(0);
    const none = reduceSlide(play(second, second.hint as SlideMove), { type: 'hint' });
    expect(none.hint).toBeNull();
    expect(none.hintsLeft).toBe(0);
    expect(createSlide(3).hintsLeft).toBe(0);
    expect(reduceSlide(createSlide(3), { type: 'hint' }).hint).toBeNull();
  });

  it('AC-86: a swipe during the 120 ms slide is ignored (double swipe changes nothing)', () => {
    const state = createSlide(21);
    const [first, second] = solve(state.blocks) as SlideMove[];
    const moved = reduceSlide(state, { type: 'swipe', block: first.block, dir: directionOf(state.blocks, first) });
    expect(moved.moves).toBe(1);
    const double = reduceSlide(moved, { type: 'swipe', block: second.block, dir: directionOf(moved.blocks, second) });
    expect(double.blocks).toBe(moved.blocks);
    expect(double.moves).toBe(1);
    expect(double.events).toEqual([{ kind: 'ignored' }]);
    const almost = reduceSlide(moved, { type: 'tick', dt: SLIDE_MS - 10 });
    expect(reduceSlide(almost, { type: 'swipe', block: second.block, dir: directionOf(moved.blocks, second) }).moves).toBe(1);
    const done = reduceSlide(almost, { type: 'tick', dt: 10 });
    expect(reduceSlide(done, { type: 'swipe', block: second.block, dir: directionOf(moved.blocks, second) }).moves).toBe(2);
    // A tick without a slide in progress returns the same state (no re-render).
    expect(reduceSlide(done, { type: 'tick', dt: 50 })).toBe(done);
  });

  it('AC-86: the casual bot (shortest move, 30 % random move) has a median between 1 and 3 stars over 50 seeds', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 50; seed++) scores.push(playSlideBot(seed).score);
    const sorted = scores.slice().sort((a, b) => a - b);
    // Measured: p10 1005, median 1132.5, p90 1275 (stars 500 / 900 / 1 300).
    expect(median(scores)).toBeGreaterThanOrEqual(500);
    expect(median(scores)).toBeLessThan(1300);
    expect(sorted[0]).toBeGreaterThan(0);
  }, 240_000);
});
