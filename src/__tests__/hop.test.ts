import {
  BUNNY_SIZE,
  BUNNY_X,
  createHop,
  gapRange,
  GRAVITY,
  HopState,
  JUMP_SPEED,
  kindFor,
  makeObstacle,
  OBSTACLE_SHAPES,
  ObstacleKind,
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

/** A state with only the given obstacles in the field (the spawn trail far behind so that nothing new appears soon). */
function withObstacles(state: HopState, list: { x: number; kind?: ObstacleKind }[]): HopState {
  return { ...state, obstacles: list.map((o, i) => makeObstacle(100 + i, o.kind ?? 'fence', o.x)), trail: -100, nextGap: 1000 };
}

/** Obstacles passed so that the run speed is `v` (15 is the cap). */
function passedFor(v: number): number {
  return v >= 15 ? 26 : Math.round((v - 6) / 0.35);
}

/**
 * Jump window of a ground obstacle: the bunny must be above its top while the boxes share x. Times above `h`: roots
 * of 13.5 t − 18 t² = h. The obstacle (left edge x0, width w) shares x with the bunny from (x0 − 2.8) / v to
 * (x0 + w − 2) / v, so x0 ∈ [2.8 + v t1, 2 − w + v t2]; `mid` is the middle of it.
 */
function jumpWindow(v: number, kind: ObstacleKind): { from: number; to: number; mid: number } {
  const { width, height } = OBSTACLE_SHAPES[kind];
  const d = Math.sqrt(JUMP_SPEED * JUMP_SPEED - 2 * GRAVITY * height);
  const t1 = (JUMP_SPEED - d) / GRAVITY;
  const t2 = (JUMP_SPEED + d) / GRAVITY;
  const from = BUNNY_X + BUNNY_SIZE + v * t1;
  const to = BUNNY_X - width + v * t2;
  return { from, to, mid: (from + to) / 2 };
}

/** Records every obstacle spawned in a run where the bunny hovers out of reach and `passed` is held at `heldPassed`. */
function spawnsOf(seed: number, heldPassed: number | null, ticks = 2000) {
  let s = createHop(seed, { shield: 3 });
  const seen = new Map<number, { kind: ObstacleKind; x: number }>();
  for (const o of s.obstacles) seen.set(o.id, { kind: o.kind, x: o.x });
  for (let i = 0; i < ticks; i++) {
    s = reduceHop({ ...s, y: 5, vy: 0, passed: heldPassed ?? s.passed }, { type: 'tick', dt: 16 });
    for (const o of s.obstacles) if (!seen.has(o.id)) seen.set(o.id, { kind: o.kind, x: o.x });
  }
  return { spawns: [...seen.values()], state: s };
}

describe('Saute-Lapin engine (AC-60)', () => {
  it('starts on the ground with one obstacle (no bird) at x = 12 and no shield without the upgrade', () => {
    const s = createHop(7);
    expect(s.y).toBe(0);
    expect(onGround(s)).toBe(true);
    expect(s.obstacles).toHaveLength(1);
    expect(s.obstacles[0].x).toBe(SPAWN_X);
    expect(['fence', 'tall', 'hedge']).toContain(s.obstacles[0].kind);
    expect(s.shields).toBe(0);
    expect(createHop(7, { shield: 3 }).shields).toBe(3);
  });

  it('AC-60: obstacle kinds have the sizes of the rules', () => {
    expect(OBSTACLE_SHAPES).toEqual({
      fence: { width: 1, bottom: 0, height: 1 },
      tall: { width: 1, bottom: 0, height: 1.5 },
      hedge: { width: 2, bottom: 0, height: 1 },
      bird: { width: 1, bottom: 1.3, height: 0.6 },
    });
  });

  it('AC-60: a jump follows the speed and gravity of the rules (13.5 units/s, 36 units/s²: apex 2.53 units, 0.75 s in the air)', () => {
    const s0 = withObstacles(createHop(1), []);
    const jumped = reduceHop(s0, { type: 'jump' });
    expect(jumped.vy).toBe(JUMP_SPEED);
    expect(jumped.events).toEqual([{ kind: 'jump' }]);
    // Apex at t = 13.5 / 36 s (2.53125 units), whatever the tick length.
    const apexMs = (JUMP_SPEED / GRAVITY) * 1000;
    for (const chunk of [7, 16, 50]) expect(tick(jumped, apexMs, chunk).y).toBeCloseTo((13.5 * 13.5) / 72, 5);
    expect(tick(jumped, 100).y).toBeCloseTo(13.5 * 0.1 - 0.5 * 36 * 0.01, 6);
    // Still in the air just before 0.75 s, on the ground right after.
    expect(tick(jumped, 740).y).toBeGreaterThan(0);
    const landed = tick(jumped, 760);
    expect(landed.y).toBe(0);
    expect(onGround(landed)).toBe(true);
  });

  it('AC-60: a tap in the air is ignored', () => {
    const inAir = tick(reduceHop(withObstacles(createHop(1), []), { type: 'jump' }), 100);
    const again = reduceHop(inAir, { type: 'jump' });
    expect(again.vy).toBe(inAir.vy);
    expect(again.y).toBe(inAir.y);
    expect(again.events).toEqual([]);
    const landed = tick(inAir, 700);
    expect(reduceHop(landed, { type: 'jump' }).vy).toBe(JUMP_SPEED);
  });

  it('AC-60: obstacles run left at 6 units/s + 0.35 per obstacle passed, capped at 15', () => {
    expect(runSpeed(0)).toBe(6);
    expect(runSpeed(1)).toBeCloseTo(6.35, 9);
    expect(runSpeed(10)).toBeCloseTo(9.5, 9);
    expect(runSpeed(25)).toBeCloseTo(14.75, 9);
    expect(runSpeed(26)).toBe(15);
    expect(runSpeed(100)).toBe(15);
    const s = withObstacles(createHop(1), [{ x: 10 }]);
    expect(tick(s, 500).obstacles[0].x).toBeCloseTo(10 - 3, 6);
    expect(tick({ ...s, passed: 10 }, 500).obstacles[0].x).toBeCloseTo(10 - 4.75, 6);
    expect(tick({ ...s, passed: 40 }, 400).obstacles[0].x).toBeCloseTo(10 - 6, 6);
  });

  it('AC-60: an obstacle passed scores 10 and speeds up the run', () => {
    let s = withObstacles(createHop(3), [{ x: BUNNY_X + 1.5 }]);
    s = reduceHop(s, { type: 'jump' });
    s = tick(s, 650);
    expect(s.status).toBe('playing');
    expect(s.score).toBe(10);
    expect(s.passed).toBe(1);
    expect(s.streak).toBe(1);
    expect(runSpeed(s.passed)).toBeCloseTo(6.35, 9);
    expect(s.obstacles).toHaveLength(0);
  });

  it('AC-60: a hit consumes a shield, removes the obstacle, scores nothing and resets the streak', () => {
    const s = { ...withObstacles(createHop(4, { shield: 2 }), [{ x: BUNNY_X + 0.5 }]), streak: 3 };
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
    const s = { ...withObstacles(createHop(4), [{ x: BUNNY_X + 0.5 }]), score: 40 };
    const over = reduceHop(s, { type: 'tick', dt: 16 });
    expect(over.status).toBe('over');
    expect(over.events).toContainEqual({ kind: 'over', score: 40 });
    expect(reduceHop(over, { type: 'jump' })).toMatchObject({ status: 'over', events: [] });
  });

  it('AC-60: collision uses the bottom and height of each kind (a 1.5-high fence catches a bunny that clears a 1-high one)', () => {
    const rising = (kind: ObstacleKind) => ({ ...withObstacles(createHop(1), [{ x: BUNNY_X + 0.5, kind }]), y: 1.2, vy: 1 });
    expect(reduceHop(rising('fence'), { type: 'tick', dt: 1 }).status).toBe('playing');
    expect(reduceHop(rising('hedge'), { type: 'tick', dt: 1 }).status).toBe('playing');
    expect(reduceHop(rising('tall'), { type: 'tick', dt: 1 }).status).toBe('over');
    expect(reduceHop(rising('bird'), { type: 'tick', dt: 1 }).status).toBe('over');
  });

  it('AC-60: a bird passes over a bunny on the ground without a hit, and hits a bunny jumping into it', () => {
    let under = withObstacles(createHop(2), [{ x: BUNNY_X + 1, kind: 'bird' }]);
    under = tick(under, 600);
    expect(under.status).toBe('playing');
    expect(under.passed).toBe(1);
    expect(under.score).toBe(10);
    expect(under.events.some((e) => e.kind === 'hit')).toBe(false);

    // Jumping when the bird is just ahead: the rising bunny reaches its altitude while under it.
    let into = withObstacles(createHop(2, { shield: 1 }), [{ x: BUNNY_X + 1.5, kind: 'bird' }]);
    into = reduceHop(into, { type: 'jump' });
    const hits: number[] = [];
    for (let i = 0; i < 40 && into.obstacles.length > 0; i++) {
      into = reduceHop(into, { type: 'tick', dt: 16 });
      for (const e of into.events) if (e.kind === 'hit') hits.push(e.id);
    }
    expect(hits).toEqual([100]);
    expect(into.shields).toBe(0);
    expect(into.passed).toBe(0);
  });

  it('AC-60: spawns are seeded: same seed same obstacles, each spawned at x = 12', () => {
    const a = spawnsOf(42, null);
    const b = spawnsOf(42, null);
    const c = spawnsOf(43, null);
    expect(a.spawns.map((o) => o.kind)).toEqual(b.spawns.map((o) => o.kind));
    expect(a.state.obstacles).toEqual(b.state.obstacles);
    expect(a.spawns.map((o) => o.kind).join()).not.toEqual(c.spawns.map((o) => o.kind).join());
    expect(a.spawns.length).toBeGreaterThan(15);
    // Every spawn appears at (or, by one tick at most, just left of) x = 12.
    for (const o of a.spawns) {
      expect(o.x).toBeLessThanOrEqual(SPAWN_X + 1e-9);
      expect(o.x).toBeGreaterThan(SPAWN_X - 15 * 0.016 - 1e-9);
    }
  });

  it('AC-60: kinds follow the tables: 60 / 25 / 15 % before 10 passed (never a bird), then 40 / 20 / 20 / 20 %', () => {
    const share = (kinds: ObstacleKind[], k: ObstacleKind) => kinds.filter((x) => x === k).length / kinds.length;
    const early = [...Array(60).keys()].flatMap((seed) => spawnsOf(seed * 13 + 1, 0, 1200).spawns.map((o) => o.kind));
    const late = [...Array(60).keys()].flatMap((seed) => spawnsOf(seed * 13 + 1, 12, 1200).spawns.map((o) => o.kind).slice(1));
    expect(early.length).toBeGreaterThan(600);
    expect(late.length).toBeGreaterThan(600);
    expect(share(early, 'bird')).toBe(0);
    expect(share(early, 'fence')).toBeCloseTo(0.6, 1);
    expect(share(early, 'tall')).toBeCloseTo(0.25, 1);
    expect(share(early, 'hedge')).toBeCloseTo(0.15, 1);
    for (const k of ['tall', 'hedge', 'bird'] as const) expect(share(late, k)).toBeCloseTo(0.2, 1);
    expect(share(late, 'fence')).toBeCloseTo(0.4, 1);
    // The tables themselves, at their edges.
    expect([0, 0.59, 0.6, 0.84, 0.85, 0.99].map((r) => kindFor(r, 9))).toEqual(['fence', 'fence', 'tall', 'tall', 'hedge', 'hedge']);
    expect([0, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 0.99].map((r) => kindFor(r, 10))).toEqual(['fence', 'fence', 'tall', 'tall', 'hedge', 'hedge', 'bird', 'bird']);
  });

  it('AC-60: the gap between two obstacles is the seeded distance of the rules', () => {
    expect(gapRange(6)).toEqual({ min: 5, max: 10.8 });
    expect(gapRange(10)).toEqual({ min: 8, max: 18 });
    expect(gapRange(15)).toEqual({ min: 12, max: 27 });
    // At least 0.8 s between two obstacles at any speed, longer than one jump (0.75 s).
    for (const v of [6, 8, 10, 12, 15]) expect(gapRange(v).min / v).toBeGreaterThanOrEqual(0.8 - 1e-9);
    let s = withObstacles(createHop(9), []);
    s = { ...s, trail: SPAWN_X - 1, nextGap: 6 };
    // 1 s at 6 units/s: after 5 units the trail is at 6, 12 − 6 meets the gap of 6 and an obstacle spawns at x = 12;
    // it then runs the last unit.
    s = reduceHop(s, { type: 'tick', dt: 1000 });
    expect(s.obstacles).toHaveLength(1);
    const spawned = s.obstacles[0];
    expect(spawned.x).toBeCloseTo(11, 6);
    const { min, max } = gapRange(runSpeed(0));
    expect(s.nextGap).toBeGreaterThanOrEqual(min);
    expect(s.nextGap).toBeLessThanOrEqual(max);
    expect(s.trail).toBeCloseTo(spawned.x + spawned.width, 9);
  });

  it('AC-60: a hedge (2 wide) is cleared by a jump timed in its window at 6 and 15 units/s', () => {
    for (const v of [6, 15]) {
      const passedBefore = passedFor(v);
      expect(runSpeed(passedBefore)).toBeCloseTo(v, 9);
      const w = jumpWindow(v, 'hedge');
      expect(w.to).toBeGreaterThan(w.from);
      let s: HopState = { ...withObstacles(createHop(5), [{ x: w.mid, kind: 'hedge' }]), passed: passedBefore };
      s = reduceHop(s, { type: 'jump' });
      while (s.passed === passedBefore && s.status === 'playing') s = reduceHop(s, { type: 'tick', dt: 1 });
      expect(s.status).toBe('playing');
      expect(s.passed).toBe(passedBefore + 1);
      // Too late (past the window): the same jump lands on the hedge.
      let late: HopState = { ...withObstacles(createHop(5), [{ x: w.from - 0.3, kind: 'hedge' }]), passed: passedBefore };
      late = reduceHop(late, { type: 'jump' });
      while (late.passed === passedBefore && late.status === 'playing') late = reduceHop(late, { type: 'tick', dt: 1 });
      expect(late.status).toBe('over');
    }
  });

  it('AC-60: at 6 and 15 units/s a jump timed at the middle of its window clears a 1.5-high fence, and the bunny lands before the next obstacle at the minimum gap', () => {
    for (const v of [6, 15]) {
      const passedBefore = passedFor(v);
      expect(runSpeed(passedBefore)).toBeCloseTo(v, 9);
      const w = jumpWindow(v, 'tall');
      // A comfortable window: about 180 ms at 6 units/s, more at 15.
      expect((w.to - w.from) / v).toBeGreaterThan(0.17);
      const x0 = w.mid;
      const xNext = x0 + 1 + gapRange(v).min;
      let s: HopState = { ...withObstacles(createHop(5), [{ x: x0, kind: 'tall' }, { x: xNext, kind: 'tall' }]), passed: passedBefore };
      s = reduceHop(s, { type: 'jump' });
      // First fence cleared; the bunny lands while the next fence is still before the middle of its own window.
      while (!(s.passed === passedBefore + 1 && onGround(s)) && s.status === 'playing') s = reduceHop(s, { type: 'tick', dt: 1 });
      expect(s.status).toBe('playing');
      const nextX = () => s.obstacles.find((o) => o.id === 101)?.x ?? -Infinity;
      expect(nextX()).toBeGreaterThan(jumpWindow(runSpeed(s.passed), 'tall').mid);
      // A second jump at the middle of the new window clears the next fence too.
      while (nextX() > jumpWindow(runSpeed(s.passed), 'tall').mid) s = reduceHop(s, { type: 'tick', dt: 1 });
      s = reduceHop(s, { type: 'jump' });
      while (s.passed < passedBefore + 2 && s.status === 'playing') s = reduceHop(s, { type: 'tick', dt: 1 });
      expect(s.status).toBe('playing');
      expect(s.passed).toBe(passedBefore + 2);
    }
  });

  it('AC-60: a combo every 5th obstacle passed in a row without a hit', () => {
    const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ x: BUNNY_X - 1 + 0.01 + i * 0.001 }));
    let s = { ...withObstacles(createHop(1), list), y: 5 };
    s = reduceHop(s, { type: 'tick', dt: 16 });
    expect(s.passed).toBe(10);
    expect(s.combos).toBe(2);
    expect(s.events.filter((e) => e.kind === 'combo')).toHaveLength(2);

    // A hit in between resets the streak: 4 passes, a hit, 4 passes → no combo.
    let t = { ...withObstacles(createHop(1, { shield: 1 }), [{ x: BUNNY_X + 0.2 }]), streak: 4 };
    t = reduceHop(t, { type: 'tick', dt: 1 });
    expect(t.streak).toBe(0);
    t = { ...t, y: 5, obstacles: [0, 1, 2, 3].map((i) => makeObstacle(10 + i, 'fence', BUNNY_X - 1 + 0.01)) };
    t = reduceHop(t, { type: 'tick', dt: 16 });
    expect(t.streak).toBe(4);
    expect(t.combos).toBe(0);
  });
});
