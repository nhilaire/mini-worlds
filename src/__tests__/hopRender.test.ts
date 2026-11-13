import { createHop, reduceHop } from '../game/hop/engine';
import { needsRender } from '../screens/game/HopGame';

// AC-73: the Saute-Lapin frame loop no longer re-renders React on every tick (phone test: the round lagged). Plain
// ticks only move Animated values; React re-renders on a spawn, a removal, an event, the shields or the end.
describe('Saute-Lapin rendering (AC-73)', () => {
  it('re-renders on a small fraction of the ticks of a played round', () => {
    let s = createHop(7, { shield: 3 });
    let ticks = 0;
    let renders = 0;
    for (let i = 0; i < 3000 && s.status === 'playing'; i++) {
      // Jump a little before each fence reaches the bunny (enough to play a while).
      const fence = s.obstacles.find((o) => o.x > 2);
      if (fence && fence.x - 2.8 < 1.2 && s.y === 0) s = reduceHop(s, { type: 'jump' });
      const next = reduceHop(s, { type: 'tick', dt: 16 });
      ticks++;
      if (needsRender(s, next)) renders++;
      s = next;
    }
    expect(ticks).toBeGreaterThan(500);
    expect(renders / ticks).toBeLessThan(0.1);
  });

  it('a plain tick in the air with the same fences needs no render, a spawn or an event does', () => {
    const s = reduceHop(createHop(7), { type: 'jump' });
    const tick = reduceHop(s, { type: 'tick', dt: 16 });
    expect(tick.y).toBeGreaterThan(0);
    expect(needsRender(s, tick)).toBe(false);
    expect(needsRender(s, { ...tick, events: [{ kind: 'combo' }] })).toBe(true);
    expect(needsRender(s, { ...tick, obstacles: [...tick.obstacles, { id: 99, x: 12, height: 1 }] })).toBe(true);
    expect(needsRender(s, { ...tick, status: 'over' })).toBe(true);
  });
});
