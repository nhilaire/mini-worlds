import { gameById } from '../game/core/content';
import { BOT_ROTATION, BOT_WAVE_CAP, botPurchase, playDefenseBot } from '../game/defense/bot';
import {
  ARMOUR,
  CLEAN_WAVE_GOLD,
  CLEAN_WAVE_POINTS,
  coveredCells,
  createDefense,
  DefenseEvent,
  DefenseState,
  Enemy,
  EnemyKind,
  enemyStats,
  ENEMIES,
  GRID_COLS,
  GRID_ROWS,
  hitDamage,
  inRange,
  kindChances,
  kindFor,
  MAX_WAVE_ENEMIES,
  PATH,
  PATH_LENGTH,
  reduceDefense,
  SIM_STEP_MS,
  SLOT_COUNT,
  SLOTS,
  SLOW_MS,
  SPAWN_INTERVAL_MS,
  START_GOLD,
  START_LIVES,
  stepTime,
  Turret,
  TURRET_RANGE,
  TurretKind,
  TURRETS,
  UPGRADE_COSTS,
  upgradeCost,
  waveEnemies,
  waveHealth,
} from '../game/defense/engine';

const build = (state: DefenseState, slot: number, turret: TurretKind) => reduceDefense(state, { type: 'build', slot, turret });
const upgrade = (state: DefenseState, slot: number) => reduceDefense(state, { type: 'tapSlot', slot });
const start = (state: DefenseState) => reduceDefense(state, { type: 'startWave' });
const tick = (state: DefenseState, dt: number = SIM_STEP_MS) => reduceDefense(state, { type: 'tick', dt });
const withoutEvents = (state: DefenseState) => ({ ...state, events: [] });
const none = (): (Turret | null)[] => SLOTS.map(() => null);
const turretsWith = (slot: number, kind: TurretKind, level = 1): (Turret | null)[] => none().map((t, i) => (i === slot ? { kind, level } : t));

/** An enemy of `kind` in wave `wave` standing on `cell` (full health unless `hp` is given). */
function foe(id: number, cell: number, kind: EnemyKind = 'normal', wave = 1, patch: Partial<Enemy> = {}): Enemy {
  const { hp, stepMs } = enemyStats(kind, wave);
  return { id, kind, cell, moveMs: 0, stepMs, hp, maxHp: hp, slowMs: 0, ...patch };
}

/** A wave already under way: every enemy sent, only `enemies` left on the path, the given turrets. */
function midWave(wave: number, turrets: readonly (Turret | null)[], enemies: readonly Enemy[], patch: Partial<DefenseState> = {}): DefenseState {
  return { ...start({ ...createDefense(1), wave, turrets }), spawned: waveEnemies(wave), enemies, ...patch };
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
    expect(SLOTS).toHaveLength(6);
    expect(SLOT_COUNT).toBe(6);
    for (const [col, row] of SLOTS) expect(PATH.some((c) => c[0] === col && c[1] === row)).toBe(false);
    expect(SLOTS.map((_, slot) => coveredCells(slot).length)).toEqual([4, 6, 4, 6, 5, 2]);
  });

  it('AC-99: a turret reaches the path cells within 2 cells of its slot (Chebyshev distance)', () => {
    expect(TURRET_RANGE).toBe(2);
    expect(coveredCells(0)).toEqual([3, 4, 5, 6]);
    SLOTS.forEach(([sc, sr], slot) =>
      PATH.forEach(([pc, pr], cell) => expect(inRange(slot, cell)).toBe(Math.abs(sc - pc) <= 2 && Math.abs(sr - pr) <= 2)),
    );
  });

  it('AC-99: a round starts with 5 lives, 100 gold, wave 1 in planning, no turret; « Arsenal » adds 20 gold per level', () => {
    const s = createDefense(7);
    expect(s).toMatchObject({ score: 0, combos: 0, status: 'playing', wave: 1, phase: 'plan', lives: 5, gold: 100, enemies: [] });
    expect(s.turrets).toEqual(none());
    expect([START_LIVES, START_GOLD]).toEqual([5, 100]);
    expect([1, 2, 3].map((arsenal) => createDefense(7, { arsenal }).gold)).toEqual([120, 140, 160]);
  });

  it('AC-99: Rapide costs 40, Canon 70, Givre 50; an upgrade costs 40 then 80; level 3 takes nothing more', () => {
    expect([TURRETS.rapid.cost, TURRETS.cannon.cost, TURRETS.frost.cost]).toEqual([40, 70, 50]);
    expect(UPGRADE_COSTS).toEqual([40, 80]);
    expect([1, 2, 3].map(upgradeCost)).toEqual([40, 80, null]);
    let s: DefenseState = { ...createDefense(1), gold: 300 };
    s = build(s, 2, 'cannon');
    expect(s.turrets[2]).toEqual({ kind: 'cannon', level: 1 });
    expect(s.gold).toBe(230);
    expect(s.events).toEqual([{ kind: 'build', slot: 2, turret: 'cannon', level: 1, cost: 70 }]);
    // A taken slot cannot be built on again.
    expect(build(s, 2, 'rapid').turrets).toBe(s.turrets);
    s = upgrade(s, 2);
    expect([s.turrets[2], s.gold]).toEqual([{ kind: 'cannon', level: 2 }, 190]);
    s = upgrade(s, 2);
    expect([s.turrets[2], s.gold]).toEqual([{ kind: 'cannon', level: 3 }, 110]);
    expect(s.events).toEqual([{ kind: 'build', slot: 2, turret: 'cannon', level: 3, cost: 80 }]);
    expect(upgrade(s, 2)).toEqual(withoutEvents(s));
    // An upgrade tap on an empty slot does nothing (the screen opens the picker).
    expect(upgrade(s, 0)).toEqual(withoutEvents(s));
    for (const kind of ['rapid', 'frost'] as const) expect(build(createDefense(1), 1, kind).gold).toBe(100 - TURRETS[kind].cost);
  });

  it('AC-99: a build or an upgrade without enough gold is refused; a slot that does not exist changes nothing', () => {
    const poor: DefenseState = { ...createDefense(1), gold: 69 };
    const refused = build(poor, 1, 'cannon');
    expect(refused.turrets).toBe(poor.turrets);
    expect(refused.events).toEqual([{ kind: 'refused', slot: 1 }]);
    const built = { ...build({ ...createDefense(1), gold: 40 }, 1, 'rapid') };
    expect(built.gold).toBe(0);
    expect(upgrade(built, 1).events).toEqual([{ kind: 'refused', slot: 1 }]);
    for (const bad of [-1, 6, 1.5, NaN]) expect(build(poor, bad, 'rapid')).toEqual(withoutEvents(poor));
  });

  it('AC-99: wave w sends min(30, 4 + 2w) enemies; H(w) = round(3 × 1.25^(w − 1)), S(w) = max(250, 500 − 40 × (w − 1))', () => {
    expect([1, 2, 6, 13, 14, 40].map(waveEnemies)).toEqual([6, 8, 16, 30, 30, 30]);
    expect(MAX_WAVE_ENEMIES).toBe(30);
    expect([1, 2, 3, 4, 5, 6, 10, 20].map(waveHealth)).toEqual([3, 4, 5, 6, 7, 9, 22, 208]);
    expect([1, 2, 7, 8, 30].map(stepTime)).toEqual([500, 460, 260, 250, 250]);
    // Rapide: half the health (rounded up), 0.6 × S; blindé: twice the health, 1.4 × S (rounded to 10 ms).
    expect(enemyStats('normal', 3)).toEqual({ hp: 5, stepMs: 420 });
    expect(enemyStats('fast', 3)).toEqual({ hp: 3, stepMs: 250 });
    expect(enemyStats('armoured', 3)).toEqual({ hp: 10, stepMs: 590 });
  });

  it('AC-99: waves 1 and 2 are only normal enemies, rapides come from wave 3 and blindés from wave 4, drawn with the seed', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(kindChances)).toEqual([
      { fast: 0, armoured: 0 },
      { fast: 0, armoured: 0 },
      { fast: 0.1, armoured: 0 },
      { fast: 0.2, armoured: 0.1 },
      { fast: 0.30000000000000004, armoured: 0.2 },
      { fast: 0.4, armoured: 0.3 },
      { fast: 0.4, armoured: 0.3 },
      { fast: 0.4, armoured: 0.3 },
    ]);
    expect([kindFor(5, 0.29), kindFor(5, 0.31), kindFor(5, 0.49), kindFor(5, 0.51)]).toEqual(['fast', 'armoured', 'armoured', 'normal']);
    const kindsOfWave = (seed: number, wave: number): EnemyKind[] => {
      let s = start({ ...createDefense(seed), wave });
      const kinds: EnemyKind[] = [];
      for (let i = 0; i < 2000 && s.phase === 'wave' && s.status === 'playing'; i++) {
        s = tick(s);
        for (const e of s.events) if (e.kind === 'spawn') kinds.push(e.enemy);
      }
      return kinds;
    };
    for (let seed = 1; seed <= 10; seed++) {
      expect(new Set([...kindsOfWave(seed, 1), ...kindsOfWave(seed, 2)])).toEqual(new Set(['normal']));
      expect(kindsOfWave(seed, 3)).not.toContain('armoured');
    }
    const late = Array.from({ length: 10 }, (_, i) => kindsOfWave(i + 1, 8)).flat();
    expect(new Set(late)).toEqual(new Set(['normal', 'fast', 'armoured']));
    expect(kindsOfWave(4, 8)).toEqual(kindsOfWave(4, 8));
  });

  it('AC-99: the enemies of a wave enter one every 700 ms, the first with the first step', () => {
    let s = start({ ...createDefense(1), wave: 2 });
    expect(s.events).toEqual([{ kind: 'wave', wave: 2 }]);
    const spawnTimes: number[] = [];
    for (let ms = SIM_STEP_MS; ms <= 5000; ms += SIM_STEP_MS) {
      s = tick(s);
      if (s.events.some((e) => e.kind === 'spawn')) spawnTimes.push(ms);
    }
    expect(SPAWN_INTERVAL_MS).toBe(700);
    expect(spawnTimes).toEqual([50, 750, 1450, 2150, 2850, 3550, 4250, 4950]);
    expect(s.enemies.every((e) => e.hp === 4 && e.kind === 'normal')).toBe(true);
  });

  it('AC-99: an enemy walks one cell per its step time and costs a life when it leaves the path', () => {
    let s = start(createDefense(1));
    s = tick(s);
    expect(s.enemies[0]).toEqual(foe(0, 0));
    s = tick(s, 450);
    expect(s.enemies[0].cell).toBe(0);
    s = tick(s);
    expect(s.enemies[0].cell).toBe(1);
    s = tick(s, 18 * 500 + 450);
    expect(s.lives).toBe(5);
    s = tick(s);
    expect(s.lives).toBe(4);
    expect(s.events).toContainEqual({ kind: 'leak', id: 0 });
  });

  it('AC-99: Rapide shoots 1 × level every 400 ms at the enemy furthest along the path within range', () => {
    // Slot 1 (0, 2) sees cells 0-2 and 9-12. Two enemies in range: the one on cell 10 is further along.
    let s = midWave(1, turretsWith(1, 'rapid', 2), [foe(0, 10, 'normal', 1, { hp: 100 }), foe(1, 1, 'normal', 1, { hp: 100 })]);
    s = tick(s);
    expect(s.events).toContainEqual({ kind: 'shot', slot: 1, id: 0, cell: 10, damage: 2 });
    const shots: number[] = [];
    for (let ms = 100; ms <= 1000; ms += 50) {
      s = tick(s);
      if (s.events.some((e) => e.kind === 'shot')) shots.push(ms);
    }
    expect(shots).toEqual([450, 850]);
    // « Furthest along » follows the progress, not the order of entry: a rapide that overtook is the target.
    const overtaken = midWave(9, turretsWith(1, 'rapid'), [foe(0, 10, 'normal', 9, { moveMs: 10 }), foe(1, 10, 'fast', 9, { moveMs: 100 })]);
    expect(tick(overtaken).events).toContainEqual(expect.objectContaining({ kind: 'shot', id: 1 }));
  });

  it('AC-99: Canon deals 3 × level every 1 500 ms to the target and to every enemy on the path cells just before and after it', () => {
    // Slot 3 (0, 5) sees cells 10-14. Enemies on 13 (target), 12 and 14 (neighbours), 11 (two cells away).
    const tough = { hp: 100 };
    const s0 = midWave(1, turretsWith(3, 'cannon'), [foe(0, 14, 'normal', 1, tough), foe(1, 13, 'normal', 1, tough), foe(2, 12, 'normal', 1, tough), foe(3, 11, 'normal', 1, tough)]);
    const s1 = tick(s0);
    expect(s1.events).toContainEqual({ kind: 'shot', slot: 3, id: 0, cell: 14, damage: 3 });
    const hp = 100;
    expect(s1.enemies.map((e) => [e.id, e.hp])).toEqual([
      [0, hp - 3],
      [1, hp - 3],
      [2, hp],
      [3, hp],
    ]);
    let s = s1;
    const shots: number[] = [];
    for (let ms = 100; ms <= 3200; ms += 50) {
      s = tick(s);
      if (s.events.some((e) => e.kind === 'shot')) shots.push(ms);
    }
    expect(shots[0]).toBe(1550);
    expect(TURRETS.cannon).toMatchObject({ damage: 3, intervalMs: 1500, splash: true });
  });

  it('AC-99: Givre deals 1 × level every 1 000 ms and the target walks twice slower for 1 500 ms, even a blindé whose armour cancels the hit', () => {
    expect(TURRETS.frost).toMatchObject({ damage: 1, intervalMs: 1000, slows: true });
    expect(SLOW_MS).toBe(1500);
    const s0 = midWave(5, turretsWith(1, 'frost'), [foe(0, 10, 'armoured', 5)]);
    const s1 = tick(s0);
    expect(s1.enemies[0]).toMatchObject({ hp: enemyStats('armoured', 5).hp, slowMs: SLOW_MS }); // 1 − 1 = 0 damage
    // Half speed: 25 ms of its step per 50 ms step while slowed.
    const s2 = tick(s1);
    expect(s2.enemies[0].moveMs).toBe(s1.enemies[0].moveMs + 25);
    // A normal enemy loses 1 and is slowed too.
    const n1 = tick(midWave(5, turretsWith(1, 'frost', 2), [foe(0, 10, 'normal', 5)]));
    expect(n1.enemies[0]).toMatchObject({ hp: waveHealth(5) - 2, slowMs: SLOW_MS });
  });

  it('AC-99: a blindé loses 1 damage per hit: a hit of 1 does nothing, a Canon hit of 3 deals 2', () => {
    expect(ARMOUR).toBe(1);
    expect([hitDamage('armoured', 1), hitDamage('armoured', 3), hitDamage('normal', 1), hitDamage('fast', 2)]).toEqual([0, 2, 1, 2]);
    const s = tick(midWave(5, turretsWith(1, 'rapid'), [foe(0, 10, 'armoured', 5)]));
    expect(s.enemies[0].hp).toBe(enemyStats('armoured', 5).hp);
  });

  it('AC-99: a normal or rapide enemy killed gives 10 points and 6 gold, a blindé 20 points and 12 gold', () => {
    expect(ENEMIES).toEqual({ normal: { points: 10, gold: 6 }, fast: { points: 10, gold: 6 }, armoured: { points: 20, gold: 12 } });
    for (const [kind, points, gold] of [
      ['normal', 10, 6],
      ['fast', 10, 6],
      ['armoured', 20, 12],
    ] as const) {
      const s = tick(midWave(9, turretsWith(1, 'cannon', 3), [foe(0, 10, kind, 9, { hp: 1 }), foe(1, 0, 'normal', 9)], { gold: 0 }));
      expect(s.events).toContainEqual({ kind: 'kill', id: 0, cell: 10 });
      expect([s.score, s.gold]).toEqual([points, gold]);
    }
  });

  it('AC-99: a wave without any leak gives 100 points, 20 gold and a combo; wave 7 comes after wave 6 (no last wave)', () => {
    expect([CLEAN_WAVE_POINTS, CLEAN_WAVE_GOLD]).toEqual([100, 20]);
    const s = tick(midWave(6, turretsWith(1, 'cannon', 3), [foe(0, 10, 'normal', 6, { hp: 1 })], { gold: 0 }));
    expect(s.events).toContainEqual({ kind: 'cleared', wave: 6, clean: true });
    expect(s.score).toBe(10 + 100);
    expect(s.gold).toBe(6 + 20);
    expect(s.combos).toBe(1);
    expect(s).toMatchObject({ status: 'playing', phase: 'plan', wave: 7 });
    // A wave with a leak: no bonus, no combo.
    const leaky = tick(midWave(6, none(), [foe(0, 19, 'normal', 6, { moveMs: stepTime(6) - SIM_STEP_MS })], { leaked: 0 }), 50);
    expect(leaky.events).toContainEqual({ kind: 'cleared', wave: 6, clean: false });
    expect([leaky.score, leaky.combos, leaky.lives, leaky.wave]).toEqual([0, 0, 4, 7]);
  });

  it('AC-99: the round ends only when no life is left', () => {
    const s = tick(midWave(20, none(), [foe(0, 19, 'normal', 20, { moveMs: 249 })], { lives: 1, score: 1234 }));
    expect(s.status).toBe('over');
    expect(s.lives).toBe(0);
    expect(s.events).toContainEqual({ kind: 'over', score: 1234 });
    expect(start(s)).toBe(s);
  });

  it('AC-99: nothing is built or upgraded during a wave, and time only runs during a wave', () => {
    const planning = build({ ...createDefense(1), gold: 200 }, 1, 'rapid');
    expect(tick(planning, 500)).toEqual(withoutEvents(planning));
    const s = start(planning);
    expect(build(s, 3, 'cannon')).toEqual(withoutEvents(s));
    expect(upgrade(s, 1)).toEqual(withoutEvents(s));
    expect(start(s)).toEqual(withoutEvents(s));
  });

  it('AC-99: the same seed, builds and ticks give the same result whatever the tick grouping', () => {
    const plans: [number, TurretKind][][] = [[[1, 'rapid'], [3, 'rapid']], [[4, 'frost']], [], [[0, 'cannon']], [], []];
    const play = (dts: number[]) => {
      let s = createDefense(99);
      const marks: DefenseState[] = [];
      for (let w = 0; w < 6 && s.status === 'playing'; w++) {
        for (const [slot, kind] of plans[w]) s = build(s, slot, kind);
        s = start(s);
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
    for (const dts of [[16, 17, 17], [7], [100], [250, 33, 4], [4000]]) expect(play(dts)).toEqual(reference);
    const begin = start(build(createDefense(5), 1, 'rapid'));
    let small = begin;
    const events: DefenseEvent[] = [];
    for (let i = 0; i < 60; i++) {
      small = tick(small);
      events.push(...small.events);
    }
    expect(tick(begin, 3000).events).toEqual(events);
  });
});

describe('Mini Défense balance (AC-115)', () => {
  const rounds = Array.from({ length: 50 }, (_, i) => playDefenseBot(i + 1));
  const scores = rounds.map((s) => s.score).sort((a, b) => a - b);
  const median = (scores[24] + scores[25]) / 2;

  it('AC-115: every bot round ends without lives, within its cap of waves, and the bot is deterministic', () => {
    for (const s of rounds) {
      expect(s.status).toBe('over');
      expect(s.lives).toBe(0);
      expect(s.wave).toBeLessThan(BOT_WAVE_CAP);
    }
    expect(playDefenseBot(7)).toEqual(playDefenseBot(7));
  });

  it('AC-115: the bot builds the rotation Rapide, Canon, Givre in the slots covering the most cells, else upgrades', () => {
    expect(BOT_ROTATION).toEqual(['rapid', 'cannon', 'frost']);
    expect(botPurchase(createDefense(1))).toEqual({ type: 'build', slot: 1, turret: 'rapid' });
    const second = build(createDefense(1), 1, 'rapid');
    expect(second.gold).toBe(60);
    // 60 gold: no Canon (70), so it upgrades its Rapide (40).
    expect(botPurchase(second)).toEqual({ type: 'tapSlot', slot: 1 });
    expect(botPurchase({ ...second, gold: 70 })).toEqual({ type: 'build', slot: 3, turret: 'cannon' });
    expect(botPurchase({ ...second, gold: 39 })).toBeNull();
  });

  it('AC-115: over 50 seeds the casual bot median reaches the 1-star threshold and stays below the 3-star threshold', () => {
    const [one, , three] = gameById('defense').stars;
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });

  it('AC-115 (measured, reported): bot min / p25 / median / p90 / max over seeds 1-50', () => {
    expect({ min: scores[0], p25: scores[12], median, p90: scores[45], max: scores[49] }).toEqual({ min: 1050, p25: 1400, median: 1600, p90: 2170, max: 2480 });
  });
});
