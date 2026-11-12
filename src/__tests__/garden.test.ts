import { createRng } from '../game/rng';
import {
  ALL_VEGS,
  BASE_MOVES,
  BASE_VEGS,
  GARDEN_COLS,
  GARDEN_ROWS,
  ONION_FROM_MOVE,
  createGarden,
  findLines,
  findValidMoves,
  hasLine,
  movesLeft,
  reduceGarden,
  withBoard,
  type Board,
  type Cell,
  type GardenAction,
  type GardenState,
  type Veg,
} from '../game/garden/engine';

// Boards are written as 8 rows of 7 letters, row 0 at the top.
const LETTERS: Record<string, Veg> = { c: 'carrot', t: 'tomato', e: 'eggplant', m: 'corn', b: 'broccoli', o: 'onion' };
const parse = (rows: readonly string[]): Board => rows.map((row) => [...row].map((ch) => LETTERS[ch]));
const swap = (from: Cell, to: Cell): GardenAction => ({ type: 'swap', from, to });
const matches = (s: GardenState) => s.events.filter((e) => e.kind === 'match');
const hasOnion = (board: Board) => board.some((row) => row.includes('onion'));
const firstValid = (s: GardenState): GardenAction => {
  const move = findValidMoves(s.board)[0];
  return swap(move.from, move.to);
};
/** Alternating filler: no line of 3 and no valid move anywhere. */
const FILLER = ['bmbmbmb', 'etetete', 'bmbmbmb', 'etetete', 'bmbmbmb', 'etetete'];
/** Crafted bottom rows on the filler, with the rng state fixed so refills are reproducible. */
const craft = (row6: string, row7: string, upgrades: Record<string, number> = {}, rngState = 1): GardenState =>
  ({ ...withBoard(createGarden(1, upgrades), parse([...FILLER, row6, row7])), rngState });
/** The first rng state (from 1) for which the dispatched swap gives a result accepted by `ok`. */
const stateWhere = (make: (rngState: number) => GardenState, action: GardenAction, ok: (s: GardenState) => boolean): GardenState => {
  for (let rngState = 1; rngState < 500; rngState++) {
    const s = make(rngState);
    if (ok(reduceGarden(s, action))) return s;
  }
  throw new Error('no rng state gives the wanted result');
};
const exactlySteps = (steps: number) => (s: GardenState) => matches(s).length === steps && matches(s).every((e) => e.lines.length === 1);

describe('Potager Fou engine: initial board (AC-22)', () => {
  it('is 7 x 8, has no line of 3, at least one valid move and only the 5 base types, over 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGarden(seed, {});
      expect(s.board).toHaveLength(GARDEN_ROWS);
      for (const row of s.board) {
        expect(row).toHaveLength(GARDEN_COLS);
        for (const veg of row) expect(BASE_VEGS).toContain(veg);
      }
      expect(hasLine(s.board)).toBe(false);
      expect(findValidMoves(s.board).length).toBeGreaterThan(0);
      expect(s).toMatchObject({ score: 0, combos: 0, status: 'playing', events: [], movesLeft: BASE_MOVES, movesUsed: 0 });
    }
  });

  it('shuffles a board without any valid move into a valid one, scoring nothing and consuming no move', () => {
    const dead = parse([...FILLER, 'bmbmbmb', 'etetete']);
    expect(findValidMoves(dead)).toHaveLength(0);
    expect(hasLine(dead)).toBe(false);
    const s0 = withBoard(createGarden(7, {}), dead);
    const s1 = reduceGarden(s0, swap({ col: 0, row: 0 }, { col: 1, row: 0 }));
    expect(s1.events).toEqual([{ kind: 'shuffle' }]);
    expect(s1).toMatchObject({ score: 0, combos: 0, status: 'playing', movesLeft: s0.movesLeft, movesUsed: 0 });
    expect(hasLine(s1.board)).toBe(false);
    expect(findValidMoves(s1.board).length).toBeGreaterThan(0);
    expect(s1.board.flat().sort()).toEqual(dead.flat().sort()); // same pieces, permuted
    expect(s1.rngState).not.toBe(s0.rngState);
  });

  it('keeps the board playable after every swap of random full rounds', () => {
    for (let seed = 100; seed < 120; seed++) {
      const chooser = createRng(seed);
      let s = createGarden(seed, {});
      while (s.status === 'playing') {
        const move = chooser.pick(findValidMoves(s.board));
        s = reduceGarden(s, swap(move.from, move.to));
        expect(hasLine(s.board)).toBe(false);
        if (s.status === 'playing') expect(findValidMoves(s.board).length).toBeGreaterThan(0);
      }
      expect(s.movesUsed).toBe(BASE_MOVES);
    }
  });
});

describe('Potager Fou engine: swaps and scoring (AC-23)', () => {
  it('bounces back a swap that creates no line, consuming no move and leaving the board untouched', () => {
    const s0 = craft('bmcmbmb', 'ccemtet');
    const s1 = reduceGarden(s0, swap({ col: 0, row: 0 }, { col: 1, row: 0 }));
    expect(s1.events).toEqual([{ kind: 'swap_back', from: { col: 0, row: 0 }, to: { col: 1, row: 0 } }]);
    expect(s1.board).toEqual(s0.board);
    expect(s1).toMatchObject({ score: 0, movesLeft: BASE_MOVES, movesUsed: 0, rngState: s0.rngState });
  });

  it('ignores a swap of cells that are not orthogonal neighbours or outside the board', () => {
    const s0 = craft('bmcmbmb', 'ccemtet');
    for (const action of [
      swap({ col: 0, row: 0 }, { col: 1, row: 1 }),
      swap({ col: 0, row: 0 }, { col: 2, row: 0 }),
      swap({ col: 6, row: 7 }, { col: 7, row: 7 }),
      swap({ col: 0, row: -1 }, { col: 0, row: 0 }),
    ]) {
      const s1 = reduceGarden(s0, action);
      expect(s1.board).toEqual(s0.board);
      expect(s1.events).toEqual([]);
      expect(s1.movesLeft).toBe(BASE_MOVES);
    }
  });

  it('consumes one move and scores 100 for a line of 3; pieces fall and the board is refilled', () => {
    const s0 = stateWhere((r) => craft('bmcmbmb', 'ccemtet', {}, r), swap({ col: 2, row: 6 }, { col: 2, row: 7 }), exactlySteps(1));
    const s1 = reduceGarden(s0, swap({ col: 2, row: 6 }, { col: 2, row: 7 }));
    expect(s1.events[0]).toEqual({ kind: 'swap', from: { col: 2, row: 6 }, to: { col: 2, row: 7 } });
    expect(matches(s1)).toEqual([
      {
        kind: 'match',
        step: 1,
        lines: [{ cells: [{ col: 0, row: 7 }, { col: 1, row: 7 }, { col: 2, row: 7 }], points: 100 }],
        cells: [{ col: 0, row: 7 }, { col: 1, row: 7 }, { col: 2, row: 7 }],
        points: 100,
        board: expect.any(Array), // the swapped board, replayed by the screen (AC-51)
      },
    ]);
    expect(s1.events).toContainEqual({ kind: 'score', points: 100 });
    expect(s1).toMatchObject({ score: 100, combos: 0, movesLeft: BASE_MOVES - 1, movesUsed: 1, status: 'playing' });
    expect(movesLeft(s1)).toBe(BASE_MOVES - 1);
    // Columns 0-2 fell by one row: row 7 now holds what row 6 held after the swap (the eggplant went down to col 2).
    const swapped = parse([...FILLER, 'bmembmb', 'cccmtet']);
    expect(s1.board[7].slice(0, 3)).toEqual(['broccoli', 'corn', 'eggplant']);
    expect(s1.board[7].slice(3)).toEqual(s0.board[7].slice(3));
    for (let row = 1; row < GARDEN_ROWS; row++) {
      expect(s1.board[row].slice(0, 3)).toEqual(swapped[row - 1].slice(0, 3));
      expect(s1.board[row].slice(3)).toEqual(swapped[row].slice(3));
    }
    for (const veg of s1.board[0].slice(0, 3)) expect(BASE_VEGS).toContain(veg);
    expect(hasLine(s1.board)).toBe(false);
  });

  it('scores 200 for a line of 4 and 400 for a line of 5', () => {
    const four = reduceGarden(craft('bmcmbmb', 'ccecmbt'), swap({ col: 2, row: 6 }, { col: 2, row: 7 }));
    expect(matches(four)[0]).toMatchObject({ step: 1, points: 200 });
    expect(matches(four)[0].cells).toHaveLength(4);
    const five = reduceGarden(craft('bmcmbmb', 'cceccbt'), swap({ col: 2, row: 6 }, { col: 2, row: 7 }));
    expect(matches(five)[0]).toMatchObject({ step: 1, points: 400 });
    expect(matches(five)[0].cells).toHaveLength(5);
  });

  it('counts the two lines of an L shape separately (3 + 3 = 200 for 5 pieces)', () => {
    const board = parse([...FILLER.slice(0, 5), 'etctete', 'bmcmbmb', 'ccecmbt']);
    expect(hasLine(board)).toBe(false);
    const s0 = withBoard(createGarden(3, {}), board);
    const s1 = reduceGarden(s0, swap({ col: 2, row: 7 }, { col: 3, row: 7 }));
    const first = matches(s1)[0];
    expect(first).toMatchObject({ step: 1, points: 200 });
    expect(first.lines).toHaveLength(2);
    expect(first.cells).toHaveLength(5);
    expect(s1.score).toBe(s1.events.reduce((sum, e) => (e.kind === 'match' ? sum + e.points : sum), 0));
  });

  it('findLines reports every maximal run (a T counts one horizontal and one vertical line)', () => {
    const t = parse([...FILLER.slice(0, 5), 'etctete', 'bmcmbmb', 'cccctbt']);
    const lines = findLines(t);
    expect(lines).toEqual([
      { cells: [{ col: 0, row: 7 }, { col: 1, row: 7 }, { col: 2, row: 7 }, { col: 3, row: 7 }], points: 200 },
      { cells: [{ col: 2, row: 5 }, { col: 2, row: 6 }, { col: 2, row: 7 }], points: 100 },
    ]);
  });
});

describe('Potager Fou engine: cascades and the 6th type (AC-24)', () => {
  const cascadeSwap = swap({ col: 3, row: 6 }, { col: 3, row: 7 });
  // Swap makes row 7 = t c c c ...; the three carrots vanish, the two tomatoes above fall next to the fixed one.
  const cascadeBoard = (upgrades: Record<string, number>, rngState: number) => craft('ettcbmb', 'tccemet', upgrades, rngState);

  it.each([
    [0, 1, 200],
    [2, 2, 300],
  ])('multiplies step 2 by 1 + m with cascade level %i (m = %i) and counts one combo', (level, m, expected) => {
    const s0 = stateWhere((r) => cascadeBoard({ cascade: level }, r), cascadeSwap, exactlySteps(2));
    expect(hasLine(s0.board)).toBe(false);
    const s1 = reduceGarden(s0, cascadeSwap);
    const [step1, step2] = matches(s1);
    expect(step1).toMatchObject({ step: 1, points: 100 });
    expect(step1.cells).toEqual([{ col: 1, row: 7 }, { col: 2, row: 7 }, { col: 3, row: 7 }]);
    expect(step2).toMatchObject({ step: 2, points: 100 * (1 + m) });
    expect(step2.points).toBe(expected);
    expect(step2.cells).toEqual([{ col: 0, row: 7 }, { col: 1, row: 7 }, { col: 2, row: 7 }]);
    expect(s1.events).toContainEqual({ kind: 'cascade', step: 2 });
    expect(s1.events.filter((e) => e.kind === 'combo')).toHaveLength(1);
    expect(s1).toMatchObject({ combos: 1, score: 100 + expected, movesUsed: 1, movesLeft: BASE_MOVES - 1 });
  });

  it('multiplies step 3 by 1 + 2m (m = 1.5 at level 1)', () => {
    const s0 = craft('ettcbmb', 'tccemet', { cascade: 1 }, 1);
    for (let rngState = 1; rngState < 2000; rngState++) {
      const s1 = reduceGarden({ ...s0, rngState }, cascadeSwap);
      const third = matches(s1).find((e) => e.step === 3);
      if (third && third.lines.length === 1 && third.lines[0].points === 100) {
        expect(third.points).toBe(100 * (1 + 2 * 1.5));
        expect(s1.combos).toBe(matches(s1).length - 1);
        return;
      }
    }
    throw new Error('no rng state gives a plain third step');
  });

  it('never refills with the onion before the 11th valid move', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = createGarden(seed, {});
      while (s.movesUsed < ONION_FROM_MOVE - 1) {
        s = reduceGarden(s, firstValid(s));
        expect(hasOnion(s.board)).toBe(false);
      }
      expect(s.movesUsed).toBe(ONION_FROM_MOVE - 1);
    }
  });

  it('may refill with the onion from the 11th valid move', () => {
    let seedsWithOnion = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = createGarden(seed, {});
      let seen = false;
      while (s.status === 'playing') {
        s = reduceGarden(s, firstValid(s));
        if (hasOnion(s.board)) {
          expect(s.movesUsed).toBeGreaterThanOrEqual(ONION_FROM_MOVE);
          seen = true;
        }
      }
      if (seen) seedsWithOnion += 1;
    }
    expect(seedsWithOnion).toBeGreaterThan(0);
    expect(ALL_VEGS).toHaveLength(6);
  });
});

describe('Potager Fou engine: round end (AC-25)', () => {
  it.each([
    [0, 20],
    [3, 23],
  ])('with extra_move level %i the round lasts %i valid moves and ends with an over event', (level, total) => {
    let s = createGarden(11, { extra_move: level });
    expect(s.movesLeft).toBe(total);
    let valid = 0;
    while (s.status === 'playing') {
      s = reduceGarden(s, firstValid(s));
      valid += 1;
      expect(s.movesLeft).toBe(total - valid);
    }
    expect(valid).toBe(total);
    expect(s.movesUsed).toBe(total);
    expect(s.events[s.events.length - 1]).toEqual({ kind: 'over', score: s.score });
    expect(s.events.some((e) => e.kind === 'shuffle')).toBe(false); // nothing to reshuffle once the round is over
    const after = reduceGarden(s, firstValid(s));
    expect(after).toEqual({ ...s, events: [] });
  });
});

describe('Potager Fou engine: determinism (AC-16)', () => {
  it('gives deep-equal states for the same seed and the same actions', () => {
    const play = (): GardenState[] => {
      const states: GardenState[] = [createGarden(2026, { cascade: 1, extra_move: 1 })];
      let s = states[0];
      while (s.status === 'playing') {
        s = reduceGarden(s, firstValid(s));
        states.push(s);
      }
      return states;
    };
    const a = play();
    const b = play();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(21);
  });

  it('does not mutate the previous state', () => {
    const s0 = createGarden(5, {});
    const snapshot = JSON.parse(JSON.stringify(s0));
    reduceGarden(s0, firstValid(s0));
    expect(s0).toEqual(snapshot);
  });
});
