import { gameById } from '../game/core/content';
import { affordableSlots, BOT_IMPATIENT_CHANCE, BOT_POOR_CHANCE, botSlot, playDefenseBot } from '../game/defense/bot';
import {
  BUILD_COST,
  CLEAN_WAVE_POINTS,
  coveredCells,
  createDefense,
  DefenseAction,
  DefenseEvent,
  DefenseState,
  Enemy,
  GRID_COLS,
  GRID_ROWS,
  inRange,
  KILL_GOLD,
  KILL_POINTS,
  LEVEL_COSTS,
  LEVEL_DAMAGE,
  LIFE_POINTS,
  MAX_SCORE,
  MAX_WAVE_ENEMIES,
  nextCost,
  PATH,
  PATH_LENGTH,
  reduceDefense,
  SHOT_INTERVAL_MS,
  SIM_STEP_MS,
  SLOT_COUNT,
  SLOTS,
  SPAWN_INTERVAL_MS,
  START_GOLD,
  START_LIVES,
  stepTime,
  TURRET_RANGE,
  waveEnemies,
  waveHealth,
  WAVES,
} from '../game/defense/engine';

const tap = (state: DefenseState, slot: number) => reduceDefense(state, { type: 'tapSlot', slot });
const start = (state: DefenseState) => reduceDefense(state, { type: 'startWave' });
const tick = (state: DefenseState, dt: number = SIM_STEP_MS) => reduceDefense(state, { type: 'tick', dt });
const enemy = (id: number, cell: number, hp: number, moveMs = 0): Enemy => ({ id, cell, hp, moveMs });
const withoutEvents = (state: DefenseState) => ({ ...state, events: [] });

/** A wave already under way: every enemy sent, only `enemies` left on the path, the given turret levels. */
function midWave(wave: number, turrets: readonly number[], enemies: readonly Enemy[], patch: Partial<DefenseState> = {}): DefenseState {
  return { ...start({ ...createDefense(1), wave, turrets }), spawned: waveEnemies(wave), enemies, ...patch };
}

/** Plays the wave to its end with ticks of `dt`; returns the state and every event met. */
function playWave(state: DefenseState, dt: number = SIM_STEP_MS): { state: DefenseState; events: DefenseEvent[] } {
  let s = start(state);
  const events: DefenseEvent[] = [...s.events];
  for (let guard = 0; s.status === 'playing' && s.phase === 'wave' && guard < 100000; guard++) {
    s = tick(s, dt);
    events.push(...s.events);
  }
  return { state: s, events };
}

describe('Mini Défense engine (AC-99)', () => {
  it('AC-99: the path is 20 connected cells of the grid, the 6 slots stand beside it and see different stretches', () => {
    expect(PATH).toHaveLength(20);
    expect(PATH_LENGTH).toBe(20);
    expect(new Set(PATH.map((c) => c.join())).size).toBe(20);
    PATH.forEach(([col, row], i) => {
      expect(col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS).toBe(true);
      if (i > 0) expect(Math.abs(col - PATH[i - 1][0]) + Math.abs(row - PATH[i - 1][1])).toBe(1);
    });
    // Winding: the path turns several times.
    const turns = PATH.filter((_, i) => i >= 2 && PATH[i][0] - PATH[i - 1][0] !== PATH[i - 1][0] - PATH[i - 2][0]).length;
    expect(turns).toBeGreaterThanOrEqual(4);

    expect(SLOTS).toHaveLength(6);
    expect(SLOT_COUNT).toBe(6);
    expect(new Set(SLOTS.map((c) => c.join())).size).toBe(6);
    for (const [col, row] of SLOTS) {
      expect(col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS).toBe(true);
      expect(PATH.some((c) => c[0] === col && c[1] === row)).toBe(false);
    }
    const coverage = SLOTS.map((_, slot) => coveredCells(slot));
    expect(coverage.map((cells) => cells.length)).toEqual([4, 6, 4, 6, 5, 2]);
    for (const cells of coverage) expect(cells.length).toBeGreaterThanOrEqual(2);
    expect(new Set(coverage.map((cells) => cells.join())).size).toBe(6);
  });

  it('AC-99: a turret reaches the path cells within 2 cells of its slot (Chebyshev distance)', () => {
    expect(TURRET_RANGE).toBe(2);
    // Slot 0 stands in (5, 0): it sees the cells 3 to 6 of the path, (3, 0) to (4, 2), and nothing else.
    expect(coveredCells(0)).toEqual([3, 4, 5, 6]);
    expect(inRange(0, 3)).toBe(true); // 2 columns away
    expect(inRange(0, 2)).toBe(false); // 3 columns away
    expect(inRange(0, 7)).toBe(false); // 3 rows away
    SLOTS.forEach(([sc, sr], slot) =>
      PATH.forEach(([pc, pr], cell) => expect(inRange(slot, cell)).toBe(Math.abs(sc - pc) <= 2 && Math.abs(sr - pr) <= 2)),
    );
  });

  it('AC-99: a round starts with 5 lives, 120 gold, wave 1 of 6 in planning; « Arsenal » adds 20 gold per level', () => {
    const s = createDefense(7);
    expect(s).toMatchObject({ score: 0, combos: 0, status: 'playing', wave: 1, phase: 'plan', lives: 5, gold: 120, enemies: [] });
    expect(s.turrets).toEqual([0, 0, 0, 0, 0, 0]);
    expect([START_LIVES, START_GOLD, WAVES]).toEqual([5, 120, 6]);
    expect([1, 2, 3].map((arsenal) => createDefense(7, { arsenal }).gold)).toEqual([140, 160, 180]);
  });

  it('AC-99: a turret costs 50, its level 2 costs 40 and its level 3 costs 80; a level 3 turret takes nothing more', () => {
    expect([BUILD_COST, ...LEVEL_COSTS]).toEqual([50, 50, 40, 80]);
    expect([0, 1, 2, 3].map(nextCost)).toEqual([50, 40, 80, null]);
    let s: DefenseState = { ...createDefense(1), gold: 200 };
    s = tap(s, 2);
    expect(s.turrets).toEqual([0, 0, 1, 0, 0, 0]);
    expect(s.gold).toBe(150);
    expect(s.events).toEqual([{ kind: 'build', slot: 2, level: 1, cost: 50 }]);
    s = tap(s, 2);
    expect([s.turrets[2], s.gold]).toEqual([2, 110]);
    s = tap(s, 2);
    expect([s.turrets[2], s.gold]).toEqual([3, 30]);
    expect(s.events).toEqual([{ kind: 'build', slot: 2, level: 3, cost: 80 }]);
    const full = tap({ ...s, gold: 500 }, 2);
    expect([full.turrets[2], full.gold, full.events]).toEqual([3, 500, []]);
  });

  it('AC-99: a tap without enough gold, or on a slot that does not exist, changes nothing', () => {
    const s: DefenseState = { ...createDefense(1), gold: 49 };
    const refused = tap(s, 0);
    expect(withoutEvents(refused)).toEqual(withoutEvents(s));
    expect(refused.events).toEqual([{ kind: 'refused', slot: 0 }]);
    const upgrade = tap({ ...s, gold: 39, turrets: [1, 0, 0, 0, 0, 0] }, 0);
    expect([upgrade.turrets[0], upgrade.gold]).toEqual([1, 39]);
    for (const slot of [-1, 6, 1.5]) expect(withoutEvents(tap(createDefense(1), slot))).toEqual(withoutEvents(createDefense(1)));
  });

  it('AC-99: wave w sends 4 + 2w enemies of 2 + w health at one cell per max(250, 500 − 40 × (w − 1)) ms', () => {
    expect([1, 2, 3, 4, 5, 6].map(waveEnemies)).toEqual([6, 8, 10, 12, 14, 16]);
    expect([1, 2, 3, 4, 5, 6].map(waveHealth)).toEqual([3, 4, 5, 6, 7, 8]);
    expect([1, 2, 3, 4, 5, 6].map(stepTime)).toEqual([500, 460, 420, 380, 340, 300]);
    expect([7, 8, 20].map(stepTime)).toEqual([260, 250, 250]);
    expect(MAX_WAVE_ENEMIES).toBe(16);
    // 66 enemies, 6 clean waves, 5 lives.
    expect(MAX_SCORE).toBe(66 * 10 + 6 * 100 + 5 * 30);
  });

  it('AC-99: the enemies of a wave enter one every 700 ms, the first with the first step, with the health of the wave', () => {
    let s = start({ ...createDefense(1), wave: 2 });
    expect(s.phase).toBe('wave');
    expect(s.events).toEqual([{ kind: 'wave', wave: 2 }]);
    const spawnTimes: number[] = [];
    for (let ms = SIM_STEP_MS; ms <= 5000; ms += SIM_STEP_MS) {
      s = tick(s);
      if (s.events.some((e) => e.kind === 'spawn')) spawnTimes.push(ms);
    }
    expect(SPAWN_INTERVAL_MS).toBe(700);
    expect(spawnTimes).toEqual([50, 750, 1450, 2150, 2850, 3550, 4250, 4950]);
    expect(s.spawned).toBe(8);
    expect(s.enemies.every((e) => e.hp === 4)).toBe(true);
    // No ninth enemy.
    for (let i = 0; i < 40; i++) s = tick(s);
    expect(s.spawned).toBe(8);
  });

  it('AC-99: an enemy walks one cell per step time and costs a life when it leaves the path', () => {
    // Wave 1, no turret: the first enemy enters at 50 ms, stands on cell k from 50 + 500k ms, leaves at 50 + 20 × 500.
    let s = start(createDefense(1));
    s = tick(s);
    expect(s.enemies[0]).toEqual({ id: 0, cell: 0, moveMs: 0, hp: 3 });
    s = tick(s, 450);
    expect(s.enemies[0].cell).toBe(0);
    s = tick(s);
    expect(s.enemies[0].cell).toBe(1);
    s = tick(s, 18 * 500);
    expect(s.enemies[0].cell).toBe(19);
    expect(s.lives).toBe(5);
    s = tick(s, 450);
    expect(s.lives).toBe(5);
    s = tick(s);
    expect(s.lives).toBe(4);
    expect(s.events).toContainEqual({ kind: 'leak', id: 0 });
    expect(s.enemies.some((e) => e.id === 0)).toBe(false);
    // Wave 4 walks faster: 380 ms per cell (the 50 ms steps carry the remainder over).
    let fast = midWave(4, [0, 0, 0, 0, 0, 0], [enemy(0, 0, 6)]);
    fast = tick(fast, 350);
    expect(fast.enemies[0]).toMatchObject({ cell: 0, moveMs: 350 });
    fast = tick(fast);
    expect(fast.enemies[0]).toMatchObject({ cell: 1, moveMs: 20 });
  });

  it('AC-99: a turret shoots every 600 ms the enemy furthest along the path within its range, for 1 / 2 / 3 per level', () => {
    expect(LEVEL_DAMAGE).toEqual([1, 2, 3]);
    expect(SHOT_INTERVAL_MS).toBe(600);
    // Slot 0 sees cells 3 to 6. Enemy 0 is already past (cell 7), enemy 1 on cell 5 is the furthest within range.
    for (const level of [1, 2, 3]) {
      let s = midWave(1, [level, 0, 0, 0, 0, 0], [enemy(0, 7, 8), enemy(1, 5, 8), enemy(2, 3, 8)]);
      const shots: { ms: number; id: number; damage: number }[] = [];
      for (let ms = SIM_STEP_MS; ms <= 1300; ms += SIM_STEP_MS) {
        s = tick(s);
        for (const e of s.events) if (e.kind === 'shot') shots.push({ ms, id: e.id, damage: e.damage });
      }
      // Wave 1 walks a cell in 500 ms: enemy 1 leaves the range (cell 7) at 1 000 ms, enemy 2 is then the target.
      expect(shots).toEqual([
        { ms: 50, id: 1, damage: level },
        { ms: 650, id: 1, damage: level },
        { ms: 1250, id: 2, damage: level },
      ]);
      expect(s.enemies.map((e) => e.hp)).toEqual([8, 8 - 2 * level, 8 - level]);
    }
  });

  it('AC-99: a turret without any enemy in range keeps its shot ready; turrets shoot in slot order at what is left', () => {
    // Nothing in range of slot 0 for 1 000 ms, then an enemy steps on cell 3: shot at once.
    let s = midWave(1, [1, 0, 0, 0, 0, 0], [enemy(0, 1, 3)]);
    s = tick(s, 950);
    expect(s.enemies[0]).toMatchObject({ cell: 2, hp: 3 });
    s = tick(s);
    expect(s.enemies[0]).toMatchObject({ cell: 3, hp: 2 });
    // Slots 1 and 3 both see cell 10: the first kills the enemy (1 health left), the second keeps its shot.
    let two = midWave(1, [0, 1, 0, 1, 0, 0], [enemy(0, 10, 1)], { spawned: 5 });
    two = tick(two);
    expect(two.events.filter((e) => e.kind === 'shot')).toEqual([{ kind: 'shot', slot: 1, id: 0, cell: 10, damage: 1 }]);
    expect(two.cooldowns[1]).toBe(600);
    expect(two.cooldowns[3]).toBe(0);
  });

  it('AC-99: a kill gives 10 points and 8 gold', () => {
    expect([KILL_POINTS, KILL_GOLD]).toEqual([10, 8]);
    const before = midWave(1, [3, 0, 0, 0, 0, 0], [enemy(4, 4, 3), enemy(5, 0, 3)]);
    const s = tick(before);
    expect(s.score).toBe(10);
    expect(s.gold).toBe(before.gold + 8);
    expect(s.enemies.map((e) => e.id)).toEqual([5]);
    expect(s.events).toEqual([
      { kind: 'shot', slot: 0, id: 4, cell: 4, damage: 3 },
      { kind: 'kill', id: 4, cell: 4 },
      { kind: 'score', points: 10 },
    ]);
  });

  it('AC-99: a wave without any leak gives 100 points and a combo, then the next wave is planned', () => {
    expect(CLEAN_WAVE_POINTS).toBe(100);
    const s = tick(midWave(2, [3, 0, 0, 0, 0, 0], [enemy(7, 4, 2)]));
    expect(s.score).toBe(10 + 100);
    expect(s.combos).toBe(1);
    expect(s).toMatchObject({ wave: 3, phase: 'plan', status: 'playing', lives: 5, enemies: [] });
    expect(s.events).toContainEqual({ kind: 'cleared', wave: 2, clean: true });
    expect(s.events).toContainEqual({ kind: 'combo' });
  });

  it('AC-99: a wave with a leak gives no bonus and no combo', () => {
    const s = tick(midWave(2, [0, 0, 0, 0, 0, 0], [enemy(7, 19, 4, 450)]));
    expect(s).toMatchObject({ wave: 3, phase: 'plan', lives: 4, score: 0, combos: 0 });
    expect(s.events).toEqual([
      { kind: 'leak', id: 7 },
      { kind: 'cleared', wave: 2, clean: false },
    ]);
    // A whole wave 1 against one level 1 turret: kills and leaks add up to the 6 enemies, no bonus.
    const { state, events } = playWave(tap(createDefense(1), 0));
    const kills = events.filter((e) => e.kind === 'kill').length;
    const leaks = events.filter((e) => e.kind === 'leak').length;
    expect(leaks).toBeGreaterThan(0);
    expect(kills + leaks).toBe(6);
    expect(state.score).toBe(10 * kills);
    expect(state.gold).toBe(120 - 50 + 8 * kills);
    expect(state.lives).toBe(Math.max(0, 5 - leaks));
  });

  it('AC-99: nothing is built or upgraded during a wave, and a second « Lancer la vague » changes nothing', () => {
    let s = tick(start(tap({ ...createDefense(1), gold: 500 }, 1)), 1000);
    expect(s.phase).toBe('wave');
    for (const slot of [0, 1, 2, 3, 4, 5]) {
      const tapped = tap(s, slot);
      expect(withoutEvents(tapped)).toEqual(withoutEvents(s));
      expect(tapped.events).toEqual([]);
    }
    expect(withoutEvents(start(s))).toEqual(withoutEvents(s));
    // The wave goes on as if nothing had been tapped.
    const plain = tick(s, 3000);
    s = tick(start(tap(s, 0)), 3000);
    expect(s).toEqual(plain);
  });

  it('AC-99: time only runs during a wave: a tick while planning changes nothing', () => {
    const s = tap(createDefense(1), 1);
    expect(withoutEvents(tick(s, 5000))).toEqual(withoutEvents(s));
    expect(tick(start(s), 0).enemies).toEqual([]);
    expect(tick(start(s), -50).enemies).toEqual([]);
  });

  it('AC-99: the round ends after wave 6 with 30 points per life left', () => {
    expect(LIFE_POINTS).toBe(30);
    const s = tick(midWave(6, [3, 0, 0, 0, 0, 0], [enemy(15, 4, 1)], { lives: 4, leaked: 1, score: 500 }));
    expect(s.status).toBe('over');
    expect(s.score).toBe(500 + 10 + 4 * 30);
    expect(s.wave).toBe(6);
    expect(s.events).toContainEqual({ kind: 'over', score: 630 });
    // Nothing more happens once the round is over.
    expect(tick(s, 1000)).toBe(s);
    expect(tap(s, 1)).toBe(s);
    expect(start(s)).toBe(s);
  });

  it('AC-99: the round ends at once when no life is left, without any bonus', () => {
    const s = tick(midWave(3, [0, 0, 0, 0, 0, 0], [enemy(2, 19, 5, 400), enemy(3, 17, 5)], { lives: 1, leaked: 4, score: 70, spawned: 4 }));
    expect(s.status).toBe('over');
    expect(s.lives).toBe(0);
    expect(s.score).toBe(70);
    expect(s.wave).toBe(3);
    expect(s.events).toEqual([
      { kind: 'leak', id: 2 },
      { kind: 'over', score: 70 },
    ]);
    // Without any turret the 6 enemies of wave 1 take the 5 lives.
    const { state } = playWave(createDefense(1));
    expect(state).toMatchObject({ status: 'over', lives: 0, score: 0, wave: 1 });
  });

  it('AC-99: the same seed, builds and ticks give the same result whatever the tick grouping', () => {
    const build = (state: DefenseState, slots: number[]) => slots.reduce(tap, state);
    const plans = [[1, 3], [4], [1], [3, 0], [1, 3], [4, 4]];
    /** `dts` is repeated until the wave ends; the time already spent in the wave is the same total for every grouping. */
    const play = (dts: number[]) => {
      let s = createDefense(99);
      const marks: DefenseState[] = [];
      for (let w = 0; w < WAVES && s.status === 'playing'; w++) {
        s = start(build(s, plans[w]));
        // 4 000 ms into the wave, whatever the grouping.
        let spent = 0;
        for (let i = 0; spent < 4000; i++) {
          const dt = Math.min(dts[i % dts.length], 4000 - spent);
          s = tick(s, dt);
          spent += dt;
        }
        marks.push(withoutEvents(s) as DefenseState);
        for (let i = 0; s.status === 'playing' && s.phase === 'wave'; i++) s = tick(s, dts[i % dts.length]);
        marks.push(withoutEvents(s) as DefenseState);
      }
      return marks;
    };
    const reference = play([50]);
    expect(reference.length).toBeGreaterThanOrEqual(4);
    expect(reference[0].enemies.length).toBeGreaterThan(0);
    for (const dts of [[16, 17, 17], [7], [1], [100], [250, 33, 4], [1000], [4000]]) expect(play(dts)).toEqual(reference);
    // One huge tick plays the wave to its end and stops there.
    const whole = tick(start(build(createDefense(99), plans[0])), 10 ** 7);
    expect(withoutEvents(whole)).toEqual(reference[1]);
    expect(whole.carryMs).toBe(0);
  });

  it('AC-99: the events of a grouped tick are those of its 50 ms steps, in order', () => {
    const begin = start(tap(tap(createDefense(5), 1), 3));
    let small = begin;
    const events: DefenseEvent[] = [];
    for (let i = 0; i < 60; i++) {
      small = tick(small);
      events.push(...small.events);
    }
    const big = tick(begin, 3000);
    expect(big.events).toEqual(events);
    expect(events.some((e) => e.kind === 'shot')).toBe(true);
  });
});

describe('Mini Défense balance and guards (AC-108)', () => {
  const [oneStar, , threeStars] = gameById('defense').stars;
  const finals = Array.from({ length: 50 }, (_, i) => playDefenseBot(i + 1));
  const scores = finals.map((s) => s.score).sort((a, b) => a - b);
  const median = (scores[24] + scores[25]) / 2;

  it('AC-108: every seed starts a round and the casual bot finishes it (6 waves or no life left)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createDefense(seed * 2654435761);
      expect(s).toMatchObject({ status: 'playing', phase: 'plan', wave: 1, lives: 5, gold: 120 });
    }
    for (const s of finals) {
      expect(s.status).toBe('over');
      expect(s.lives === 0 || (s.wave === WAVES && s.phase === 'plan')).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(MAX_SCORE);
    }
  });

  it('AC-108: a build during a wave (the input guard) changes nothing', () => {
    const actions: DefenseAction[] = [{ type: 'tapSlot', slot: 1 }, { type: 'startWave' }, { type: 'tick', dt: 2000 }];
    const s = actions.reduce(reduceDefense, createDefense(11));
    expect(s.phase).toBe('wave');
    const tapped = reduceDefense(s, { type: 'tapSlot', slot: 3 });
    expect([tapped.gold, tapped.turrets, tapped.score, tapped.enemies]).toEqual([s.gold, s.turrets, s.score, s.enemies]);
    expect(tapped.events).toEqual([]);
  });

  it('AC-108: the casual bot is deterministic per seed and follows its policy', () => {
    expect(playDefenseBot(7)).toEqual(playDefenseBot(7));
    expect([BOT_POOR_CHANCE, BOT_IMPATIENT_CHANCE]).toEqual([0.5, 0.4]);
    // Sensible choice: the empty slot covering the most cells (slot 1, 6 cells; ties: the first), else an upgrade.
    const s = createDefense(1);
    expect(affordableSlots(s)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(botSlot(s)).toBe(1);
    expect(botSlot({ ...s, turrets: [0, 1, 0, 0, 0, 0] })).toBe(3);
    expect(botSlot({ ...s, gold: 45, turrets: [0, 0, 1, 0, 1, 0] })).toBe(2);
    expect(affordableSlots({ ...s, gold: 45, turrets: [0, 0, 1, 0, 2, 3] })).toEqual([2]);
    expect(botSlot({ ...s, gold: 30 })).toBeNull();
  });

  it('AC-108: over 50 seeds the casual bot has a median ≥ the 1-star threshold and < the 3-star one', () => {
    expect(median).toBeGreaterThanOrEqual(oneStar);
    expect(median).toBeLessThan(threeStars);
  });

  it('AC-108 (measured, reported): bot min / p25 / median / p90 / max over seeds 1-50', () => {
    const lost = finals.filter((s) => s.lives === 0).length;
    const flawless = finals.filter((s) => s.score === MAX_SCORE).length;
    expect({ min: scores[0], p25: scores[12], median, p90: scores[45], max: scores[49], lost, flawless }).toEqual({ min: 10, p25: 950, median: 1270, p90: 1410, max: 1410, lost: 12, flawless: 23 });
  });
});
