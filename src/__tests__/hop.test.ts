import {
  BUNNY_SIZE,
  BUNNY_X,
  createHop,
  gapRange,
  GRAVITY,
  HIGH_HEIGHT,
  HopState,
  JUMP_SPEED,
  LOW_HEIGHT,
  OBSTACLE_WIDTH,
  onGround,
  reduceHop,
  runSpeed,
  SPAWN_X,
} from '../game/hop/engine';

function tick(state: HopState, ms: number, chunk = 16): HopState {
  let s = state;
  for (let t = 0; t < ms && s.status === 'playing'; t += chunk) s = reduceHop(s, { type: 'tick', dt: Math.min(chunk, ms - t) });
  return s;
}

/** A state with only the given fences in the field (the spawn trail far behind so that nothing new appears soon). */
function withFences(state: HopState, fences: { x: number; height?: number }[]): HopState {
  return { ...state, obstacles: fences.map((f, i) => ({ id: 100 + i, x: f.x, height: f.height ?? LOW_HEIGHT })), trail: -100, nextGap: 1000 };
}

describe('Saute-Lapin engine (AC-60)', () => {
  it('starts on the ground with one fence at x = 12 and no shield without the upgrade', () => {
    const s = createHop(7);
    expect(s.y).toBe(0);
    expect(onGround(s)).toBe(true);
    expect(s.obstacles).toHaveLength(1);
    expect(s.obstacles[0].x).toBe(SPAWN_X);
    expect([LOW_HEIGHT, HIGH_HEIGHT]).toContain(s.obstacles[0].height);
    expect(s.shields).toBe(0);
    expect(createHop(7, { shield: 3 }).shields).toBe(3);
  });

  it('AC-60: a jump follows the speed and gravity of the rules (13.5 units/s, 36 units/s²: apex 2.53 units, 0.75 s in the air)', () => {
    const s0 = withFences(createHop(1), []);
    const jumped = reduceHop(s0, { type: 'jump' });
    expect(jumped.vy).toBe(JUMP_SPEED);
    expect(jumped.events).toEqual([{ kind: 'jump' }]);
    // Apex at t = 13.5 / 36 s (2.53125 units), whatever the tick length.
    const apexMs = (JUMP_SPEED / GRAVITY) * 1000;
    for (const chunk of [7, 16, 50]) {
      const atApex = tick(jumped, apexMs, chunk);
      expect(atApex.y).toBeCloseTo((13.5 * 13.5) / 72, 5);
    }
    const quarter = tick(jumped, 100);
    expect(quarter.y).toBeCloseTo(13.5 * 0.1 - 0.5 * 36 * 0.01, 6);
    // Still in the air just before 0.75 s, on the ground right after.
    expect(tick(jumped, 740).y).toBeGreaterThan(0);
    const landed = tick(jumped, 760);
    expect(landed.y).toBe(0);
    expect(onGround(landed)).toBe(true);
  });

  it('AC-60: a tap in the air is ignored', () => {
    const inAir = tick(reduceHop(withFences(createHop(1), []), { type: 'jump' }), 100);
    const again = reduceHop(inAir, { type: 'jump' });
    expect(again.vy).toBe(inAir.vy);
    expect(again.y).toBe(inAir.y);
    expect(again.events).toEqual([]);
    // Back on the ground, the next tap jumps again.
    const landed = tick(inAir, 700);
    expect(reduceHop(landed, { type: 'jump' }).vy).toBe(JUMP_SPEED);
  });

  it('AC-60: fences run left at 6 units/s + 0.2 per fence passed, capped at 14', () => {
    expect(runSpeed(0)).toBe(6);
    expect(runSpeed(5)).toBeCloseTo(7);
    expect(runSpeed(40)).toBe(14);
    expect(runSpeed(100)).toBe(14);
    const s = withFences(createHop(1), [{ x: 10 }]);
    expect(tick(s, 500).obstacles[0].x).toBeCloseTo(10 - 3, 6);
    const faster = { ...s, passed: 10 };
    expect(tick(faster, 500).obstacles[0].x).toBeCloseTo(10 - 4, 6);
  });

  it('AC-60: a fence passed scores 10 and speeds up the run', () => {
    // Jump just in time over a fence whose left edge is 2 units ahead of the bunny.
    let s = withFences(createHop(3), [{ x: BUNNY_X + 1.5 }]);
    s = reduceHop(s, { type: 'jump' });
    s = tick(s, 50);
    expect(s.y).toBeGreaterThan(0);
    const before = runSpeed(s.passed);
    s = tick(s, 600);
    expect(s.status).toBe('playing');
    expect(s.score).toBe(10);
    expect(s.passed).toBe(1);
    expect(s.streak).toBe(1);
    expect(runSpeed(s.passed)).toBeCloseTo(before + 0.2);
    expect(s.obstacles).toHaveLength(0);
  });

  it('AC-60: a hit consumes a shield, removes the fence, scores nothing and resets the streak', () => {
    const s = { ...withFences(createHop(4, { shield: 2 }), [{ x: BUNNY_X + 0.5 }]), streak: 3 };
    const hit = reduceHop(s, { type: 'tick', dt: 16 });
    expect(hit.status).toBe('playing');
    expect(hit.shields).toBe(1);
    expect(hit.obstacles).toHaveLength(0);
    expect(hit.score).toBe(0);
    expect(hit.streak).toBe(0);
    expect(hit.events).toContainEqual({ kind: 'hit', id: 100, shieldsLeft: 1 });
    expect(hit.lastHitMs).toBe(10); // first 10 ms physics sub-step
  });

  it('AC-60: a hit without shield ends the round with the current score', () => {
    const s = { ...withFences(createHop(4), [{ x: BUNNY_X + 0.5 }]), score: 40 };
    const over = reduceHop(s, { type: 'tick', dt: 16 });
    expect(over.status).toBe('over');
    expect(over.events).toContainEqual({ kind: 'over', score: 40 });
    // Nothing moves after the end.
    expect(reduceHop(over, { type: 'jump' })).toMatchObject({ status: 'over', events: [] });
  });

  it('AC-60: a 1.5-high fence is hit by a jump that clears a 1-high one too late', () => {
    // Fence touching the bunny on its rise: y < height means a hit.
    const low = withFences(createHop(1), [{ x: BUNNY_X + 0.5, height: LOW_HEIGHT }]);
    const high = withFences(createHop(1), [{ x: BUNNY_X + 0.5, height: HIGH_HEIGHT }]);
    const rising = (s: HopState) => ({ ...s, y: 1.2, vy: 1 });
    expect(reduceHop(rising(low), { type: 'tick', dt: 1 }).status).toBe('playing');
    expect(reduceHop(rising(high), { type: 'tick', dt: 1 }).status).toBe('over');
  });

  it('AC-60: spawns are seeded: same seed same fences, each spawned at x = 12, 25 % high', () => {
    const run = (seed: number) => {
      let s = createHop(seed, { shield: 3 });
      // The bunny is held high in the air so that every fence passes under it; each new fence is recorded once.
      const spawns: { id: number; x: number; height: number }[] = [];
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        s = reduceHop({ ...s, y: 5, vy: 0 }, { type: 'tick', dt: 16 });
        for (const o of s.obstacles) {
          if (!seen.has(o.id)) {
            seen.add(o.id);
            spawns.push({ id: o.id, x: o.x, height: o.height });
          }
        }
      }
      return { spawns, state: s };
    };
    const a = run(42);
    const b = run(42);
    const c = run(43);
    expect(a.spawns.map((o) => o.height)).toEqual(b.spawns.map((o) => o.height));
    expect(a.state.obstacles).toEqual(b.state.obstacles);
    expect(a.spawns.map((o) => o.height).join()).not.toEqual(c.spawns.map((o) => o.height).join());
    expect(a.spawns.length).toBeGreaterThan(20);
    // Every spawn appears at (or, by one tick at most, just left of) x = 12.
    for (const o of a.spawns.slice(1)) {
      expect(o.x).toBeLessThanOrEqual(SPAWN_X + 1e-9);
      expect(o.x).toBeGreaterThan(SPAWN_X - 14 * 0.016 - 1e-9);
    }
    const heights = [...Array(30).keys()].flatMap((seed) => run(seed * 7 + 1).spawns.map((o) => o.height));
    const high = heights.filter((h) => h === HIGH_HEIGHT).length / heights.length;
    expect(high).toBeGreaterThan(0.18);
    expect(high).toBeLessThan(0.32);
  });

  it('AC-60: the gap between two fences is the seeded distance of the rules', () => {
    expect(gapRange(6)).toEqual({ min: 5, max: 10 });
    expect(gapRange(10)).toEqual({ min: 8, max: 12 });
    expect(gapRange(14)).toEqual({ min: 14 * 0.8, max: 14 * 1.2 });
    // At least 0.8 s between two fences at any speed, longer than one jump (0.75 s).
    for (const v of [6, 8, 10, 12, 14]) expect(gapRange(v).min / v).toBeGreaterThanOrEqual(0.8 - 1e-9);
    let s = withFences(createHop(9), []);
    s = { ...s, trail: SPAWN_X - 1, nextGap: 6 };
    // 1 s at 6 units/s: after 5 units the trail is at 6, 12 − 6 meets the gap of 6 and a fence spawns at x = 12;
    // it then runs the last unit.
    s = reduceHop(s, { type: 'tick', dt: 1000 });
    expect(s.obstacles).toHaveLength(1);
    const fence = s.obstacles[0];
    expect(fence.x).toBeCloseTo(11, 6);
    const { min, max } = gapRange(runSpeed(0));
    expect(s.nextGap).toBeGreaterThanOrEqual(min);
    expect(s.nextGap).toBeLessThanOrEqual(max);
    expect(s.trail).toBeCloseTo(fence.x + OBSTACLE_WIDTH, 9);
  });

  it('AC-60: at 6 and 14 units/s a jump timed at the middle of its window clears a 1.5-high fence, and the bunny lands before the next fence at the minimum gap', () => {
    // Times above `h` during a jump: roots of 13.5 t − 18 t² = h. The fence (left edge x0) overlaps the bunny from
    // (x0 − 2.8) / v to (x0 − 1) / v: the jump window is x0 ∈ [2.8 + v t1, 1 + v t2]; its middle is used.
    const midJumpX = (v: number, h: number) => {
      const d = Math.sqrt(JUMP_SPEED * JUMP_SPEED - 2 * GRAVITY * h);
      const t1 = (JUMP_SPEED - d) / GRAVITY;
      const t2 = (JUMP_SPEED + d) / GRAVITY;
      const from = BUNNY_X + BUNNY_SIZE + v * t1;
      const to = BUNNY_X - OBSTACLE_WIDTH + v * t2;
      return { from, to, mid: (from + to) / 2 };
    };
    for (const v of [6, 14]) {
      const passedBefore = Math.round((v - 6) / 0.2);
      expect(runSpeed(passedBefore)).toBeCloseTo(v, 9);
      const w = midJumpX(v, HIGH_HEIGHT);
      // A comfortable window: about 180 ms at 6 units/s, more at 14.
      expect((w.to - w.from) / v).toBeGreaterThan(0.17);
      const x0 = w.mid;
      const xNext = x0 + OBSTACLE_WIDTH + gapRange(v).min;
      let s: HopState = {
        ...withFences(createHop(5), [{ x: x0, height: HIGH_HEIGHT }, { x: xNext, height: HIGH_HEIGHT }]),
        passed: passedBefore,
      };
      s = reduceHop(s, { type: 'jump' });
      // First fence cleared, the bunny lands while the next fence is still outside its own jump window.
      while (!(s.passed === passedBefore + 1 && onGround(s)) && s.status === 'playing') s = reduceHop(s, { type: 'tick', dt: 1 });
      expect(s.status).toBe('playing');
      expect(s.shields).toBe(0);
      const next = s.obstacles.find((o) => o.id === 101);
      expect(next).toBeDefined();
      expect(next!.x).toBeGreaterThan(midJumpX(runSpeed(s.passed), HIGH_HEIGHT).mid);
      // A second jump at the middle of the new window clears the next fence too.
      while (s.obstacles.find((o) => o.id === 101)!.x > midJumpX(runSpeed(s.passed), HIGH_HEIGHT).mid) s = reduceHop(s, { type: 'tick', dt: 1 });
      s = reduceHop(s, { type: 'jump' });
      while (s.passed < passedBefore + 2 && s.status === 'playing') s = reduceHop(s, { type: 'tick', dt: 1 });
      expect(s.status).toBe('playing');
      expect(s.passed).toBe(passedBefore + 2);
    }
  });

  it('AC-60: a combo every 5th fence passed in a row without a hit', () => {
    const fences = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ x: BUNNY_X - OBSTACLE_WIDTH + 0.01 + i * 0.001 }));
    // Ten fences about to be passed: each tick passes the ones whose right edge crossed x = 2.
    let s = { ...withFences(createHop(1), fences), y: 5 };
    s = reduceHop(s, { type: 'tick', dt: 16 });
    expect(s.passed).toBe(10);
    expect(s.combos).toBe(2);
    expect(s.events.filter((e) => e.kind === 'combo')).toHaveLength(2);

    // A hit in between resets the streak: 4 passes, a hit, 4 passes → no combo.
    let t = { ...withFences(createHop(1, { shield: 1 }), []), y: 0 };
    t = { ...t, streak: 4 };
    t = reduceHop({ ...t, obstacles: [{ id: 1, x: BUNNY_X + 0.2, height: 1 }] }, { type: 'tick', dt: 1 });
    expect(t.streak).toBe(0);
    t = { ...t, y: 5, obstacles: [0, 1, 2, 3].map((i) => ({ id: 10 + i, x: BUNNY_X - OBSTACLE_WIDTH + 0.01, height: 1 })) };
    t = reduceHop(t, { type: 'tick', dt: 16 });
    expect(t.streak).toBe(4);
    expect(t.combos).toBe(0);
  });
});
