import { Board, createGarden, findValidMoves, GARDEN_COLS, GARDEN_ROWS, reduceGarden, Veg, withBoard } from '../game/garden/engine';
import { buildReplay, FALL_MS, fallDistances, FLASH_MS, POP_MS, replayDuration, SWAP_MS, swapCells } from '../game/garden/replay';

const V: Record<string, Veg> = { c: 'carrot', t: 'tomato', e: 'eggplant', m: 'corn', b: 'broccoli' };

/** Rows from the top; letters map to vegetables. */
function board(rows: string[]): Board {
  expect(rows).toHaveLength(GARDEN_ROWS);
  return rows.map((r) => {
    expect(r).toHaveLength(GARDEN_COLS);
    return r.split('').map((ch) => V[ch]);
  });
}

// A board without lines where swapping (3,7) and (2,7) aligns three carrots on the bottom row.
const START = board(['ctectec', 'tectect', 'ectecte', 'ctectec', 'tectect', 'ectecte', 'ctectec', 'ccmcbmb']);

describe('replay plan of a swap (AC-51)', () => {
  it('a valid swap gives swap, then flash + pop + fall per cascade step, the first match board being the swapped board', () => {
    const state = withBoard(createGarden(1), START);
    const from = { col: 3, row: 7 };
    const to = { col: 2, row: 7 };
    const next = reduceGarden(state, { type: 'swap', from, to });
    expect(next.score).toBeGreaterThan(0);
    const phases = buildReplay(START, next);
    expect(phases.map((p) => p.kind)).toEqual(['swap', 'flash', 'pop', 'fall']);
    expect(phases[0]).toMatchObject({ board: START, from, to, ms: SWAP_MS });
    const flash = phases[1];
    if (flash.kind !== 'flash') throw new Error('flash expected');
    expect(flash.board).toEqual(swapCells(START, from, to));
    expect(flash.cells).toEqual(expect.arrayContaining([{ col: 0, row: 7 }, { col: 1, row: 7 }, { col: 2, row: 7 }]));
    expect(flash.points).toBe(100);
    expect(flash.ms).toBe(FLASH_MS);
    expect(phases[2]).toMatchObject({ kind: 'pop', cells: flash.cells, ms: POP_MS });
    const fall = phases[3];
    if (fall.kind !== 'fall') throw new Error('fall expected');
    expect(fall.board).toEqual(next.board);
    expect(fall.ms).toBe(FALL_MS);
    // Columns 0-2 lost their bottom piece: every survivor slid one row down and one new piece entered from above.
    for (const col of [0, 1, 2]) {
      expect(fall.fallen[0][col]).toBe(1);
      for (let row = 1; row < GARDEN_ROWS; row++) expect(fall.fallen[row][col]).toBe(1);
    }
    for (const col of [3, 4, 5, 6]) for (let row = 0; row < GARDEN_ROWS; row++) expect(fall.fallen[row][col]).toBe(0);
    expect(replayDuration(phases)).toBe(SWAP_MS + FLASH_MS + POP_MS + FALL_MS);
  });

  it('a refused swap gives a slide and a slide back', () => {
    const state = withBoard(createGarden(1), START);
    const from = { col: 0, row: 0 };
    const to = { col: 1, row: 0 };
    const next = reduceGarden(state, { type: 'swap', from, to });
    expect(next.events).toEqual([{ kind: 'swap_back', from, to }]);
    const phases = buildReplay(START, next);
    expect(phases.map((p) => p.kind)).toEqual(['swap', 'swap_back']);
    expect(phases[1]).toMatchObject({ board: swapCells(START, from, to), from, to });
  });

  it('fall distances: survivors keep their order, a hole in the middle pulls the pieces above it', () => {
    const removed = [{ col: 4, row: 3 }, { col: 4, row: 4 }, { col: 4, row: 5 }];
    const fallen = fallDistances(START, removed);
    // rows 0-2 of column 4 slide down 3 rows, the 3 new pieces on top travel 3 rows, rows 6-7 stay.
    expect([0, 1, 2].map((r) => fallen[r][4])).toEqual([3, 3, 3]); // new pieces
    expect([3, 4, 5].map((r) => fallen[r][4])).toEqual([3, 3, 3]); // former rows 0-2
    expect([6, 7].map((r) => fallen[r][4])).toEqual([0, 0]);
    expect(fallen.every((row) => row.every((d, c) => c === 4 || d === 0))).toBe(true);
  });

  it('every engine-generated swap replays with consistent boards (seeds 1-30)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = createGarden(seed);
      const move = findValidMoves(state.board)[0];
      const next = reduceGarden(state, { type: 'swap', from: move.from, to: move.to });
      const phases = buildReplay(state.board, next);
      expect(phases[0].kind).toBe('swap');
      const matches = next.events.filter((e) => e.kind === 'match');
      expect(phases.filter((p) => p.kind === 'flash')).toHaveLength(matches.length);
      const last = phases[phases.length - 1];
      if (last.kind === 'fall') expect(last.board).toEqual(next.board);
    }
  });
});
