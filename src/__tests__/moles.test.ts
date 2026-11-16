import {
  CLEAR_POINTS,
  CLEARED_SHOW_MS,
  MOLES_CELLS,
  cellOf,
  count,
  createMoles,
  indexOf,
  molesForBoard,
  molesLeftToFlag,
  neighbours,
  reduceMoles,
  withMoles,
  type Cell,
  type MolesState,
} from '../game/moles/engine';

const dig = (s: MolesState, col: number, row: number) => reduceMoles(s, { type: 'dig', cell: { col, row } });
const flag = (s: MolesState, col: number, row: number) => reduceMoles(s, { type: 'flag', cell: { col, row } });
const radar = (s: MolesState) => reduceMoles(s, { type: 'radar' });
const kinds = (s: MolesState) => s.events.map((e) => e.kind);
const revealedCount = (s: MolesState) => s.revealed.filter(Boolean).length;
const c = (col: number, row: number): Cell => ({ col, row });

/** Eight moles filling the bottom-right 3 × 3 block except (6, 5), a safe cell walled in by numbered cells. */
const CORNER = [c(7, 7), c(6, 7), c(7, 6), c(6, 6), c(5, 7), c(7, 5), c(5, 5), c(5, 6)];

describe('Champ de Taupes engine: boards and the first dig (AC-68)', () => {
  it('board n hides 8 + 2 × (n − 1) moles, at most 16', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(molesForBoard)).toEqual([8, 10, 12, 14, 16, 16, 16]);
  });

  it('places the moles at the first dig, never on that cell nor its neighbours, over 100 seeds and cells', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = createMoles(seed, {});
      expect(s.moles).toBeNull();
      const first = cellOf((seed * 7) % MOLES_CELLS);
      const next = dig(s, first.col, first.row);
      expect(next.status).toBe('playing');
      expect(next.moles).toHaveLength(8);
      expect(new Set(next.moles).size).toBe(8);
      const forbidden = new Set([indexOf(first), ...neighbours(indexOf(first))]);
      for (const m of next.moles ?? []) expect(forbidden.has(m)).toBe(false);
    }
  });

  it('is deterministic for a seed', () => {
    expect(dig(createMoles(5, {}), 3, 3).moles).toEqual(dig(createMoles(5, {}), 3, 3).moles);
    expect(dig(createMoles(5, {}), 3, 3).moles).not.toEqual(dig(createMoles(6, {}), 3, 3).moles);
  });
});

describe('Champ de Taupes engine: counts and flood reveal (AC-68)', () => {
  it('a safe cell shows the number of its 8 neighbouring moles', () => {
    const s = withMoles(createMoles(1, {}), CORNER);
    expect(count(s, indexOf(c(6, 5)))).toBe(5);
    expect(count(s, indexOf(c(4, 4)))).toBe(1);
    expect(count(s, indexOf(c(4, 6)))).toBe(3);
    expect(count(s, indexOf(c(0, 0)))).toBe(0);
  });

  it('a numbered cell reveals only itself and scores 5', () => {
    const s = withMoles(createMoles(1, {}), CORNER);
    const next = dig(s, 4, 7);
    expect(next.events[0]).toEqual({ kind: 'dig', cells: [c(4, 7)], points: 5 });
    expect(next.score).toBe(5);
    expect(revealedCount(next)).toBe(1);
    expect(kinds(next)).not.toContain('combo');
  });

  it('a 0 digs its neighbours repeatedly (5 points per cell) and a dig of 10+ cells is a combo', () => {
    const s = withMoles(createMoles(1, {}), CORNER);
    const next = dig(s, 0, 0);
    // Every safe cell except (6, 5), whose open neighbours are all numbered.
    expect(revealedCount(next)).toBe(55);
    expect(next.revealed[indexOf(c(6, 5))]).toBe(false);
    expect(next.revealed[indexOf(c(4, 4))]).toBe(true); // a numbered border cell is revealed, not expanded
    expect(next.score).toBe(5 * 55);
    expect(kinds(next)).toContain('combo');
    expect(next.combos).toBe(1);
  });

  it('the flood does not dig a flagged cell', () => {
    const s = flag(withMoles(createMoles(1, {}), CORNER), 2, 2);
    const next = dig(s, 0, 0);
    expect(next.revealed[indexOf(c(2, 2))]).toBe(false);
    expect(revealedCount(next)).toBe(54);
  });
});

describe('Champ de Taupes engine: flags and moles (AC-68)', () => {
  it('a flag blocks digging; a second flag tap removes it; a revealed cell cannot be flagged', () => {
    const s = withMoles(createMoles(1, {}), CORNER);
    const flagged = flag(s, 4, 7);
    expect(flagged.events).toEqual([{ kind: 'flag', cell: c(4, 7), flagged: true }]);
    expect(molesLeftToFlag(flagged)).toBe(7);
    const blocked = dig(flagged, 4, 7);
    expect(kinds(blocked)).toEqual(['refused']);
    expect(blocked.revealed[indexOf(c(4, 7))]).toBe(false);
    const unflagged = flag(flagged, 4, 7);
    expect(unflagged.flagged[indexOf(c(4, 7))]).toBe(false);
    const dug = dig(unflagged, 4, 7);
    expect(kinds(flag(dug, 4, 7))).toEqual(['refused']);
    expect(kinds(dig(dug, 4, 7))).toEqual(['refused']);
  });

  it('a mole ends the round and reveals every mole', () => {
    const s = { ...withMoles(createMoles(1, {}), CORNER), score: 40 };
    const next = dig(s, 7, 7);
    expect(next.status).toBe('over');
    expect(next.score).toBe(40);
    expect(next.events).toEqual([{ kind: 'mole', cell: c(7, 7), moles: CORNER }, { kind: 'over', score: 40 }]);
    expect(kinds(dig(next, 0, 0))).toEqual(['refused']);
  });

  it('HUD moles left to flag: moles of the board minus flags, never below 0', () => {
    let s = createMoles(1, {});
    expect(molesLeftToFlag(s)).toBe(8);
    for (let i = 0; i < 10; i++) s = flag(s, i % 8, Math.floor(i / 8));
    expect(molesLeftToFlag(s)).toBe(0);
  });
});

describe('Champ de Taupes engine: cleared board (AC-68, AC-93)', () => {
  it('revealing every safe cell scores 300 and, after the cleared board is shown, deals the next board with 10 moles placed at its first dig', () => {
    const s = dig(withMoles(createMoles(1, {}), CORNER), 0, 0);
    const won = dig(s, 6, 5);
    expect(won.score).toBe(5 * 56 + CLEAR_POINTS);
    expect(won.events).toContainEqual({ kind: 'cleared', board: 1, points: 300 });
    const next = reduceMoles(won, { type: 'tick', dt: CLEARED_SHOW_MS });
    expect(next.boardNumber).toBe(2);
    expect(next.moles).toBeNull();
    expect(revealedCount(next)).toBe(0);
    expect(next.flagged.some(Boolean)).toBe(false);
    expect(next.status).toBe('playing');
    const second = dig(next, 4, 4);
    expect(second.moles).toHaveLength(10);
    expect(second.status).toBe('playing');
  });

  it('AC-93: the cleared board stays 1 200 ms, fully revealed, then the next board is dealt', () => {
    expect(CLEARED_SHOW_MS).toBe(1200);
    const won = dig(dig(withMoles(createMoles(1, {}), CORNER), 0, 0), 6, 5);
    expect(won.clearedMs).toBe(CLEARED_SHOW_MS);
    expect(won.boardNumber).toBe(1);
    expect(revealedCount(won)).toBe(MOLES_CELLS - CORNER.length);
    const almost = reduceMoles(won, { type: 'tick', dt: CLEARED_SHOW_MS - 1 });
    expect(almost.boardNumber).toBe(1);
    expect(almost.clearedMs).toBe(1);
    expect(almost.events).toEqual([]);
    const next = reduceMoles(almost, { type: 'tick', dt: 1 });
    expect(next.boardNumber).toBe(2);
    expect(next.clearedMs).toBe(0);
    expect(revealedCount(next)).toBe(0);
    expect(next.score).toBe(won.score);
  });

  it('AC-93: digs, flags and the radar are ignored while the cleared board is shown', () => {
    const won = dig(dig(withMoles(createMoles(1, { radar: 2 }), CORNER), 0, 0), 6, 5);
    for (const tapped of [dig(won, 7, 7), flag(won, 7, 7), radar(won)]) {
      expect(tapped.events).toEqual([{ kind: 'refused' }]);
      expect({ ...tapped, events: [] }).toEqual({ ...won, events: [] });
    }
  });

  it('AC-93: a tick outside a cleared board changes nothing', () => {
    const s = dig(withMoles(createMoles(1, {}), CORNER), 0, 0);
    const ticked = reduceMoles(s, { type: 'tick', dt: 500 });
    expect({ ...ticked, events: [] }).toEqual({ ...s, events: [] });
  });
});

describe('Champ de Taupes engine: radar (AC-68)', () => {
  it('has 0 / 1 / 2 / 3 uses per round with the « Radar » level', () => {
    expect([0, 1, 2, 3].map((radar) => createMoles(1, { radar }).radarLeft)).toEqual([0, 1, 2, 3]);
    expect(kinds(radar(withMoles(createMoles(1, {}), CORNER)))).toEqual(['refused']);
  });

  it('is refused before the first dig of a board (no mole placed yet), no use spent', () => {
    const s = radar(createMoles(1, { radar: 2 }));
    expect(kinds(s)).toEqual(['refused']);
    expect(s.radarLeft).toBe(2);
  });

  it('flags the first unflagged mole in seeded order, then refuses when every mole is flagged', () => {
    let s = withMoles(createMoles(1, { radar: 3 }), CORNER.slice(0, 2));
    s = flag(s, 7, 7); // the first mole is already flagged by hand
    s = radar(s);
    expect(s.events).toEqual([{ kind: 'radar', cell: c(6, 7) }]);
    expect(s.flagged[indexOf(c(6, 7))]).toBe(true);
    expect(s.radarLeft).toBe(2);
    const refusedAll = radar(s);
    expect(kinds(refusedAll)).toEqual(['refused']);
    expect(refusedAll.radarLeft).toBe(2);
  });

  it('follows the seeded placement order after a real first dig', () => {
    const s = dig(createMoles(9, { radar: 1 }), 3, 3);
    const next = radar(s);
    expect(next.events).toEqual([{ kind: 'radar', cell: cellOf((s.moles ?? [])[0]) }]);
    expect(next.radarLeft).toBe(0);
    expect(kinds(radar(next))).toEqual(['refused']);
  });
});
