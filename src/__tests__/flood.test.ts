import {
  CLEAR_POINTS,
  FLOOD_COLOURS,
  FLOOD_SIZE,
  createFlood,
  isFilled,
  movesForBoard,
  reduceFlood,
  tideCells,
  tideColour,
  withBoard,
  type Board,
  type FloodColour,
  type FloodState,
} from '../game/flood/engine';

// Boards are written as 10 rows of 10 letters, row 0 at the top.
const LETTERS: Record<string, FloodColour> = { r: 'red', y: 'yellow', g: 'green', b: 'blue', p: 'purple' };
const parse = (rows: readonly string[]): Board => rows.map((row) => [...row].map((ch) => LETTERS[ch]));
const tap = (s: FloodState, colour: FloodColour) => reduceFlood(s, { type: 'colour', colour });
const kinds = (s: FloodState) => s.events.map((e) => e.kind);

/** Red everywhere except a blue top-left cell: one red tap fills the board. */
const ONE_TAP = parse(['b' + 'r'.repeat(9), ...Array.from({ length: 9 }, () => 'r'.repeat(10))]);
/** Top-left red, its right neighbour and the two below it green, a separate green cell far away, the rest yellow. */
const SMALL = parse(['rggyyyyyyy', 'gyyyyyyyyy', 'gyyyyyyyyy', 'yyyyyyyyyy', 'yyyyyyyyyy', 'yyyyyyyyyy', 'yyyyyyyyyy', 'yyyyyyyyyy', 'yyyyyyyyyy', 'yyyyyyyyyg']);

describe('Raz-de-Couleurs engine: boards and moves (AC-63)', () => {
  it('starts a 10 x 10 board of the 5 colours, not already filled, with 20 moves, over 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createFlood(seed, {});
      expect(s.board).toHaveLength(FLOOD_SIZE);
      for (const row of s.board) {
        expect(row).toHaveLength(FLOOD_SIZE);
        for (const c of row) expect(FLOOD_COLOURS).toContain(c);
      }
      expect(isFilled(s.board)).toBe(false);
      expect(s).toMatchObject({ score: 0, combos: 0, status: 'playing', boardNumber: 1, movesLeft: 20, events: [] });
    }
  });

  it('is deterministic for a seed', () => {
    expect(createFlood(42, {}).board).toEqual(createFlood(42, {}).board);
    expect(createFlood(42, {}).board).not.toEqual(createFlood(43, {}).board);
  });

  it('moves per board follow 20 − (n − 1), minimum 12, + 1 per « Coup en plus » level', () => {
    expect([1, 2, 5, 8, 9, 10, 20].map((n) => movesForBoard(n, 0))).toEqual([20, 19, 16, 13, 12, 12, 12]);
    expect(movesForBoard(1, 2)).toBe(22);
    expect(movesForBoard(12, 3)).toBe(15);
    expect(createFlood(1, { more_moves: 3 }).movesLeft).toBe(23);
  });
});

describe('Raz-de-Couleurs engine: a colour tap (AC-63)', () => {
  it('recolours the tide, which absorbs the adjacent cells of that colour (and only those connected)', () => {
    const s = withBoard(createFlood(1, {}), SMALL);
    expect(tideCells(s.board)).toHaveLength(1);
    const next = tap(s, 'green');
    expect(tideColour(next.board)).toBe('green');
    expect(tideCells(next.board)).toHaveLength(5);
    const flood = next.events.find((e) => e.kind === 'flood');
    expect(flood).toEqual({ kind: 'flood', colour: 'green', absorbed: [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 2, row: 0 }, { col: 0, row: 2 }] });
    expect(next.board[9][9]).toBe('green'); // the far green cell is not connected: unchanged and not in the tide
    expect(next.movesLeft).toBe(19);
    expect(next.score).toBe(0);
  });

  it('refuses the tide’s own colour: no move spent, board unchanged', () => {
    const s = withBoard(createFlood(1, {}), SMALL);
    const next = tap(s, 'red');
    expect(kinds(next)).toEqual(['refused']);
    expect(next.movesLeft).toBe(20);
    expect(next.board).toBe(s.board);
  });

  it('a tap that absorbs nothing still costs a move', () => {
    const s = withBoard(createFlood(1, {}), SMALL);
    const next = tap(s, 'blue');
    expect(next.events).toEqual([{ kind: 'flood', colour: 'blue', absorbed: [] }]);
    expect(next.movesLeft).toBe(19);
  });
});

describe('Raz-de-Couleurs engine: end of a board (AC-63)', () => {
  it('a full board scores 500 + 100 × moves left, counts a combo with 3+ moves left and deals board 2 with 19 moves', () => {
    const s = withBoard(createFlood(7, {}), ONE_TAP);
    const next = tap(s, 'red');
    expect(next.score).toBe(CLEAR_POINTS + 100 * 19);
    expect(next.events).toContainEqual({ kind: 'board_won', board: 1, movesLeft: 19, points: 2400 });
    expect(kinds(next)).toContain('combo');
    expect(next.combos).toBe(1);
    expect(next.status).toBe('playing');
    expect(next.boardNumber).toBe(2);
    expect(next.movesLeft).toBe(19);
    expect(isFilled(next.board)).toBe(false);
  });

  it('a board won with fewer than 3 moves left is not a combo', () => {
    const s = { ...withBoard(createFlood(7, {}), ONE_TAP), movesLeft: 3 };
    const next = tap(s, 'red');
    expect(next.score).toBe(500 + 100 * 2);
    expect(kinds(next)).not.toContain('combo');
    expect(next.combos).toBe(0);
  });

  it('a won board with the « Coup en plus » upgrade deals the next one with its extra moves', () => {
    const s = withBoard(createFlood(7, { more_moves: 2 }), ONE_TAP);
    expect(tap(s, 'red').movesLeft).toBe(19 + 2);
  });

  it('an exhausted board scores 3 × tide cells and ends the round', () => {
    const s = { ...withBoard(createFlood(1, {}), SMALL), movesLeft: 1, score: 1000 };
    const next = tap(s, 'green');
    expect(next.status).toBe('over');
    expect(next.movesLeft).toBe(0);
    expect(next.score).toBe(1000 + 3 * 5);
    expect(next.events).toContainEqual({ kind: 'board_lost', board: 1, tide: 5, points: 15 });
    expect(next.events).toContainEqual({ kind: 'over', score: 1015 });
    expect(kinds(tap(next, 'yellow'))).toEqual(['refused']);
  });

  it('a whole seeded round played greedily ends with a consistent score (never a combo without a won board)', () => {
    let s = createFlood(3, {});
    let wins = 0;
    for (let i = 0; i < 400 && s.status === 'playing'; i++) {
      // Greedy: the colour that absorbs the most cells.
      const best = FLOOD_COLOURS.filter((c) => c !== tideColour(s.board))
        .map((c) => ({ c, n: tideCells(reduceFlood(s, { type: 'colour', colour: c }).board).length }))
        .sort((a, b) => b.n - a.n)[0].c;
      s = tap(s, best);
      if (s.events.some((e) => e.kind === 'board_won')) wins += 1;
    }
    expect(s.status).toBe('over');
    expect(s.combos).toBeLessThanOrEqual(wins);
    expect(s.boardNumber).toBe(wins + 1);
  });
});
