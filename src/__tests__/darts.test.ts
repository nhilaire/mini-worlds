import { ICON } from '../art/icons/darts';
import { validateSprite } from '../art/sprites';
import { angularDistance } from '../game/candles/engine';
import { gameById } from '../game/core/content';
import { BOT_MARGIN, BOT_PATIENCE_MS, botExpectedAngle, botMargin, botThrows, playDartsBot } from '../game/darts/bot';
import {
  bounceAngle,
  createDarts,
  DART_POINTS,
  DartsState,
  dartsLeft,
  dartsNeeded,
  directionAt,
  FLIGHT_MS,
  LEVEL_PAUSE_MS,
  LEVEL_POINTS,
  LIVES,
  MAX_LEVEL,
  MAX_SCORE,
  presetCount,
  reduceDarts,
  REVERSE_MS,
  rotationAt,
  rotationOf,
  spinDirection,
  spinSpeed,
} from '../game/darts/engine';

const tick = (s: DartsState, dt: number) => reduceDarts(s, { type: 'tick', dt });
const tap = (s: DartsState) => reduceDarts(s, { type: 'throw' });
/** Throws now and lets the dart land (one tick of exactly the flight). */
const throwAndLand = (s: DartsState) => tick(tap(s), FLIGHT_MS);
const withoutEvents = (s: DartsState) => ({ ...s, events: [] });

/**
 * Level 5 at 3 880 ms: the dart thrown now lands at 4 000 ms, when the target is back at rotation 0 exactly (two
 * legs of 2 000 ms), so it lands at target angle 0. `angles` are the darts already on the target.
 */
function landingAtZero(angles: number[], upgrades = {}): DartsState {
  return { ...createDarts(7, upgrades), level: 5, levelMs: 2 * REVERSE_MS - FLIGHT_MS, darts: angles.map((angle) => ({ angle, preset: true })) };
}

/** Where a dart thrown now would land (target frame). */
function landingAngle(s: DartsState): number {
  return (360 - rotationAt(s.level, s.levelMs + FLIGHT_MS)) % 360;
}

/** Free arc (°) where a dart can still stick, sampled every 0.25°. */
function freeArc(s: DartsState): number {
  let free = 0;
  for (let a = 0; a < 360; a += 0.25) if (s.darts.every((d) => angularDistance(d.angle, a) >= bounceAngle(s.steadyLevel))) free += 0.25;
  return free;
}

/**
 * A careful player: 1 ms ticks, throws on an empty target or when the dart will land between 12.2° and 13.5° from the
 * nearest dart (tight packing). Plays until the level changes or the round ends; `onLast` sees the state before the
 * last dart of the level.
 */
function clearLevel(state: DartsState, onLast?: (s: DartsState) => void): DartsState {
  let s = state;
  const level = s.level;
  for (let guard = 0; s.level === level && s.status === 'playing' && guard < 200000; guard++) {
    if (s.flightMs === 0 && s.pauseMs === 0) {
      const landing = landingAngle(s);
      const nearest = Math.min(999, ...s.darts.map((d) => angularDistance(d.angle, landing)));
      if (s.darts.length === 0 || (nearest >= 12.2 && nearest < 13.5)) {
        if (dartsLeft(s) === 1) onLast?.(s);
        s = tap(s);
      }
    }
    s = tick(s, 1);
  }
  return s;
}

function clearLevels(state: DartsState, count: number): DartsState {
  let s = state;
  for (let i = 0; i < count; i++) s = clearLevel(s);
  return s;
}

describe('Lancer de Cible engine (AC-102)', () => {
  it('AC-102: level k needs 4 + k darts, holds min(k − 1, 4) planted ones and turns at 90 + 15 × (k − 1) °/s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(dartsNeeded)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(presetCount)).toEqual([0, 1, 2, 3, 4, 4, 4, 4]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(spinSpeed)).toEqual([90, 105, 120, 135, 150, 165, 180, 195]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(spinDirection)).toEqual([1, -1, 1, -1, 1, -1, 1, -1]);
    const s = createDarts(42);
    expect(s).toMatchObject({ level: 1, levelMs: 0, darts: [], stuck: 0, lives: LIVES, score: 0, combos: 0, status: 'playing', flightMs: 0, pauseMs: 0 });
    expect(dartsLeft(s)).toBe(5);
    expect(MAX_SCORE).toBe(1080);
  });

  it('AC-102: the rotation is a pure function of the elapsed time: clockwise on odd levels, anticlockwise on even ones', () => {
    expect(rotationAt(1, 1000)).toBeCloseTo(90);
    expect(rotationAt(1, 4500)).toBeCloseTo(45); // wraps at 360
    expect(rotationAt(2, 1000)).toBeCloseTo(360 - 105);
    expect(rotationAt(3, 500)).toBeCloseTo(60);
    expect(rotationAt(4, 1000)).toBeCloseTo(360 - 135);
    // However the time is cut into ticks, the target is at the same place.
    let s = createDarts(3);
    for (const dt of [16, 17, 50, 3, 914]) s = tick(s, dt);
    expect(s.levelMs).toBe(1000);
    expect(rotationOf(s)).toBe(rotationAt(1, 1000));
    expect(rotationOf(tick(createDarts(3), 1000))).toBe(rotationOf(s));
  });

  it('AC-102: from level 5 the rotation reverses every 2 000 ms; before level 5 it never does', () => {
    // Level 5: 150 °/s clockwise, then back.
    expect([0, 1000, 2000, 3000, 4000, 5000, 6500].map((ms) => rotationAt(5, ms))).toEqual([0, 150, 300, 150, 0, 150, 225]);
    expect([0, 1999, 2000, 3999, 4000].map((ms) => directionAt(5, ms))).toEqual([1, 1, -1, -1, 1]);
    // Level 6: 165 °/s anticlockwise first.
    expect(rotationAt(6, 1000)).toBeCloseTo(195);
    expect(rotationAt(6, 2000)).toBeCloseTo(30);
    expect(rotationAt(6, 3000)).toBeCloseTo(195);
    expect([0, 2000, 4000].map((ms) => directionAt(6, ms))).toEqual([-1, 1, -1]);
    expect(rotationAt(8, 2000)).toBeCloseTo(360 - 30); // 195 °/s anticlockwise: 390° in a leg
    expect([0, 2000, 60000].map((ms) => directionAt(4, ms))).toEqual([-1, -1, -1]);
    expect(rotationAt(4, 3000)).toBeCloseTo(360 - 45);
  });

  it('AC-102: the dart lands 120 ms after the tap, at the angle under the bottom point at that moment, for 10 points', () => {
    let s = tap(tick(createDarts(7), 1000));
    expect(s.flightMs).toBe(FLIGHT_MS);
    expect(s.events).toEqual([{ kind: 'throw' }]);
    s = tick(s, 119);
    expect(s).toMatchObject({ darts: [], score: 0, flightMs: 1 });
    s = tick(s, 1);
    const angle = 360 - rotationAt(1, 1120);
    expect(angle).toBeCloseTo(259.2);
    expect(s.darts).toEqual([{ angle, preset: false }]);
    expect(s).toMatchObject({ score: DART_POINTS, stuck: 1, flightMs: 0, lives: 3 });
    expect(dartsLeft(s)).toBe(4);
    expect(s.events).toEqual([{ kind: 'stick', angle }, { kind: 'score', points: 10 }]);
    // A long tick still resolves the landing at the end of the flight, not at the end of the tick.
    const late = tick(tap(tick(createDarts(7), 1000)), 500);
    expect(late.darts).toEqual([{ angle, preset: false }]);
    expect(late.levelMs).toBe(1500);
  });

  it('AC-102: a dart within 12° of another one bounces off and costs a life; 12° exactly sticks', () => {
    const ok = throwAndLand(landingAtZero([12, 348, 180]));
    expect(ok.darts).toContainEqual({ angle: 0, preset: false });
    expect(ok).toMatchObject({ lives: 3, score: 10, stuck: 1 });
    for (const near of [11.99, 348.01, 0, 5]) {
      const before = landingAtZero([near, 180]);
      const s = throwAndLand(before);
      expect(s.darts).toBe(before.darts); // the dart does not stay on the target
      expect(s).toMatchObject({ lives: 2, score: 0, stuck: 0, lostInLevel: true, status: 'playing', flightMs: 0 });
      expect(dartsLeft(s)).toBe(dartsLeft(before));
      expect(s.events).toEqual([{ kind: 'bounce', angle: 0 }]);
    }
  });

  it('AC-102: « Main sûre » narrows the bounce angle to 11° / 10° / 9°', () => {
    expect([0, 1, 2, 3].map(bounceAngle)).toEqual([12, 11, 10, 9]);
    expect([0, 1, 2, 3].map((steady) => createDarts(1, { steady }).steadyLevel)).toEqual([0, 1, 2, 3]);
    const lives = (angle: number, steady: number) => throwAndLand(landingAtZero([angle], { steady })).lives;
    expect([0, 1, 2, 3].map((steady) => lives(11.5, steady))).toEqual([2, 3, 3, 3]);
    expect([0, 1, 2, 3].map((steady) => lives(10.5, steady))).toEqual([2, 2, 3, 3]);
    expect([0, 1, 2, 3].map((steady) => lives(9.5, steady))).toEqual([2, 2, 2, 3]);
    expect([0, 1, 2, 3].map((steady) => lives(8.5, steady))).toEqual([2, 2, 2, 2]);
  });

  it('AC-102: a tap during a flight is ignored: one dart in flight at a time', () => {
    const flying = tick(tap(createDarts(9)), 60);
    const again = tap(flying);
    expect(again.events).toEqual([{ kind: 'ignored' }]);
    expect(withoutEvents(again)).toEqual(withoutEvents(flying));
    const landed = tick(again, 60);
    expect(landed.darts).toHaveLength(1);
    expect(landed.levelMs).toBe(FLIGHT_MS);
    expect(tap(landed).flightMs).toBe(FLIGHT_MS); // accepted again once the dart has landed
  });

  it('AC-102: the round ends at the 3rd life lost', () => {
    let s = throwAndLand(landingAtZero([0]));
    s = throwAndLand({ ...s, levelMs: 2 * REVERSE_MS - FLIGHT_MS });
    expect(s).toMatchObject({ lives: 1, status: 'playing' });
    s = throwAndLand({ ...s, levelMs: 2 * REVERSE_MS - FLIGHT_MS, score: 70 });
    expect(s).toMatchObject({ lives: 0, status: 'over', score: 70 });
    expect(s.events).toEqual([
      { kind: 'bounce', angle: 0 },
      { kind: 'over', score: 70 },
    ]);
    expect(tap(s)).toBe(s);
    expect(tick(s, 50)).toBe(s);
  });

  it('AC-102: a level cleared gives 50 (+10 for its last dart) and a combo; the next target appears after 600 ms', () => {
    const s = clearLevel(createDarts(42));
    expect(s).toMatchObject({ level: 2, score: 5 * 10 + LEVEL_POINTS, combos: 1, stuck: 0, levelMs: 0, pauseMs: LEVEL_PAUSE_MS, lives: 3, lostInLevel: false, status: 'playing' });
    expect(s.events.slice(1)).toEqual([{ kind: 'score', points: 60 }, { kind: 'combo' }, { kind: 'level', level: 2 }]);
    expect(s.darts).toHaveLength(1);
    expect(s.darts[0].preset).toBe(true);
    expect(dartsLeft(s)).toBe(6);
    // The pause: nothing turns and taps are ignored.
    const still = tick(s, 599);
    expect(still).toMatchObject({ levelMs: 0, pauseMs: 1 });
    expect(tap(still).events).toEqual([{ kind: 'ignored' }]);
    expect(withoutEvents(tap(still))).toEqual(withoutEvents(still));
    // A tick across the end of the pause turns the target for the rest of it.
    const after = tick(still, 101);
    expect(after).toMatchObject({ levelMs: 100, pauseMs: 0 });
    expect(rotationOf(after)).toBeCloseTo(360 - 10.5);
    expect(tap(after).flightMs).toBe(FLIGHT_MS);
  });

  it('AC-102: a level cleared after a life was lost in it is no combo; the next level can be one again', () => {
    let s = throwAndLand(createDarts(42)); // lands at 120 ms
    s = tick(s, 4000 - FLIGHT_MS - FLIGHT_MS); // one full turn later the same place is under the bottom point
    s = throwAndLand(s);
    expect(s).toMatchObject({ lives: 2, stuck: 1, lostInLevel: true, score: 10 });
    s = clearLevel(s);
    expect(s).toMatchObject({ level: 2, combos: 0, score: 100, lives: 2, lostInLevel: false });
    expect(s.events).not.toContainEqual({ kind: 'combo' });
    s = clearLevel(s);
    expect(s).toMatchObject({ level: 3, combos: 1, score: 100 + 6 * 10 + 50 });
  });

  it('AC-102: the planted darts are seeded (same seed, same targets) and at least 30° apart', () => {
    const play = (seed: number) => {
      let s = createDarts(seed);
      const presets: number[][] = [];
      for (let level = 1; level <= MAX_LEVEL; level++) {
        presets.push(s.darts.filter((d) => d.preset).map((d) => d.angle));
        expect(s.darts.every((d) => d.preset)).toBe(true);
        s = clearLevel(s);
      }
      return presets;
    };
    const a = play(1234);
    expect(play(1234)).toEqual(a);
    expect(a.map((p) => p.length)).toEqual([0, 1, 2, 3, 4, 4, 4, 4]);
    for (const preset of a) {
      for (let i = 0; i < preset.length; i++) for (let j = i + 1; j < preset.length; j++) expect(angularDistance(preset[i], preset[j])).toBeGreaterThanOrEqual(30);
    }
    expect(play(99)).not.toEqual(a);
  });

  it('AC-102: the round ends after level 8; a careful player clears every level (free arc left before the last dart)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let s = createDarts(seed);
      const free: number[] = [];
      for (let level = 1; level <= MAX_LEVEL; level++) s = clearLevel(s, (last) => free.push(freeArc(last)));
      expect(s).toMatchObject({ status: 'over', level: MAX_LEVEL, score: MAX_SCORE, combos: MAX_LEVEL, lives: 3, pauseMs: 0 });
      expect(s.events.slice(-2)).toEqual([{ kind: 'combo' }, { kind: 'over', score: MAX_SCORE }]);
      expect(s.darts).toHaveLength(12 + 4);
      // Tight packing leaves more than 100° free before the 12th dart of level 8.
      expect(free).toHaveLength(MAX_LEVEL);
      expect(Math.min(...free)).toBeGreaterThan(100);
    }
  });

  it('a tick without time changes nothing; the direction of level 7 and 8 follows the same rule', () => {
    const s = tick(createDarts(5), 100);
    expect(tick(s, 0)).toBe(s);
    expect(withoutEvents(tick(tap(s), 0))).toEqual(withoutEvents(tap(s)));
    const seven = clearLevels(createDarts(5), 6);
    expect(seven.level).toBe(7);
    expect(rotationOf(tick(seven, LEVEL_PAUSE_MS + 1000))).toBeCloseTo(180);
  });

  it('the icon is a valid 12×12 sprite', () => {
    expect(validateSprite(ICON)).toEqual([]);
    expect([ICON.rows.length, ICON.rows[0].length]).toEqual([12, 12]);
  });
});

describe('Lancer de Cible balance and guards (AC-108)', () => {
  const [oneStar, , threeStars] = gameById('darts').stars;
  const rounds = Array.from({ length: 50 }, (_, i) => playDartsBot(i + 1));
  const scores = rounds.map((s) => s.score).sort((a, b) => a - b);
  const median = (scores[24] + scores[25]) / 2;

  it('AC-108: the generator starts a round for every seed tried', () => {
    for (let seed = 0; seed < 500; seed++) {
      const state = createDarts(seed * 2654435761);
      expect(state).toMatchObject({ status: 'playing', level: 1, lives: 3, darts: [] });
      // The first target with planted darts is dealt too.
      const two = clearLevel(state);
      expect(two.darts).toHaveLength(1);
      expect(Number.isInteger(two.darts[0].angle)).toBe(true);
    }
  });

  it('AC-108: every seed finishes: 3 lives lost or level 8 cleared, the score within the maximum', () => {
    for (const s of rounds) {
      expect(s.status).toBe('over');
      expect(s.lives === 0 || (s.level === MAX_LEVEL && dartsLeft(s) === 0)).toBe(true);
      expect(s.score).toBeLessThanOrEqual(MAX_SCORE);
      expect(s.score % 10).toBe(0);
    }
  });

  it('AC-108: an input during the input guard changes nothing (a tap during a flight, during the pause, after the end)', () => {
    const flying = tap(createDarts(11));
    const again = tap(flying);
    expect(withoutEvents(again)).toEqual(withoutEvents(flying));
    // The round goes on exactly as if the second tap had not happened.
    expect(tick(again, FLIGHT_MS)).toEqual(tick(flying, FLIGHT_MS));
    const pausing = clearLevel(createDarts(11));
    expect(pausing.pauseMs).toBe(LEVEL_PAUSE_MS);
    expect(withoutEvents(tap(pausing))).toEqual(withoutEvents(pausing));
    expect(tick(tap(pausing), LEVEL_PAUSE_MS)).toEqual(tick(pausing, LEVEL_PAUSE_MS));
    const over = playDartsBot(11);
    expect(tap(over)).toBe(over);
  });

  it('AC-108: the casual bot is deterministic per seed, anticipates the flight and loses patience', () => {
    expect(playDartsBot(7)).toEqual(playDartsBot(7));
    expect(botMargin(0)).toBe(BOT_MARGIN);
    expect(botMargin(BOT_PATIENCE_MS / 2)).toBe(BOT_MARGIN / 2);
    expect(botMargin(BOT_PATIENCE_MS * 3)).toBe(0);
    // Without timing error the bot expects exactly the landing angle of the engine.
    const s = tick(createDarts(7), 700);
    expect(botExpectedAngle(s, 0)).toBe(throwAndLand(s).darts[0].angle);
    expect(botExpectedAngle(s, 100)).toBeCloseTo(botExpectedAngle(s, 0) - 9);
    // It throws only when the expected place is clear by the bounce angle + the margin.
    const near = landingAtZero([12 + BOT_MARGIN - 0.5]);
    expect(botThrows(near, 0, BOT_MARGIN)).toBe(false);
    expect(botThrows(near, 0, 0)).toBe(true);
    expect(botThrows(landingAtZero([12 + BOT_MARGIN]), 0, BOT_MARGIN)).toBe(true);
    expect(botThrows(landingAtZero([]), 0, BOT_MARGIN)).toBe(true);
  });

  it('AC-108: over 50 seeds the casual bot has a median ≥ the 1-star threshold and < the 3-star one', () => {
    expect(median).toBeGreaterThanOrEqual(oneStar);
    expect(median).toBeLessThan(threeStars);
  });

  it('AC-108 (measured, reported): bot min / p25 / median / p90 / max over seeds 1-50', () => {
    expect({ min: scores[0], p25: scores[12], median, p90: scores[45], max: scores[49] }).toEqual({ min: 250, p25: 350, median: 390, p90: 540, max: 640 });
  });
});
