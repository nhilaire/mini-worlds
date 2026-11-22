import { gameById } from '../game/core/content';
import { playTwinsBot } from '../game/twins/bot';
import {
  cellAt,
  createTwins,
  Direction,
  DIRECTIONS,
  FALLBACK,
  FALLBACK_PAR,
  GEN_ATTEMPTS,
  generateBoard,
  generatePuzzle,
  isSolved,
  nextMove,
  parRange,
  Positions,
  puzzleScore,
  reduceTwins,
  solve,
  step,
  TWINS_FAIL_AFTER,
  TWINS_MOVE_MS,
  TWINS_PUZZLES,
  TWINS_SHOW_MS,
  TwinsPuzzle,
  TwinsState,
  wallCount,
} from '../game/twins/engine';

/** One move, then its 120 ms animation. */
function play(state: TwinsState, direction: Direction): TwinsState {
  return reduceTwins(reduceTwins(state, { type: 'move', direction }), { type: 'tick', dt: TWINS_MOVE_MS });
}

/** The shortest solution of the current puzzle, move by move (the solved puzzle is still shown at the end). */
function playSolution(state: TwinsState): TwinsState {
  let s = state;
  for (const direction of solve(state.board, state.positions) ?? []) s = play(s, direction);
  return s;
}

/** The 800 ms a finished puzzle stays shown. */
const wait = (state: TwinsState) => reduceTwins(state, { type: 'tick', dt: TWINS_SHOW_MS });

/** A direction that moves somebody without solving the puzzle nor reaching a dead end. */
function stalling(state: TwinsState): Direction {
  const direction = DIRECTIONS.find((d) => {
    const next = step(state.board, state.positions, d);
    return (next.a !== state.positions.a || next.b !== state.positions.b) && !isSolved(state.board, next) && solve(state.board, next) !== null;
  });
  if (!direction) throw new Error('no stalling move');
  return direction;
}

/**
 * Independent breadth-first search on the joint positions: the least number of moves from `start` to `exits`, -1 when
 * they cannot be reached. Written without the engine (its own stepping).
 */
function bfsPar(walls: readonly number[], start: Positions, exits: Positions): number {
  const moveCell = (cell: number, dc: number, dr: number) => {
    const col = (cell % 6) + dc;
    const row = Math.floor(cell / 6) + dr;
    if (col < 0 || col > 5 || row < 0 || row > 5 || walls.includes(row * 6 + col)) return cell;
    return row * 6 + col;
  };
  const seen = new Map<string, number>([[`${start.a},${start.b}`, 0]]);
  const queue: Positions[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const d = seen.get(`${at.a},${at.b}`) as number;
    if (at.a === exits.a && at.b === exits.b) return d;
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { a: moveCell(at.a, dc, dr), b: moveCell(at.b, dc, dr) };
      const key = `${next.a},${next.b}`;
      if (seen.has(key)) continue;
      seen.set(key, d + 1);
      queue.push(next);
    }
  }
  return -1;
}

const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

// A hand-made board (column, row):
//     . # . . . .
//     . . . . . .
//     . . # . . .      walls at (1,0) and (2,2); exits: a at (5,5), b at (0,5)
//     . . . . . .
//     . . . . . .
//     b . . . . a
const BOARD: TwinsPuzzle = { walls: [cellAt(1, 0), cellAt(2, 2)], exits: { a: cellAt(5, 5), b: cellAt(0, 5) } };
const withBoard = (board: TwinsPuzzle, positions: Positions, upgrades = {}): TwinsState => ({
  ...createTwins(1, upgrades),
  board,
  positions,
  par: solve(board, positions)?.length ?? 0,
  moves: 0,
});

describe('Duo Synchro engine (AC-107)', () => {
  it('AC-107: both characters move one cell when their own cell is free', () => {
    const start = { a: cellAt(3, 3), b: cellAt(4, 1) };
    expect(step(BOARD, start, 'up')).toEqual({ a: cellAt(3, 2), b: cellAt(4, 0) });
    expect(step(BOARD, start, 'down')).toEqual({ a: cellAt(3, 4), b: cellAt(4, 2) });
    expect(step(BOARD, start, 'left')).toEqual({ a: cellAt(2, 3), b: cellAt(3, 1) });
    expect(step(BOARD, start, 'right')).toEqual({ a: cellAt(4, 3), b: cellAt(5, 1) });

    const state = withBoard(BOARD, start);
    const moved = reduceTwins(state, { type: 'move', direction: 'up' });
    expect(moved.positions).toEqual({ a: cellAt(3, 2), b: cellAt(4, 0) });
    expect(moved.moves).toBe(1);
    expect(moved.events).toEqual([{ kind: 'move', direction: 'up', a: true, b: true }]);
    expect(moved.slideMs).toBe(TWINS_MOVE_MS);
  });

  it('AC-107: a character whose cell is a wall or outside the grid stays, the other one still moves', () => {
    // Edges: a in the top-left corner cannot go up or left, b can.
    const corner = { a: cellAt(0, 0), b: cellAt(4, 4) };
    expect(step(BOARD, corner, 'up')).toEqual({ a: cellAt(0, 0), b: cellAt(4, 3) });
    expect(step(BOARD, corner, 'left')).toEqual({ a: cellAt(0, 0), b: cellAt(3, 4) });
    // Bottom-right corner: neither down nor right.
    const far = { a: cellAt(5, 5), b: cellAt(1, 1) };
    expect(step(BOARD, far, 'down')).toEqual({ a: cellAt(5, 5), b: cellAt(1, 2) });
    expect(step(BOARD, far, 'right')).toEqual({ a: cellAt(5, 5), b: cellAt(2, 1) });
    // Walls: a on (0,0) is stopped by the wall (1,0); b on (2,1) is stopped by the wall (2,2).
    expect(step(BOARD, { a: cellAt(0, 0), b: cellAt(3, 3) }, 'right')).toEqual({ a: cellAt(0, 0), b: cellAt(4, 3) });
    expect(step(BOARD, { a: cellAt(4, 4), b: cellAt(2, 1) }, 'down')).toEqual({ a: cellAt(4, 5), b: cellAt(2, 1) });

    // In the reducer: the move counts as soon as one of them moves and says who did.
    const one = reduceTwins(withBoard(BOARD, corner), { type: 'move', direction: 'up' });
    expect(one.moves).toBe(1);
    expect(one.events).toEqual([{ kind: 'move', direction: 'up', a: false, b: true }]);
    // Neither can move (both on the top row): nothing changes, the move is not counted, no animation starts.
    const stuck = withBoard(BOARD, { a: cellAt(0, 0), b: cellAt(3, 0) });
    const blocked = reduceTwins(stuck, { type: 'move', direction: 'up' });
    expect(blocked.positions).toBe(stuck.positions);
    expect(blocked.moves).toBe(0);
    expect(blocked.slideMs).toBe(0);
    expect(blocked.events).toEqual([{ kind: 'blocked', direction: 'up' }]);
  });

  it('AC-107: the characters may share a cell (the other one never blocks)', () => {
    // b walks into the cell of a, which is held by the left edge.
    const start = { a: cellAt(0, 3), b: cellAt(1, 3) };
    const shared = step(BOARD, start, 'left');
    expect(shared).toEqual({ a: cellAt(0, 3), b: cellAt(0, 3) });
    // b walks through a: they swap sides without blocking each other.
    expect(step(BOARD, { a: cellAt(3, 4), b: cellAt(3, 3) }, 'down')).toEqual({ a: cellAt(3, 5), b: cellAt(3, 4) });
    const state = reduceTwins(withBoard(BOARD, start), { type: 'move', direction: 'left' });
    expect(state.positions).toEqual(shared);
    expect(state.events[0]).toEqual({ kind: 'move', direction: 'left', a: false, b: true });
  });

  it('AC-107: a move that leaves the exits out of reach (dead end) fails the puzzle at once, 0 points', () => {
    // Two characters on one cell never part again, and their exits are two different cells.
    const start = withBoard(BOARD, { a: cellAt(0, 3), b: cellAt(1, 3) });
    expect(start.par).toBeGreaterThan(1);
    const failed = reduceTwins({ ...start, score: 300 }, { type: 'move', direction: 'left' });
    expect(failed.positions).toEqual({ a: cellAt(0, 3), b: cellAt(0, 3) });
    expect(solve(BOARD, failed.positions)).toBeNull();
    expect(bfsPar(BOARD.walls, failed.positions, BOARD.exits)).toBe(-1);
    expect(failed.moves).toBe(1); // far from par + 25
    expect(failed.events).toEqual([
      { kind: 'move', direction: 'left', a: false, b: true },
      { kind: 'failed', puzzle: 1, reason: 'dead_end' },
    ]);
    expect(failed.result).toBe('failed');
    expect(failed.score).toBe(300); // nothing for this puzzle
    expect(failed.combos).toBe(0);
    // The same 800 ms show as any finished puzzle: moves are ignored, then the next puzzle.
    expect(failed.shownMs).toBe(TWINS_SHOW_MS);
    expect(reduceTwins(failed, { type: 'move', direction: 'right' }).events).toEqual([{ kind: 'ignored' }]);
    const next = wait(failed);
    expect(next.puzzle).toBe(2);
    expect(next.result).toBeNull();
    expect(next.score).toBe(300);
    // A move that keeps a solution, even a longer one, does not fail.
    const detour = reduceTwins(start, { type: 'move', direction: 'up' });
    expect(solve(BOARD, detour.positions)).not.toBeNull();
    expect(detour.result).toBeNull();
    // On the 5th puzzle the dead end ends the round after the show.
    const lastOne = reduceTwins({ ...start, puzzle: TWINS_PUZZLES }, { type: 'move', direction: 'left' });
    expect(lastOne.status).toBe('playing');
    expect(wait(lastOne).status).toBe('over');
  });

  it('AC-107: no dead end is left in play: after every accepted move of a scripted walk the puzzle is solved, failed or solvable', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createTwins(seed);
      for (let i = 0; i < 300 && s.status === 'playing'; i++) {
        s = reduceTwins(s, { type: 'move', direction: DIRECTIONS[(seed * 7 + i * i + Math.floor(i / 3)) % 4] });
        if (s.result === null) expect(bfsPar(s.board.walls, s.positions, s.board.exits)).toBeGreaterThan(0);
        s = reduceTwins(s, { type: 'tick', dt: TWINS_MOVE_MS });
        if (s.result !== null) s = wait(s);
      }
    }
  });

  it('AC-107: a puzzle is solved only when each character stands on its own exit after the same move', () => {
    // Exits: a at (5,5), b at (0,5).
    expect(isSolved(BOARD, { a: cellAt(5, 5), b: cellAt(0, 5) })).toBe(true);
    expect(isSolved(BOARD, { a: cellAt(0, 5), b: cellAt(5, 5) })).toBe(false); // each on the other one's exit
    expect(isSolved(BOARD, { a: cellAt(5, 5), b: cellAt(1, 5) })).toBe(false);
    expect(isSolved(BOARD, { a: cellAt(4, 5), b: cellAt(0, 5) })).toBe(false);

    // a reaches its exit first: not solved, the puzzle goes on.
    const alone = reduceTwins(withBoard(BOARD, { a: cellAt(5, 4), b: cellAt(1, 3) }), { type: 'move', direction: 'down' });
    expect(alone.positions.a).toBe(BOARD.exits.a);
    expect(alone.result).toBeNull();
    expect(alone.events.some((e) => e.kind === 'solved')).toBe(false);
    // On the other one's exit: not solved either.
    const swapped = reduceTwins(withBoard(BOARD, { a: cellAt(0, 4), b: cellAt(5, 4) }), { type: 'move', direction: 'down' });
    expect(swapped.positions).toEqual({ a: BOARD.exits.b, b: BOARD.exits.a });
    expect(swapped.result).toBeNull();

    // Both step on their exits with the same move: solved, and the solved grid stays shown 800 ms.
    const state = withBoard(BOARD, { a: cellAt(5, 4), b: cellAt(0, 4) });
    expect(state.par).toBe(1);
    const solved = reduceTwins(state, { type: 'move', direction: 'down' });
    expect(solved.events).toContainEqual({ kind: 'solved', puzzle: 1, moves: 1, par: 1, points: 300 });
    expect(solved.result).toBe('solved');
    expect(solved.score).toBe(300);
    expect(solved.puzzle).toBe(1);
    expect(solved.positions).toEqual(BOARD.exits);
    const shown = reduceTwins(solved, { type: 'tick', dt: TWINS_SHOW_MS - 10 });
    expect(shown.puzzle).toBe(1);
    expect(shown.result).toBe('solved');
    // A move while it is shown is ignored.
    const ignored = reduceTwins(shown, { type: 'move', direction: 'up' });
    expect(ignored.positions).toBe(shown.positions);
    expect(ignored.events).toEqual([{ kind: 'ignored' }]);
    const next = reduceTwins(shown, { type: 'tick', dt: 10 });
    expect(next.puzzle).toBe(2);
    expect(next.result).toBeNull();
    expect(next.moves).toBe(0);
    expect(next.events).toEqual([{ kind: 'puzzle', puzzle: 2 }]);
    expect(isSolved(next.board, next.positions)).toBe(false);
  });

  it('AC-107: solve is a shortest list of moves on the joint positions, null when the exits are out of reach', () => {
    const start = { a: cellAt(3, 3), b: cellAt(4, 1) };
    const path = solve(BOARD, start) as Direction[];
    expect(path).toHaveLength(bfsPar(BOARD.walls, start, BOARD.exits));
    let at = start;
    for (const direction of path) at = step(BOARD, at, direction);
    expect(at).toEqual(BOARD.exits);
    expect(solve(BOARD, BOARD.exits)).toEqual([]);
    // Two characters on the same cell never part again: their two exits are out of reach.
    const together = { a: cellAt(2, 4), b: cellAt(2, 4) };
    expect(solve(BOARD, together)).toBeNull();
    expect(bfsPar(BOARD.walls, together, BOARD.exits)).toBe(-1);
    expect(nextMove(BOARD, together)).toBeNull();
  });

  it('AC-107: every generated puzzle is solvable in its par, inside [4 + k, 7 + 2k] (60 seeded rounds)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let rngState = seed * 2654435761;
      for (let k = 1; k <= TWINS_PUZZLES; k++) {
        const g = generatePuzzle(rngState, k);
        rngState = g.rngState;
        const [lo, hi] = parRange(k);
        expect([lo, hi]).toEqual([4 + k, 7 + 2 * k]);
        expect(g.attempts).toBeLessThanOrEqual(GEN_ATTEMPTS);
        expect(g.par).toBeGreaterThanOrEqual(lo);
        expect(g.par).toBeLessThanOrEqual(hi);
        expect(bfsPar(g.board.walls, g.start, g.board.exits)).toBe(g.par);
        expect(solve(g.board, g.start)).toHaveLength(g.par);
        if (g.fallback) continue;
        // 6 + k walls on different cells; starts and exits on free cells, two different cells each.
        expect(g.board.walls).toHaveLength(6 + k);
        expect(wallCount(k)).toBe(6 + k);
        expect(new Set(g.board.walls).size).toBe(6 + k);
        expect(g.board.walls.every((c) => c >= 0 && c < 36)).toBe(true);
        for (const cell of [g.start.a, g.start.b, g.board.exits.a, g.board.exits.b]) expect(g.board.walls).not.toContain(cell);
        expect(g.start.a).not.toBe(g.start.b);
        expect(g.board.exits.a).not.toBe(g.board.exits.b);
      }
    }
  });

  it('AC-107: the exits are the furthest pair in range: no other pair of different cells in range is further', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = generatePuzzle(seed, 2);
      const [, hi] = parRange(2);
      if (g.par === hi) continue;
      for (let a = 0; a < 36; a++) {
        for (let b = 0; b < 36; b++) {
          if (a === b) continue;
          const d = bfsPar(g.board.walls, g.start, { a, b });
          expect(d > g.par && d <= hi).toBe(false);
        }
      }
    }
  });

  it('AC-107 / AC-108: the generator is bounded: after 30 boards without a pair in range, the fixed fallback puzzle', () => {
    const g = generateBoard(9, 8, [60, 70]); // a par no 6 × 6 board reaches
    expect(g.attempts).toBe(GEN_ATTEMPTS);
    expect(g.fallback).toBe(true);
    expect(g.board).toBe(FALLBACK.board);
    expect(g.start).toBe(FALLBACK.start);
    expect(g.par).toBe(FALLBACK_PAR);
    // The fallback is a real puzzle whose par is inside the range of every puzzle number.
    expect(bfsPar(FALLBACK.board.walls, FALLBACK.start, FALLBACK.board.exits)).toBe(FALLBACK_PAR);
    expect(solve(FALLBACK.board, FALLBACK.start)).toHaveLength(FALLBACK_PAR);
    for (let k = 1; k <= TWINS_PUZZLES; k++) {
      expect(FALLBACK_PAR).toBeGreaterThanOrEqual(parRange(k)[0]);
      expect(FALLBACK_PAR).toBeLessThanOrEqual(parRange(k)[1]);
    }
    // The same seed gives the same puzzle.
    expect(generatePuzzle(77, 3)).toEqual(generatePuzzle(77, 3));
  });

  it('AC-107: scoring is max(50, 300 − 15 per move beyond par); a puzzle at par is a combo', () => {
    expect(puzzleScore(9, 9)).toBe(300);
    expect(puzzleScore(8, 9)).toBe(300);
    expect(puzzleScore(10, 9)).toBe(285);
    expect(puzzleScore(9 + 16, 9)).toBe(60);
    expect(puzzleScore(9 + 17, 9)).toBe(50);
    expect(puzzleScore(9 + 24, 9)).toBe(50);

    const state = createTwins(5);
    const atPar = playSolution(state);
    expect(atPar.moves).toBe(state.par);
    expect(atPar.score).toBe(300);
    expect(atPar.combos).toBe(1);
    const path = solve(state.board, state.positions) as Direction[];
    const last = reduceTwins(path.slice(0, -1).reduce(play, state), { type: 'move', direction: path[path.length - 1] });
    expect(last.events).toContainEqual({ kind: 'score', points: 300 });
    expect(last.events).toContainEqual({ kind: 'combo' });

    // A first move off the shortest solution, then the shortest solution from there: 15 points per move beyond par.
    const detour = DIRECTIONS.map((d) => play(state, d)).find((s) => s.moves === 1 && (solve(s.board, s.positions) ?? []).length >= state.par) as TwinsState;
    const late = playSolution(detour);
    expect(late.result).toBe('solved');
    expect(late.moves).toBeGreaterThan(state.par);
    expect(late.score).toBe(300 - 15 * (late.moves - state.par));
    expect(late.combos).toBe(0);
  });

  it('AC-107: a puzzle still unsolved after par + 25 moves is failed (0 points) and the next one starts', () => {
    let s = createTwins(8);
    const par = s.par;
    for (let i = 0; i < par + TWINS_FAIL_AFTER - 1; i++) s = play(s, stalling(s));
    expect(s.puzzle).toBe(1);
    expect(s.result).toBeNull();
    expect(s.moves).toBe(par + TWINS_FAIL_AFTER - 1);
    const failed = reduceTwins(s, { type: 'move', direction: stalling(s) });
    expect(failed.events).toContainEqual({ kind: 'failed', puzzle: 1, reason: 'moves' });
    expect(failed.result).toBe('failed');
    expect(failed.score).toBe(0);
    expect(failed.combos).toBe(0);
    const next = wait(failed);
    expect(next.events).toEqual([{ kind: 'puzzle', puzzle: 2 }]);
    expect(next.puzzle).toBe(2);
    expect(next.moves).toBe(0);
    expect(next.score).toBe(0);
  });

  it('AC-107: a hint shows the next move of a shortest solution, counts down and is refused at 0', () => {
    const state = createTwins(3, { hint: 2 });
    expect(state.hintsLeft).toBe(2);
    const hinted = reduceTwins(state, { type: 'hint' });
    const expected = nextMove(state.board, state.positions) as Direction;
    expect(hinted.hint).toBe(expected);
    expect(hinted.events).toEqual([{ kind: 'hint', direction: expected }]);
    expect(hinted.hintsLeft).toBe(1);
    expect(hinted.moves).toBe(0); // a hint is not a move
    // A second hint while one is shown is refused.
    expect(reduceTwins(hinted, { type: 'hint' }).hintsLeft).toBe(1);
    // Playing the hinted move brings the puzzle one move closer to solved, and the hint is spent.
    const after = play(hinted, expected);
    expect(bfsPar(after.board.walls, after.positions, after.board.exits)).toBe(state.par - 1);
    expect(after.hint).toBeNull();
    // The hint follows the current positions, not the start.
    const second = reduceTwins(after, { type: 'hint' });
    expect(second.hint).toBe(nextMove(after.board, after.positions));
    expect(second.hintsLeft).toBe(0);
    const none = reduceTwins(play(second, second.hint as Direction), { type: 'hint' });
    expect(none.hint).toBeNull();
    expect(none.hintsLeft).toBe(0);
    expect(createTwins(3).hintsLeft).toBe(0);
    expect(reduceTwins(createTwins(3), { type: 'hint' }).hint).toBeNull();
    expect(createTwins(3, { hint: 3 }).hintsLeft).toBe(3);
    // No hint (and none spent) when the exits are out of reach.
    const lost = reduceTwins(withBoard(BOARD, { a: cellAt(2, 4), b: cellAt(2, 4) }, { hint: 1 }), { type: 'hint' });
    expect(lost.hint).toBeNull();
    expect(lost.hintsLeft).toBe(1);
  });

  it('AC-107: a round is 5 puzzles; the round ends after the 5th one has been shown', () => {
    let s = createTwins(12);
    const seen: number[] = [];
    for (let k = 1; k <= TWINS_PUZZLES; k++) {
      expect(s.puzzle).toBe(k);
      expect(s.status).toBe('playing');
      seen.push(s.par);
      s = playSolution(s);
      expect(s.result).toBe('solved');
      expect(s.score).toBe(300 * k);
      if (k < TWINS_PUZZLES) s = wait(s);
    }
    expect(seen).toHaveLength(5);
    expect(s.status).toBe('playing'); // the 5th solved puzzle is still shown
    const over = wait(s);
    expect(over.status).toBe('over');
    expect(over.events).toEqual([{ kind: 'over', score: 1500 }]);
    expect(over.score).toBe(1500);
    expect(over.combos).toBe(5);
    // Nothing moves after the end.
    expect(reduceTwins(over, { type: 'move', direction: 'up' }).positions).toBe(over.positions);
  });
});

describe('Duo Synchro balance and guards (AC-108)', () => {
  it('AC-108: the generator starts a round for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createTwins(seed * 7919);
      expect(state.status).toBe('playing');
      expect(state.puzzle).toBe(1);
      expect(state.par).toBeGreaterThanOrEqual(parRange(1)[0]);
      expect(solve(state.board, state.positions)).toHaveLength(state.par);
    }
  });

  it('AC-108: a move during the 120 ms guard changes nothing', () => {
    const state = createTwins(21);
    const [first, second] = solve(state.board, state.positions) as Direction[];
    const moved = reduceTwins(state, { type: 'move', direction: first });
    expect(moved.moves).toBe(1);
    const double = reduceTwins(moved, { type: 'move', direction: second });
    expect(double).toEqual({ ...moved, events: [{ kind: 'ignored' }] });
    expect(double.positions).toBe(moved.positions);
    const almost = reduceTwins(moved, { type: 'tick', dt: TWINS_MOVE_MS - 10 });
    expect(reduceTwins(almost, { type: 'move', direction: second }).moves).toBe(1);
    const done = reduceTwins(almost, { type: 'tick', dt: 10 });
    expect(reduceTwins(done, { type: 'move', direction: second }).moves).toBe(2);
    // A tick with nothing to wait for returns the same state (no re-render).
    expect(reduceTwins(done, { type: 'tick', dt: 50 })).toBe(done);
  });

  it('AC-108: the casual bot (shortest move, 30 % random direction) finishes every seed with a median between 1 and 3 stars over 50 seeds', () => {
    const scores: number[] = [];
    const failures = { dead_end: 0, moves: 0 };
    for (let seed = 1; seed <= 50; seed++) {
      const final = playTwinsBot(seed, undefined, (s) => {
        for (const e of s.events) if (e.kind === 'failed') failures[e.reason] += 1;
      });
      expect(final.status).toBe('over');
      expect(final.puzzle).toBe(TWINS_PUZZLES);
      scores.push(final.score);
    }
    const sorted = scores.slice().sort((a, b) => a - b);
    // Measured: min 425, p25 690, median 862.5, p90 1 140, max 1 230; 28 of the 250 puzzles failed (20 dead ends, 8 at
    // the move limit).
    expect(failures.dead_end + failures.moves).toBeLessThan(250);
    const stars = gameById('twins').stars;
    expect(sorted[0]).toBeGreaterThan(0);
    expect(median(scores)).toBeGreaterThanOrEqual(stars[0]);
    expect(median(scores)).toBeLessThan(stars[2]);
  });
});
