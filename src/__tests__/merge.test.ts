import { WARRIORS, warriorSprite } from '../art/games/merge';
import { ICON } from '../art/icons/merge';
import { spriteSize, validateSprite } from '../art/sprites';
import { gameById } from '../game/core/content';
import {
  casualMergeMove,
  createMerge,
  hasMove,
  MERGE_CELLS,
  MERGE_GUARD_MS,
  MERGE_SIZE,
  MergeState,
  mergeScore,
  playCasualMerge,
  RECRUITS,
  reduceMerge,
  START_WARRIORS,
} from '../game/merge/engine';

/** Grid from 4 strings of 4 digits ('.' = empty). */
function grid(rows: string[], extra: Partial<MergeState> = {}): MergeState {
  const cells = rows.join('').split('').map((c) => (c === '.' ? 0 : Number(c)));
  return { ...createMerge(1), cells, selected: null, merges: 0, best: Math.max(...cells), ...extra };
}

const cell = (col: number, row: number) => row * MERGE_SIZE + col;
const tap = (s: MergeState, col: number, row: number) => reduceMerge(s, { type: 'tap', cell: cell(col, row) });
const settle = (s: MergeState) => reduceMerge(s, { type: 'tick', dt: MERGE_GUARD_MS });
const warriors = (s: MergeState) => s.cells.filter((v) => v > 0).length;
const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

describe('Fusion de Guerriers engine (AC-82)', () => {
  it('AC-82: the start holds 6 level-1 warriors with an adjacent pair, for every seed (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createMerge(seed * 104729 + 11);
      expect(s.status).toBe('playing');
      expect(s.cells.filter((v) => v === 1)).toHaveLength(START_WARRIORS);
      expect(warriors(s)).toBe(START_WARRIORS);
      expect(hasMove(s.cells)).toBe(true);
    }
    expect(START_WARRIORS).toBe(6);
    expect(createMerge(5)).toEqual(createMerge(5));
  });

  it('AC-82: tap a warrior, then an adjacent warrior of the same level: they merge in the second cell, scoring 10 × 2^(level − 1)', () => {
    const s0 = grid(['11..', '....', '..2.', '..2.']);
    const s1 = tap(s0, 0, 0);
    expect(s1.selected).toBe(cell(0, 0));
    const s2 = tap(s1, 1, 0);
    expect(s2.cells[cell(1, 0)]).toBe(2);
    expect(warriors(s2)).toBe(warriors(s0) - 1 + 2); // the pair became one warrior, two recruits joined
    expect(s2.score).toBe(20);
    expect(s2.selected).toBeNull();
    expect(s2.events).toContainEqual({ kind: 'merge', from: cell(0, 0), to: cell(1, 0), level: 2, points: 20 });
    const s3 = tap(tap(settle(s2), 2, 2), 2, 3);
    expect(s3.cells[cell(2, 3)]).toBe(3);
    expect(s3.score).toBe(20 + 40);
    expect([2, 3, 4, 5, 6].map(mergeScore)).toEqual([20, 40, 80, 160, 320]);
  });

  it('AC-82: only adjacent warriors of the same level merge (no diagonal, no other level)', () => {
    const s0 = grid(['1.2.', '.1.2', '....', '3...']);
    // Diagonal pair: the second tap selects instead.
    const diag = tap(tap(s0, 0, 0), 1, 1);
    expect(diag.score).toBe(0);
    expect(diag.selected).toBe(cell(1, 1));
    expect(diag.cells).toBe(s0.cells);
    // Adjacent, other level: selects instead.
    const other = tap(tap(grid(['12..', '....', '....', '11..']), 0, 0), 1, 0);
    expect(other.score).toBe(0);
    expect(other.selected).toBe(cell(1, 0));
    // A tap on the selected warrior or on an empty cell clears the selection; an empty cell alone selects nothing.
    expect(tap(tap(s0, 0, 0), 0, 0).selected).toBeNull();
    expect(tap(tap(s0, 0, 0), 3, 3).selected).toBeNull();
    expect(tap(s0, 3, 3).selected).toBeNull();
  });

  it('AC-82: two level-1 warriors spawn in empty cells after each merge, never more than the free cells', () => {
    expect(RECRUITS).toBe(2);
    for (const merges of [0, 1, 2, 5]) {
      const s0 = grid(['11..', '....', '....', '..11'], { merges });
      const s1 = tap(tap(s0, 0, 0), 1, 0);
      const spawns = s1.events.flatMap((e) => (e.kind === 'spawn' ? [e] : []));
      expect(spawns).toHaveLength(2);
      expect(spawns.map((e) => e.level)).toEqual([1, 1]);
      expect(spawns[0].cell).not.toBe(spawns[1].cell);
      for (const e of spawns) expect(s0.cells[e.cell] === 0 || e.cell === cell(0, 0)).toBe(true);
      expect(warriors(s1)).toBe(5);
    }
    // A full grid frees one cell per merge: only one spawn.
    const full = grid(['1123', '2345', '3456', '4567']);
    const after = tap(tap(full, 0, 0), 1, 0);
    expect(after.events.filter((e) => e.kind === 'spawn')).toHaveLength(1);
    expect(warriors(after)).toBe(MERGE_CELLS);
  });

  it('AC-82: each recruit is level 2 with the « Vétéran » chance (10 / 20 / 30 %)', () => {
    const bonusLevels = (veteran: number) => {
      let level2 = 0;
      for (let k = 0; k < 300; k++) {
        const s = tap(tap(grid(['11..', '....', '....', '..23'], { veteran, rngState: k * 2654435761 }), 0, 0), 1, 0);
        const spawns = s.events.flatMap((e) => (e.kind === 'spawn' ? [e.level] : []));
        expect(spawns).toHaveLength(2);
        level2 += spawns.filter((level) => level === 2).length;
      }
      return level2 / 600;
    };
    expect(bonusLevels(0)).toBe(0);
    expect(bonusLevels(1)).toBeGreaterThan(0.05);
    expect(bonusLevels(1)).toBeLessThan(0.15);
    expect(bonusLevels(3)).toBeGreaterThan(0.24);
    expect(bonusLevels(3)).toBeLessThan(0.36);
    expect(createMerge(1, { veteran: 2 }).veteran).toBe(2);
  });

  it('AC-82: the round ends as soon as no adjacent pair shares a level (full grid or not)', () => {
    // Sparse: after the merge and its spawn, check the engine's verdict matches the rule.
    for (let k = 0; k < 50; k++) {
      const s = tap(tap(grid(['11..', '....', '....', '...3'], { rngState: k * 7 + 1 }), 0, 0), 1, 0);
      expect(s.status).toBe(hasMove(s.cells) ? 'playing' : 'over');
      if (s.status === 'over') {
        expect(s.events.at(-1)).toEqual({ kind: 'over', score: 20 });
        expect(tap(settle(s), 0, 0)).toBe(s);
      }
    }
    // Full grid without a pair after the merge: over.
    const full = tap(tap(grid(['1132', '2341', '3412', '4123']), 0, 0), 1, 0);
    expect(full.cells).toEqual([1, 2, 3, 2, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]); // the recruit took the only free cell
    expect(full.status).toBe('over');
    // A pair left anywhere keeps the round going.
    expect(tap(tap(grid(['11..', '....', '....', '.22.']), 0, 0), 1, 0).status).toBe('playing');
  });

  it('AC-82: a merge that creates a level 5 warrior or higher is a combo', () => {
    const four = tap(tap(grid(['44..', '....', '....', '..11']), 0, 0), 1, 0);
    expect(four.combos).toBe(1);
    expect(four.events.filter((e) => e.kind === 'combo')).toHaveLength(1);
    expect(four.best).toBe(5);
    const three = tap(tap(grid(['33..', '....', '....', '..11']), 0, 0), 1, 0);
    expect(three.combos).toBe(0);
  });

  it('AC-86: the input guard ignores taps for 200 ms after a merge; a double tap changes nothing', () => {
    const s1 = tap(tap(grid(['11..', '....', '....', '..11']), 0, 0), 1, 0);
    expect(s1.busyMs).toBe(MERGE_GUARD_MS);
    const pair = casualMergeMove(s1.cells);
    expect(pair).not.toBeNull();
    const [a] = pair as [number, number];
    const double = reduceMerge(s1, { type: 'tap', cell: a });
    expect(double.selected).toBeNull();
    expect(double.cells).toBe(s1.cells);
    expect(double.events).toEqual([{ kind: 'ignored' }]);
    let s = s1;
    for (let i = 0; i < 3; i++) s = reduceMerge(s, { type: 'tick', dt: 50 });
    expect(reduceMerge(s, { type: 'tap', cell: a }).selected).toBeNull();
    s = reduceMerge(s, { type: 'tick', dt: 50 });
    expect(s.busyMs).toBe(0);
    expect(reduceMerge(s, { type: 'tap', cell: a }).selected).toBe(a);
    expect(reduceMerge(s, { type: 'tick', dt: 50 })).toBe(s);
  });

  it('AC-86: the casual bot plays the adjacent pair with the lowest level, top-left first', () => {
    expect(casualMergeMove(grid(['22..', '....', '.11.', '....']).cells)).toEqual([cell(1, 2), cell(2, 2)]);
    expect(casualMergeMove(grid(['.1..', '.1..', '....', '11..']).cells)).toEqual([cell(1, 0), cell(1, 1)]);
    expect(casualMergeMove(grid(['12..', '....', '....', '...3']).cells)).toBeNull();
  });

  it('AC-86: over 50 seeds the casual bot median reaches the 1-star threshold and stays below the 3-star threshold', () => {
    const m = median(Array.from({ length: 50 }, (_, i) => playCasualMerge(i + 1).score));
    const stars = gameById('merge').stars;
    expect(m).toBeGreaterThanOrEqual(stars[0]);
    expect(m).toBeLessThan(stars[2]);
  });
});

describe('Fusion de Guerriers sprites', () => {
  it('one warrior per level with its own silhouette, and a 12×12 icon', () => {
    const shapes = new Set(WARRIORS.map((s) => s.rows.map((r) => r.replace(/[^.]/g, '#')).join('\n')));
    expect(shapes.size).toBe(WARRIORS.length);
    for (const sprite of [...WARRIORS, ICON]) expect(validateSprite(sprite)).toEqual([]);
    for (const sprite of WARRIORS) expect(spriteSize(sprite)).toEqual({ width: 10, height: 10 });
    expect(spriteSize(ICON)).toEqual({ width: 12, height: 12 });
    expect(warriorSprite(1)).toBe(WARRIORS[0]);
    expect(warriorSprite(12)).toBe(WARRIORS[WARRIORS.length - 1]);
  });
});
