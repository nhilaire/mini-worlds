import { Cell, cellOf, createFruit, FRUIT_COLS, FRUIT_GUARD_MS, FRUIT_ROWS, FruitState, guardFor, MERGE_STEP_MS, reduceFruit } from '../game/fruit/engine';
import { buildFruitReplay, DROP_MS, FALL_MS, FLASH_MS, fruitReplayDuration, phaseIndexAt, SHRINK_MS } from '../game/fruit/replay';

/** A playing state with the given fruits ({ 'col,row': fruit }) and next fruit. */
function board(fruits: Record<string, number>, next: number, extra: Partial<FruitState> = {}): FruitState {
  const cells: Cell[] = new Array<Cell>(FRUIT_COLS * FRUIT_ROWS).fill(null);
  for (const [key, fruit] of Object.entries(fruits)) {
    const [col, row] = key.split(',').map(Number);
    cells[cellOf(col, row)] = fruit;
  }
  return { ...createFruit(1), cells, next, ...extra };
}

const drop = (state: FruitState, col: number) => reduceFruit(state, { type: 'drop', col });

// AC-91 (v0.3.0 phone test): a merge must be seen. The replay plan of a drop lists the drop, then for each merge or
// vanish step a flash (merged cells framed, points), a shrink into the new fruit's cell and a fall.
describe('Fruits en Fusion replay plan (AC-91)', () => {
  it('AC-91: one merge step lasts 280 + 220 + 180 = 680 ms; the guard covers the drop and every step', () => {
    expect([DROP_MS, FLASH_MS, SHRINK_MS, FALL_MS]).toEqual([FRUIT_GUARD_MS, 280, 220, 180]);
    expect(MERGE_STEP_MS).toBe(FLASH_MS + SHRINK_MS + FALL_MS);
    expect([0, 1, 3].map(guardFor)).toEqual([300, 980, 2340]);
  });

  it('AC-91: a drop without merge is a drop phase only, on the final board, and the guard stays 300 ms', () => {
    const before = createFruit(42);
    const next = drop(before, 2);
    const phases = buildFruitReplay(before.cells, next);
    expect(phases.map((p) => p.kind)).toEqual(['drop']);
    expect(phases[0]).toMatchObject({ cell: cellOf(2, FRUIT_ROWS - 1), board: next.cells, ms: DROP_MS });
    expect(next.busyMs).toBe(FRUIT_GUARD_MS);
  });

  it('AC-91: three cerises: the drop, then flash of the 3 cells with +20, shrink into the fraise cell, fall to the final board', () => {
    const before = board({ '0,7': 0, '2,7': 0 }, 0);
    const next = drop(before, 1);
    const phases = buildFruitReplay(before.cells, next);
    expect(phases.map((p) => p.kind)).toEqual(['drop', 'flash', 'shrink', 'fall']);
    const [dropped, flash, shrink, fall] = phases;
    expect(dropped.board[cellOf(1, 7)]).toBe(0);
    expect(flash).toMatchObject({ cells: [cellOf(1, 7), cellOf(0, 7), cellOf(2, 7)], at: cellOf(0, 7), points: 20, ms: FLASH_MS });
    expect(flash.board).toEqual(dropped.board);
    // Shrink: the merged cells are empty but the new fruit, which grows in its cell.
    expect(shrink).toMatchObject({ at: cellOf(0, 7), fruit: 1, ms: SHRINK_MS });
    expect([cellOf(1, 7), cellOf(2, 7)].map((c) => shrink.board[c])).toEqual([null, null]);
    expect(shrink.board[cellOf(0, 7)]).toBe(1);
    expect(fall.board).toEqual(next.cells);
    expect(fruitReplayDuration(phases)).toBe(next.busyMs);
    expect(next.busyMs).toBe(guardFor(1));
  });

  it('AC-91: a chain plays step by step: each flash starts on the board left by the previous fall', () => {
    // Cerise on a cerise (fraise at the bottom), next to a fraise: the fraise merges again into a raisin.
    const before = board({ '0,7': 0, '1,7': 1 }, 0);
    const next = drop(before, 0);
    const phases = buildFruitReplay(before.cells, next);
    expect(phases.map((p) => p.kind)).toEqual(['drop', 'flash', 'shrink', 'fall', 'flash', 'shrink', 'fall']);
    expect(phases[4].board).toEqual(phases[3].board);
    expect(phases[4]).toMatchObject({ points: 40 });
    expect(phases[6].board).toEqual(next.cells);
    expect(fruitReplayDuration(phases)).toBe(next.busyMs);
    expect(next.busyMs).toBe(guardFor(2));
  });

  it('AC-91: two pastèques vanish: flash with +2 000, shrink to nothing, fall', () => {
    const before = board({ '3,7': 7 }, 7);
    const next = drop(before, 3);
    const phases = buildFruitReplay(before.cells, next);
    expect(phases.map((p) => p.kind)).toEqual(['drop', 'flash', 'shrink', 'fall']);
    expect(phases[1]).toMatchObject({ points: 2000, at: null });
    expect(phases[2]).toMatchObject({ at: null, fruit: null });
    expect(phases[2].board.every((c) => c === null)).toBe(true);
    expect(fruitReplayDuration(phases)).toBe(next.busyMs);
  });

  it('AC-91: every engine-generated drop replays consistently (seeds 1-30, whole rounds)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = createFruit(seed);
      for (let i = 0; i < 40 && s.status === 'playing'; i++) {
        const next = drop(s, (seed + i * 5) % FRUIT_COLS);
        if (next.events.some((e) => e.kind === 'ignored')) break;
        const phases = buildFruitReplay(s.cells, next);
        expect(phases[0].kind).toBe('drop');
        expect(phases.at(-1)?.board).toEqual(next.cells);
        expect(fruitReplayDuration(phases)).toBe(next.busyMs);
        for (let k = 1; k + 3 < phases.length; k += 3) expect(phases[k + 3].board).toEqual(phases[k + 2].board);
        s = reduceFruit(next, { type: 'tick', dt: next.busyMs });
      }
    }
  });

  it('AC-91: the phase on show follows the elapsed time, and the replay is over after its duration', () => {
    const before = board({ '0,7': 0, '2,7': 0 }, 0);
    const phases = buildFruitReplay(before.cells, drop(before, 1));
    expect([0, 299, 300, 579, 580, 799, 800, 979, 980, 5000].map((t) => phaseIndexAt(phases, t))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
