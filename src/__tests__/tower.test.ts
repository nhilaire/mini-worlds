import { blockSpeed, createTower, MAX_SPEED, reduceTower, slide, TowerState } from '../game/tower/engine';

/** Slides the block to `x` by setting it directly (the slide itself is tested on its own). */
function at(state: TowerState, x: number): TowerState {
  return { ...state, block: { ...state.block, x } };
}

describe('Tour Bancale engine (AC-59)', () => {
  it('AC-59: the base is 4 units wide and centred; the first block starts at the left edge moving right', () => {
    const s = createTower(1, {});
    expect(s.floors).toEqual([{ x: 3, width: 4 }]);
    expect(s.block).toEqual({ x: 0, width: 4, dir: 1 });
    expect(s.status).toBe('playing');
  });

  it('AC-59: « Grand plateau » widens the base by 0.5 unit per level (4 → 5.5)', () => {
    expect(createTower(1, { wide: 1 }).floors[0]).toEqual({ x: 2.75, width: 4.5 });
    const s = createTower(1, { wide: 3 });
    expect(s.floors[0]).toEqual({ x: 2.25, width: 5.5 });
    expect(s.block.width).toBe(5.5);
  });

  it('AC-59: the block slides at 4 units/s + 0.25 per floor placed, capped at 12', () => {
    expect(blockSpeed(0)).toBe(4);
    expect(blockSpeed(4)).toBe(5);
    expect(blockSpeed(32)).toBe(12);
    expect(blockSpeed(100)).toBe(MAX_SPEED);
    const s = reduceTower(createTower(1, {}), { type: 'tick', dt: 500 });
    expect(s.block.x).toBeCloseTo(2);
    // After 4 floors the speed is 5 units/s.
    let t = createTower(1, {});
    for (let i = 0; i < 4; i++) t = reduceTower(at(t, t.floors[t.floors.length - 1].x), { type: 'drop' });
    expect(reduceTower(t, { type: 'tick', dt: 200 }).block.x).toBeCloseTo(1);
  });

  it('AC-59: the block bounces on the right edge (10 − width) and on the left edge', () => {
    let s = createTower(1, {});
    s = reduceTower(s, { type: 'tick', dt: 1750 }); // 7 units: 6 to the edge, 1 back
    expect(s.block.x).toBeCloseTo(5);
    expect(s.block.dir).toBe(-1);
    s = reduceTower(s, { type: 'tick', dt: 1500 }); // 6 units: 5 to the left edge, 1 back
    expect(s.block.x).toBeCloseTo(1);
    expect(s.block.dir).toBe(1);
    expect(slide({ x: 5, width: 5, dir: 1 }, 12).x).toBeCloseTo(3); // several bounces in one step
  });

  it('AC-59: an imperfect drop keeps only the overlap, scores 10 and resets the streak', () => {
    const s = reduceTower(at(createTower(1, {}), 4), { type: 'drop' });
    expect(s.floors[1]).toEqual({ x: 4, width: 3 });
    expect(s.block).toEqual({ x: 0, width: 3, dir: 1 });
    expect(s.score).toBe(10);
    expect(s.streak).toBe(0);
    expect(s.combos).toBe(0);
    expect(s.events).toContainEqual({ kind: 'place', floor: 1, perfect: false, points: 10, cut: { x: 7, width: 1 } });
    expect(s.events.some((e) => e.kind === 'combo')).toBe(false);
    const left = reduceTower(at(createTower(1, {}), 1.5), { type: 'drop' });
    expect(left.floors[1]).toEqual({ x: 3, width: 2.5 });
    expect(left.events).toContainEqual(expect.objectContaining({ kind: 'place', cut: { x: 1.5, width: 1.5 } }));
  });

  it('AC-59: a perfect drop (offset ≤ 0.15) aligns the floor, keeps the width and scores 10 + 5 × streak, with a combo', () => {
    let s = reduceTower(at(createTower(1, {}), 3.15), { type: 'drop' });
    expect(s.floors[1]).toEqual({ x: 3, width: 4 });
    expect(s.score).toBe(15);
    expect(s.streak).toBe(1);
    expect(s.combos).toBe(1);
    expect(s.events.filter((e) => e.kind === 'combo')).toHaveLength(1);
    s = reduceTower(at(s, 2.9), { type: 'drop' });
    expect(s.score).toBe(15 + 20);
    expect(s.streak).toBe(2);
    expect(s.combos).toBe(2);
    // An imperfect drop breaks the streak: the next perfect is +5 again.
    s = reduceTower(at(s, 3.5), { type: 'drop' });
    expect(s.score).toBe(35 + 10);
    expect(s.streak).toBe(0);
    s = reduceTower(at(s, 3.5), { type: 'drop' });
    expect(s.score).toBe(45 + 15);
    expect(s.combos).toBe(3);
  });

  it('AC-59: an offset just above 0.15 is not perfect', () => {
    const s = reduceTower(at(createTower(1, {}), 3.16), { type: 'drop' });
    expect(s.floors[1].width).toBeCloseTo(3.84);
    expect(s.streak).toBe(0);
    expect(s.combos).toBe(0);
  });

  it('AC-59: no overlap ends the round with the score unchanged; later actions are ignored', () => {
    let s = reduceTower(at(createTower(1, {}), 4), { type: 'drop' }); // top floor 4..7, width 3
    s = reduceTower(at(s, 7), { type: 'drop' }); // block 7..10: touches only the edge
    expect(s.status).toBe('over');
    expect(s.score).toBe(10);
    expect(s.events).toContainEqual({ kind: 'over', score: 10 });
    expect(reduceTower(s, { type: 'drop' })).toBe(s);
    expect(reduceTower(s, { type: 'tick', dt: 100 })).toBe(s);
    const missed = reduceTower(at(createTower(1, {}), 0), { type: 'drop' });
    expect(missed.status).toBe('playing'); // 0..4 overlaps 3..7 by 1
    expect(missed.floors[1]).toEqual({ x: 3, width: 1 });
  });
});
