import { FRUITS } from '../art/games/fruit';
import { ICON } from '../art/icons/fruit';
import { spriteSize, validateSprite } from '../art/sprites';
import {
  casualFruitMove,
  Cell,
  cellOf,
  createFruit,
  FRUIT_COLS,
  FRUIT_GUARD_MS,
  FRUIT_KINDS,
  FRUIT_ROUND,
  FRUIT_ROWS,
  FRUIT_STARS,
  FruitState,
  mergePoints,
  NEXT_MAX,
  playCasualFruit,
  reduceFruit,
  VANISH_POINTS,
} from '../game/fruit/engine';

/** A playing state with the given fruits ({ 'col,row': fruit }) and next fruit. */
function board(fruits: Record<string, number>, next: number, extra: Partial<FruitState> = {}): FruitState {
  const cells: Cell[] = new Array<Cell>(FRUIT_COLS * FRUIT_ROWS).fill(null);
  for (const [key, fruit] of Object.entries(fruits)) {
    const [col, row] = key.split(',').map(Number);
    cells[cellOf(col, row)] = fruit;
  }
  return { ...createFruit(1), cells, next, ...extra };
}

const at = (state: FruitState, col: number, row: number) => state.cells[cellOf(col, row)];
const count = (state: FruitState) => state.cells.filter((c) => c !== null).length;
const drop = (state: FruitState, col: number) => reduceFruit(state, { type: 'drop', col });
const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

describe('Fruits en Fusion engine (AC-76)', () => {
  it('AC-76: a fruit falls to the lowest empty cell of its column', () => {
    const s0 = createFruit(42);
    const s1 = drop(s0, 2);
    expect(at(s1, 2, FRUIT_ROWS - 1)).toBe(s0.next);
    expect(s1.events[0]).toEqual({ kind: 'drop', col: 2, row: FRUIT_ROWS - 1, fruit: s0.next });
    const s2 = drop(board({ '2,7': 3, '2,6': 1 }, 0), 2);
    expect(at(s2, 2, 5)).toBe(0);
    expect(count(s2)).toBe(3);
  });

  it('AC-76: a fruit merges with every touching fruit of its kind into the next index, in the lowest merged cell (left-most on a tie)', () => {
    // Three cerises in a row: one fraise in the left-most cell of the bottom row.
    const three = drop(board({ '0,7': 0, '2,7': 0 }, 0), 1);
    expect(at(three, 0, 7)).toBe(1);
    expect(count(three)).toBe(1);
    expect(three.score).toBe(20);
    expect(three.events).toContainEqual({ kind: 'merge', cells: [cellOf(1, 7), cellOf(0, 7), cellOf(2, 7)], at: cellOf(0, 7), fruit: 1, points: 20 });
    // Stacked: the lower cell keeps the new fruit.
    const stacked = drop(board({ '0,7': 0 }, 0), 0);
    expect(at(stacked, 0, 7)).toBe(1);
    expect(at(stacked, 0, 6)).toBeNull();
    // Side by side on the same row: the left-most cell.
    const side = drop(board({ '0,7': 6, '0,6': 2, '1,7': 5 }, 2), 1);
    expect(at(side, 0, 6)).toBe(3);
    expect(at(side, 1, 6)).toBeNull();
    // A fruit of another kind never merges.
    const other = drop(board({ '0,7': 1 }, 0), 0);
    expect(at(other, 0, 6)).toBe(0);
    expect(other.score).toBe(0);
  });

  it('AC-76: points follow 10 × 2^index of the new fruit (fraise 20 ... pastèque 1 280)', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(mergePoints)).toEqual([20, 40, 80, 160, 320, 640, 1280]);
    for (let fruit = 0; fruit < FRUIT_KINDS - 1; fruit++) {
      const s = drop(board({ '3,7': fruit }, fruit), 3);
      expect(at(s, 3, 7)).toBe(fruit + 1);
      expect(s.score).toBe(10 * 2 ** (fruit + 1));
    }
  });

  it('AC-76: the created fruit is checked again (chain), and a chain of 2+ merges is a combo', () => {
    // cerise on cerise → fraise at (1,7), which touches the fraise at (0,7) → raisin in the left-most cell.
    const s = drop(board({ '0,7': 1, '1,7': 0 }, 0), 1);
    expect(at(s, 0, 7)).toBe(2);
    expect(count(s)).toBe(1);
    expect(s.score).toBe(20 + 40);
    expect(s.combos).toBe(1);
    expect(s.events.filter((e) => e.kind === 'combo')).toHaveLength(1);
    // A single merge is not a combo.
    const single = drop(board({ '0,7': 0 }, 0), 0);
    expect(single.combos).toBe(0);
    expect(single.events.some((e) => e.kind === 'combo')).toBe(false);
  });

  it('AC-76: after a merge every fruit falls, and fruits that moved are checked again', () => {
    // Drop a cerise on (0,6): it merges with (0,7) and (1,6) into a fraise at (0,7); the orange above (1,6) falls to
    // (1,6), touches the orange at (2,6) and merges into a pomme at (1,6) (left-most of the lowest row).
    const s = drop(board({ '0,7': 0, '1,7': 5, '1,6': 0, '1,5': 3, '2,7': 4, '2,6': 3 }, 0), 0);
    expect(at(s, 0, 7)).toBe(1);
    expect(at(s, 1, 6)).toBe(4);
    expect(at(s, 1, 5)).toBeNull();
    expect(at(s, 2, 6)).toBeNull();
    expect(s.score).toBe(20 + 160);
    expect(s.combos).toBe(1);
    // Columns stay packed at the bottom.
    for (let col = 0; col < FRUIT_COLS; col++) {
      let seenEmpty = false;
      for (let row = FRUIT_ROWS - 1; row >= 0; row--) {
        if (at(s, col, row) === null) seenEmpty = true;
        else expect(seenEmpty).toBe(false);
      }
    }
  });

  it('AC-76: two pastèques that touch vanish for 2 000 points', () => {
    const s = drop(board({ '0,7': 7, '1,7': 6 }, 6), 1);
    expect(count(s)).toBe(0);
    expect(s.score).toBe(1280 + VANISH_POINTS);
    expect(s.events.some((e) => e.kind === 'vanish')).toBe(true);
    const direct = drop(board({ '4,7': 7 }, 7), 4);
    expect(count(direct)).toBe(0);
    expect(direct.score).toBe(2000);
  });

  it('AC-76: a tap on a full column is ignored', () => {
    const full: Record<string, number> = {};
    for (let row = 0; row < FRUIT_ROWS; row++) full[`0,${row}`] = row % 2 === 0 ? 2 : 3;
    const s0 = board(full, 2);
    const s1 = drop(s0, 0);
    expect(s1.cells).toBe(s0.cells);
    expect(s1.next).toBe(s0.next);
    expect(s1.drops).toBe(s0.drops);
    expect(s1.events).toEqual([{ kind: 'ignored' }]);
  });

  it('AC-76: the round ends when the next fruit fits in no column', () => {
    const almost: Record<string, number> = {};
    for (let col = 0; col < FRUIT_COLS; col++) for (let row = 0; row < FRUIT_ROWS; row++) if (!(col === 5 && row === 0)) almost[`${col},${row}`] = (col + row) % 2 === 0 ? 2 : 3;
    const s = drop(board(almost, 0), 5);
    expect(s.status).toBe('over');
    expect(s.events.at(-1)).toEqual({ kind: 'over', score: s.score });
    expect(drop(reduceFruit(s, { type: 'tick', dt: 1000 }), 0)).toBe(s);
    // While one cell is free the round goes on.
    expect(drop(board({ ...almost, '5,0': 0, '4,0': 1 }, 0), 4).status).toBe('playing');
  });

  it('AC-76: a round is 40 fruits: it ends after the 40th drop and its merges', () => {
    expect(FRUIT_ROUND).toBe(40);
    let s = createFruit(31);
    expect(s.fruitsLeft).toBe(40);
    for (let i = 0; i < 39; i++) s = reduceFruit(drop(s, casualFruitMove(s)), { type: 'tick', dt: FRUIT_GUARD_MS });
    expect(s.status).toBe('playing');
    expect(s.fruitsLeft).toBe(1);
    // The 40th drop merges on a matching top, scores, then ends the round.
    const last = drop(board({ '0,7': s.next }, s.next, { fruitsLeft: 1, score: 100 }), 0);
    expect(last.fruitsLeft).toBe(0);
    expect(last.score).toBe(100 + mergePoints(s.next + 1));
    expect(last.status).toBe('over');
    expect(last.events.at(-1)).toEqual({ kind: 'over', score: last.score });
    expect(playCasualFruit(31).drops).toBeLessThanOrEqual(FRUIT_ROUND);
  });

  it('AC-76: « Coup de balai » clears the bottom row without points, fruits above fall and merge; 1 / 2 / 3 uses', () => {
    expect([1, 2, 3].map((sweep) => createFruit(5, { sweep }).sweepsLeft)).toEqual([1, 2, 3]);
    expect(createFruit(5).sweepsLeft).toBe(0);
    // Bottom row cleared; the cerises above fall side by side and merge into a fraise.
    const s0 = board({ '0,7': 3, '1,7': 2, '0,6': 0, '1,6': 0, '3,7': 5 }, 1, { sweepsLeft: 1 });
    const s1 = reduceFruit(s0, { type: 'sweep' });
    expect(s1.sweepsLeft).toBe(0);
    expect(at(s1, 0, 7)).toBe(1);
    expect(at(s1, 1, 7)).toBeNull();
    expect(at(s1, 3, 7)).toBeNull();
    expect(count(s1)).toBe(1);
    expect(s1.score).toBe(20); // the merge only, nothing for the cleared row
    expect(s1.events[0]).toEqual({ kind: 'sweep', cells: [cellOf(0, 7), cellOf(1, 7), cellOf(3, 7)] });
    // No use left: refused.
    const s2 = reduceFruit(reduceFruit(s1, { type: 'tick', dt: FRUIT_GUARD_MS }), { type: 'sweep' });
    expect(s2.cells).toBe(s1.cells);
    expect(s2.events).toEqual([{ kind: 'ignored' }]);
  });

  it('AC-86: the input guard ignores taps for 300 ms after a drop; a double tap changes nothing', () => {
    const s0 = createFruit(9, { sweep: 1 });
    const s1 = drop(s0, 0);
    expect(s1.busyMs).toBe(FRUIT_GUARD_MS);
    const double = drop(s1, 0);
    expect(double.cells).toBe(s1.cells);
    expect(double.next).toBe(s1.next);
    expect(double.score).toBe(s1.score);
    expect(double.events).toEqual([{ kind: 'ignored' }]);
    expect(reduceFruit(s1, { type: 'sweep' }).sweepsLeft).toBe(1);
    // 50 ms frames: still guarded at 250 ms, open at 300 ms.
    let s = s1;
    for (let i = 0; i < 5; i++) s = reduceFruit(s, { type: 'tick', dt: 50 });
    expect(drop(s, 1).events).toEqual([{ kind: 'ignored' }]);
    s = reduceFruit(s, { type: 'tick', dt: 50 });
    expect(s.busyMs).toBe(0);
    expect(drop(s, 1).drops).toBe(2);
    // A tick with nothing to count down returns the same state (no re-render).
    expect(reduceFruit(s, { type: 'tick', dt: 50 })).toBe(s);
  });

  it('AC-86: every seed starts a round (200 seeds), and next fruits are always cerise..orange', () => {
    for (let seed = 0; seed < 200; seed++) {
      let s = createFruit(seed * 7919 + 3);
      expect(s.status).toBe('playing');
      expect(count(s)).toBe(0);
      for (let i = 0; i < 10; i++) {
        expect(s.next).toBeGreaterThanOrEqual(0);
        expect(s.next).toBeLessThanOrEqual(NEXT_MAX);
        s = reduceFruit(drop(s, i % FRUIT_COLS), { type: 'tick', dt: FRUIT_GUARD_MS });
      }
    }
    expect(NEXT_MAX).toBe(3);
    // Same seed, same round.
    expect(playCasualFruit(77, {}, 50)).toEqual(playCasualFruit(77, {}, 50));
  });

  it('AC-86: the casual bot drops on the column whose top fruit matches, else on the lowest column', () => {
    expect(casualFruitMove(board({ '0,7': 2, '1,7': 1, '1,6': 0, '2,7': 0 }, 0))).toBe(2); // two matching tops: the lowest
    expect(casualFruitMove(board({ '0,7': 2, '1,7': 1 }, 3))).toBe(2); // no match: an empty column, left-most
    const crowded: Record<string, number> = {};
    for (let col = 0; col < FRUIT_COLS; col++) for (let row = col === 4 ? 2 : 1; row < FRUIT_ROWS; row++) crowded[`${col},${row}`] = (col + row) % 2 === 0 ? 2 : 3;
    expect(casualFruitMove(board(crowded, 0))).toBe(4);
  });

  it('AC-86: over 50 seeds the casual bot median reaches the 1-star threshold and stays below the 3-star threshold', () => {
    const m = median(Array.from({ length: 50 }, (_, i) => playCasualFruit(i + 1).score));
    expect(m).toBeGreaterThanOrEqual(FRUIT_STARS[0]);
    expect(m).toBeLessThan(FRUIT_STARS[2]);
    for (const stars of FRUIT_STARS) expect(stars % 50).toBe(0);
  });
});

describe('Fruits en Fusion sprites', () => {
  it('8 distinct fruit sprites (shape, not only colour) and a 12×12 icon', () => {
    expect(FRUITS).toHaveLength(FRUIT_KINDS);
    const shapes = new Set(FRUITS.map((s) => s.rows.map((r) => r.replace(/[^.]/g, '#')).join('\n')));
    expect(shapes.size).toBe(FRUIT_KINDS);
    for (const sprite of [...FRUITS, ICON]) expect(validateSprite(sprite)).toEqual([]);
    expect(spriteSize(ICON)).toEqual({ width: 12, height: 12 });
  });
});
