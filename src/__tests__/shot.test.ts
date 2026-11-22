import { gameById } from '../game/core/content';
import { correctAim, playShotBot, START_ESTIMATE } from '../game/shot/bot';
import {
  acceptsInput,
  ANGLE_MAX,
  ANGLE_MIN,
  ANGLES,
  createShot,
  DISTANCE_MAX,
  DISTANCE_MIN,
  fallbackTarget,
  FLIGHT_MS,
  flightTime,
  generateTarget,
  GENERATOR_ATTEMPTS,
  heightAt,
  landing,
  MAX_SCORE,
  perfectSettings,
  POWER_MAX,
  POWER_MIN,
  POWERS,
  positionAt,
  reduceShot,
  resolveShot,
  SHOT_TARGETS,
  shotPoints,
  ShotAction,
  SHOTS_PER_TARGET,
  ShotState,
  solvable,
  Target,
  TARGET_SHOW_MS,
  targetFinished,
  WALL_MAX,
  WALL_MIN,
  wallDistance,
} from '../game/shot/engine';

const act = (state: ShotState, action: ShotAction) => reduceShot(state, action);
const tick = (state: ShotState, dt = 50) => reduceShot(state, { type: 'tick', dt });
const fire = (state: ShotState) => reduceShot(state, { type: 'fire' });

function settle(state: ShotState): ShotState {
  let s = state;
  for (let i = 0; i < 100 && s.status === 'playing' && !acceptsInput(s); i++) s = tick(s);
  return s;
}

/** Brings the setting to `angle` / `power` one step at a time, as the buttons do. */
function setAim(state: ShotState, angle: number, power: number): ShotState {
  let s = state;
  for (let i = 0; i < 40 && s.angle !== angle; i++) s = act(s, { type: 'angle', step: angle > s.angle ? 1 : -1 });
  for (let i = 0; i < 40 && s.power !== power; i++) s = act(s, { type: 'power', step: power > s.power ? 1 : -1 });
  expect([s.angle, s.power]).toEqual([angle, power]);
  return s;
}

/** Fires with `angle` / `power`; returns the state at the landing (flight over, before the pause runs out). */
function shoot(state: ShotState, angle: number, power: number): ShotState {
  let s = fire(setAim(state, angle, power));
  for (let i = 0; i < 100 && s.flight !== null; i++) s = tick(s);
  return s;
}

/** A setting of the given band points on the current target (the target is solvable: 100 always exists). */
function settingFor(state: ShotState, points: number): { angle: number; power: number } | null {
  for (const angle of ANGLES) for (const power of POWERS) if (resolveShot(state, angle, power).points === points) return { angle, power };
  return null;
}

/** A state of seed `seed` on a target where a setting of each wanted band exists (searched over the seeds). */
function roundWith(wanted: readonly number[], from = 1): ShotState {
  for (let seed = from; seed < from + 500; seed++) {
    const state = createShot(seed);
    if (wanted.every((points) => settingFor(state, points) !== null)) return state;
  }
  throw new Error('no seed found');
}

describe('Tir Parfait physics (AC-103)', () => {
  it('AC-103: the landing distance is speed² × sin(2 × angle) / 9.8 with speed = 3.4 × power (hand-computed cases)', () => {
    // 45°, power 5: speed 17 m/s → 289 / 9.8 = 29.4898 m.
    expect(landing(45, 5, 0)).toBeCloseTo(29.4898, 3);
    // 45°, power 10: speed 34 m/s → 1156 / 9.8 = 117.9592 m (the longest shot without wind).
    expect(landing(45, 10, 0)).toBeCloseTo(117.9592, 3);
    // 30°, power 8: speed 27.2 m/s → 739.84 × sin 60° / 9.8 = 739.84 × 0.866025 / 9.8 = 65.3798 m.
    expect(landing(30, 8, 0)).toBeCloseTo(65.3798, 3);
    // 60° lands where 30° does (sin 120° = sin 60°); 15° and 75° too (sin 30° = 0.5): 739.84 × 0.5 / 9.8 = 37.7469 m.
    expect(landing(60, 8, 0)).toBeCloseTo(65.3798, 3);
    expect(landing(15, 8, 0)).toBeCloseTo(37.7469, 3);
    expect(landing(75, 8, 0)).toBeCloseTo(37.7469, 3);
  });

  it('AC-103: the wind shifts the landing by wind × flight time² / 2 with flight time = 2 × speed × sin(angle) / 9.8', () => {
    // 30°, power 8: flight time = 2 × 27.2 × 0.5 / 9.8 = 2.77551 s; time² / 2 = 3.85173.
    expect(flightTime(30, 8)).toBeCloseTo(2.77551, 4);
    expect(landing(30, 8, 2)).toBeCloseTo(65.3798 + 2 * 3.85173, 3);
    expect(landing(30, 8, -1)).toBeCloseTo(65.3798 - 3.85173, 3);
    // 45°, power 10: flight time = 2 × 34 × 0.707107 / 9.8 = 4.90647 s → shift of 12.0367 m per m/s².
    expect(flightTime(45, 10)).toBeCloseTo(4.90647, 4);
    expect(landing(45, 10, -2)).toBeCloseTo(117.9592 - 24.0734, 3);
    // The trajectory ends on the ground at the landing distance.
    const end = positionAt(30, 8, 2, flightTime(30, 8));
    expect(end.x).toBeCloseTo(landing(30, 8, 2), 6);
    expect(end.y).toBeCloseTo(0, 6);
  });

  it('AC-103: the height at a distance follows the parabola (hand-computed cases)', () => {
    // 45°, power 9: speed 30.6 m/s, both components 21.6375 m/s. At x = 47.5 m: t = 2.19526 s →
    // height = 47.5 − 4.9 × 2.19526² = 47.5 − 23.614 = 23.886 m.
    expect(heightAt(45, 9, 0, 47.5)).toBeCloseTo(23.886, 2);
    // 15°, power 8: vx = 26.2732, vy = 7.03988. At x = 20 m: t = 0.761232 s → 5.35901 − 2.83945 = 2.5196 m.
    expect(heightAt(15, 8, 0, 20)).toBeCloseTo(2.5196, 3);
    // With a tail wind of 2 m/s² the shot gets to 20 m sooner: 26.2732 t + t² = 20 → t = 0.74033 s → 2.5263 m.
    expect(heightAt(15, 8, 2, 20)).toBeCloseTo(2.526, 2);
    // The shot lands at 37.7 m: it never gets to 60 m.
    expect(heightAt(15, 8, 0, 60)).toBeNull();
    // A strong headwind on a high shot turns it back before 30 m (75°, power 10: vx = 8.8 m/s, 19.36 m at most).
    expect(heightAt(75, 10, -2, 30)).toBeNull();
    expect(heightAt(75, 10, -2, 10)).toBeGreaterThan(30);
  });

  it('AC-103: the bands 2 / 5 / 10 m score 100 / 60 / 30, else 0 (limits included, either side of the centre)', () => {
    expect([0, 1.99, 2, 2.01, 5, 5.01, 10, 10.01, 60].map(shotPoints)).toEqual([100, 100, 100, 60, 60, 30, 30, 0, 0]);
    expect([-2, -5, -10, -10.5].map(shotPoints)).toEqual([100, 60, 30, 0]);
  });

  it('AC-103: a shot lower than the wall at its distance stops there and scores 0; a higher one flies on', () => {
    // 15°, power 8 lands at 37.75 m but flies 2.52 m high at 20 m; 75° lands there too and clears any wall.
    const target: Target = { distance: 40, wind: 0, wall: 6 };
    expect(wallDistance(target)).toBe(20);
    expect(resolveShot({ ...target, wall: null }, 15, 8)).toMatchObject({ blocked: false, points: 60 });
    const low = resolveShot(target, 15, 8);
    expect(low).toMatchObject({ blocked: true, points: 0, landing: 20 });
    expect(low.airTime).toBeCloseTo(0.761232, 4);
    const high = resolveShot(target, 75, 8);
    expect(high).toMatchObject({ blocked: false, points: 60 });
    expect(high.landing).toBeCloseTo(37.7469, 3);
    expect(high.airTime).toBeCloseTo(flightTime(75, 8), 9);
    // Exactly as high as the wall passes (strictly lower stops).
    const height = heightAt(15, 8, 0, 20) as number;
    expect(resolveShot({ ...target, wall: height }, 15, 8).blocked).toBe(false);
    expect(resolveShot({ ...target, wall: height + 0.001 }, 15, 8).blocked).toBe(true);
    // A shot that lands before the wall is an ordinary miss.
    expect(resolveShot({ distance: 100, wind: 0, wall: 14 }, 45, 5)).toMatchObject({ blocked: false, points: 0 });
  });
});

describe('Tir Parfait generator (AC-103)', () => {
  it('AC-103: every generated target can be hit at 2 m or less with some allowed angle and power (300 seeds × 6 targets)', () => {
    let rejected = 0;
    let fallbacks = 0;
    let targets = 0;
    for (let seed = 1; seed <= 300; seed++) {
      let rngState = (seed * 104729) >>> 0;
      for (let index = 1; index <= SHOT_TARGETS; index++) {
        const made = generateTarget(rngState, index);
        rngState = made.rngState;
        rejected += made.rejected;
        fallbacks += made.fallback ? 1 : 0;
        targets += 1;
        const { target } = made;
        expect(Number.isInteger(target.distance)).toBe(true);
        expect(target.distance).toBeGreaterThanOrEqual(DISTANCE_MIN);
        expect(target.distance).toBeLessThanOrEqual(DISTANCE_MAX);
        // No wind before the 3rd target, no wall before the 5th.
        if (index < 3) expect(target.wind).toBe(0);
        else expect([-2, -1, 0, 1, 2]).toContain(target.wind);
        if (index < 5) expect(target.wall).toBeNull();
        else {
          expect(target.wall).toBeGreaterThanOrEqual(WALL_MIN);
          expect(target.wall).toBeLessThanOrEqual(WALL_MAX);
        }
        const perfect = perfectSettings(target);
        expect(perfect.length).toBeGreaterThan(0);
        const { angle, power } = perfect[0];
        const shot = resolveShot(target, angle, power);
        expect(shot.blocked).toBe(false);
        expect(Math.abs(shot.landing - target.distance)).toBeLessThanOrEqual(2);
        expect(Math.abs(landing(angle, power, target.wind) - target.distance)).toBeLessThanOrEqual(2);
      }
    }
    // BOT_STATS=1 prints the share of seeded draws thrown away by the solvability check.
    if (process.env.BOT_STATS) console.log(`shot generator: ${targets} targets, ${rejected} draws rejected of ${targets + rejected} (${((100 * rejected) / (targets + rejected)).toFixed(1)} %), ${fallbacks} fallbacks`);
    expect(fallbacks).toBeLessThan(targets / 100);
  });

  it('AC-103: the fallback target of the bounded generator is solvable with and without its wall', () => {
    for (let index = 1; index <= SHOT_TARGETS; index++) expect(solvable(fallbackTarget(index))).toBe(true);
    expect(resolveShot(fallbackTarget(6), 45, 9)).toMatchObject({ blocked: false, points: 100 });
    expect(GENERATOR_ATTEMPTS).toBeGreaterThan(0);
  });

  it('AC-103: the round is seeded: the same seed gives the same targets, wind from the 3rd, wall from the 5th', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let state = createShot(seed);
      let twin = createShot(seed);
      expect(state.status).toBe('playing');
      for (let index = 1; index <= SHOT_TARGETS; index++) {
        expect(state.target).toBe(index);
        expect([state.distance, state.wind, state.wall]).toEqual([twin.distance, twin.wind, twin.wall]);
        if (index < 3) expect(state.wind).toBe(0);
        else expect([-2, -1, 1, 2]).toContain(state.wind);
        expect(state.wall !== null).toBe(index >= 5);
        const { angle, power } = perfectSettings(state)[0];
        state = settle(shoot(state, angle, power));
        twin = settle(shoot(twin, angle, power));
      }
      expect(state.status).toBe('over');
      expect(state.score).toBe(MAX_SCORE);
    }
  });
});

describe('Tir Parfait round (AC-103)', () => {
  it('AC-103: the angle goes from 15° to 75° by 5°, the power from 1 to 10 by 1', () => {
    let state = createShot(1);
    expect([state.angle, state.power]).toEqual([45, 5]);
    state = act(state, { type: 'angle', step: 1 });
    expect(state.angle).toBe(50);
    expect(state.events).toEqual([{ kind: 'aim', angle: 50, power: 5 }]);
    state = act(state, { type: 'power', step: -1 });
    expect(state.power).toBe(4);
    for (let i = 0; i < 20; i++) state = act(state, { type: 'angle', step: 1 });
    expect(state.angle).toBe(ANGLE_MAX);
    expect(state.events).toEqual([{ kind: 'ignored' }]);
    for (let i = 0; i < 20; i++) state = act(state, { type: 'angle', step: -1 });
    expect(state.angle).toBe(ANGLE_MIN);
    for (let i = 0; i < 20; i++) state = act(state, { type: 'power', step: 1 });
    expect(state.power).toBe(POWER_MAX);
    for (let i = 0; i < 20; i++) state = act(state, { type: 'power', step: -1 });
    expect(state.power).toBe(POWER_MIN);
    expect(state.events).toEqual([{ kind: 'ignored' }]);
  });

  it('AC-103: a 100-point first shot scores 100 + 50, is a combo and ends the target', () => {
    let state = createShot(7);
    const { angle, power } = perfectSettings(state)[0];
    state = fire(setAim(state, angle, power));
    expect(state.events).toEqual([{ kind: 'fire', angle, power }]);
    expect(state.shotsLeft).toBe(SHOTS_PER_TARGET - 1);
    // Nothing is scored before the flight ends.
    expect(state.score).toBe(0);
    for (let t = 50; t < FLIGHT_MS; t += 50) state = tick(state);
    expect(state.score).toBe(0);
    expect(state.flight).not.toBeNull();
    state = tick(state);
    expect(state.flight).toBeNull();
    expect(state.events).toEqual([
      { kind: 'landed', landing: landing(angle, power, 0), blocked: false, points: 100, bonus: 50 },
      { kind: 'score', points: 150 },
      { kind: 'combo' },
      { kind: 'done', target: 1, points: 150 },
    ]);
    expect(state.score).toBe(150);
    expect(state.combos).toBe(1);
    expect(targetFinished(state)).toBe(true);
    // The last landing point stays marked.
    expect(state.last).toMatchObject({ angle, power, points: 100 });
    state = settle(state);
    expect(state.target).toBe(2);
    expect(state.shotsLeft).toBe(SHOTS_PER_TARGET);
    expect(state.last).toBeNull();
    // The setting is kept from one target to the next.
    expect([state.angle, state.power]).toEqual([angle, power]);
  });

  it('AC-103: a miss leaves the target on; the 2nd shot that scores gets +20, the 3rd nothing more', () => {
    // Second shot in the 60 band: 60 + 20.
    let state = roundWith([0, 60]);
    const miss = settingFor(state, 0) as { angle: number; power: number };
    const sixty = settingFor(state, 60) as { angle: number; power: number };
    state = shoot(state, miss.angle, miss.power);
    expect(state.events).toEqual([{ kind: 'landed', landing: state.last?.landing, blocked: false, points: 0, bonus: 0 }]);
    expect(targetFinished(state)).toBe(false);
    expect(acceptsInput(state)).toBe(true);
    expect(state.shotsLeft).toBe(2);
    expect(state.target).toBe(1);
    state = shoot(state, sixty.angle, sixty.power);
    expect(state.events).toContainEqual({ kind: 'score', points: 80 });
    expect(state.events).toContainEqual({ kind: 'done', target: 1, points: 80 });
    expect(state.events).not.toContainEqual({ kind: 'combo' });
    expect(state.score).toBe(80);
    expect(state.combos).toBe(0);
    expect(settle(state).target).toBe(2);

    // Third shot in the 30 band: 30, no bonus.
    state = roundWith([0, 30]);
    const zero = settingFor(state, 0) as { angle: number; power: number };
    const thirty = settingFor(state, 30) as { angle: number; power: number };
    state = shoot(shoot(state, zero.angle, zero.power), zero.angle, zero.power);
    expect(state.shotsLeft).toBe(1);
    expect(state.score).toBe(0);
    state = shoot(state, thirty.angle, thirty.power);
    expect(state.events).toContainEqual({ kind: 'landed', landing: state.last?.landing, blocked: false, points: 30, bonus: 0 });
    expect(state.score).toBe(30);
    expect(settle(state).target).toBe(2);

    // First shot in the 60 band: 60 + 50, no combo.
    state = roundWith([60]);
    const first = settingFor(state, 60) as { angle: number; power: number };
    state = shoot(state, first.angle, first.power);
    expect(state.score).toBe(110);
    expect(state.combos).toBe(0);
  });

  it('AC-103: after 3 missed shots the target scores 0 and the next one comes; a round is 6 targets', () => {
    let state = roundWith([0]);
    for (let index = 1; index <= SHOT_TARGETS; index++) {
      expect(state.target).toBe(index);
      const miss = settingFor(state, 0) as { angle: number; power: number };
      for (let shot = 1; shot <= SHOTS_PER_TARGET; shot++) {
        expect(targetFinished(state)).toBe(false);
        state = shoot(state, miss.angle, miss.power);
        expect(state.shotsLeft).toBe(SHOTS_PER_TARGET - shot);
      }
      expect(state.events).toContainEqual({ kind: 'done', target: index, points: 0 });
      expect(targetFinished(state)).toBe(true);
      state = settle(state);
    }
    expect(state.status).toBe('over');
    expect(state.score).toBe(0);
    expect(state.events).toEqual([{ kind: 'over', score: 0 }]);
    expect(fire(state).events).toEqual([]);
    expect(MAX_SCORE).toBe(900);
  });

  it('AC-103: on the 5th and 6th targets a shot under the wall scores 0 and is marked at the wall', () => {
    let found = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let state = createShot(seed);
      for (let index = 1; index < 5; index++) {
        const { angle, power } = perfectSettings(state)[0];
        state = settle(shoot(state, angle, power));
      }
      expect(state.target).toBe(5);
      expect(state.wall).not.toBeNull();
      // The flattest shot that would land in a band without the wall, if the wall stops it.
      const open: Target = { distance: state.distance, wind: state.wind, wall: null };
      const low = POWERS.find((power) => resolveShot(open, ANGLE_MIN, power).points > 0 && resolveShot(state, ANGLE_MIN, power).blocked);
      if (low === undefined) continue;
      found += 1;
      const score = state.score;
      state = shoot(state, ANGLE_MIN, low);
      expect(state.events).toEqual([{ kind: 'landed', landing: state.distance / 2, blocked: true, points: 0, bonus: 0 }]);
      expect(state.score).toBe(score);
      expect(state.last).toMatchObject({ blocked: true, landing: state.distance / 2 });
      expect(state.shotsLeft).toBe(2);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('AC-103: « Viseur » draws the first 25 / 40 / 55 % of the trajectory', () => {
    expect(createShot(1).sight).toBe(0);
    expect(createShot(1, { sight: 1 }).sight).toBe(0.25);
    expect(createShot(1, { sight: 2 }).sight).toBe(0.4);
    expect(createShot(1, { sight: 3 }).sight).toBe(0.55);
    // The upgrade changes nothing else.
    expect(createShot(9, { sight: 3 }).distance).toBe(createShot(9).distance);
  });
});

describe('Tir Parfait guard and casual bot (AC-108)', () => {
  it('AC-108: the flight plays in 700 ms: an input during the flight changes nothing', () => {
    let state = fire(createShot(3));
    expect(state.flightMs).toBe(FLIGHT_MS);
    const flying = state;
    const inputs: ShotAction[] = [{ type: 'fire' }, { type: 'fire' }, { type: 'angle', step: 1 }, { type: 'angle', step: -1 }, { type: 'power', step: 1 }, { type: 'power', step: -1 }];
    for (const input of inputs) {
      state = act(state, input);
      expect(state).toEqual({ ...flying, events: [{ kind: 'ignored' }] });
    }
    for (let t = 50; t < FLIGHT_MS; t += 50) {
      state = tick(state);
      expect(act(state, { type: 'fire' }).events).toEqual([{ kind: 'ignored' }]);
      expect(act(state, { type: 'power', step: 1 }).power).toBe(flying.power);
    }
    state = tick(state);
    expect(state.flight).toBeNull();
    expect(state.shotsLeft).toBe(SHOTS_PER_TARGET - 1);
  });

  it('AC-108: a finished target stays shown 900 ms (inputs ignored), then the next target comes', () => {
    let state = createShot(4);
    const { angle, power } = perfectSettings(state)[0];
    state = shoot(state, angle, power);
    expect(state.doneMs).toBe(TARGET_SHOW_MS);
    for (let t = 50; t < TARGET_SHOW_MS; t += 50) {
      state = tick(state);
      expect(state.target).toBe(1);
      expect(fire(state).events).toEqual([{ kind: 'ignored' }]);
      expect(act(state, { type: 'angle', step: 1 }).angle).toBe(angle);
    }
    state = tick(state);
    expect(state.target).toBe(2);
    expect(state.events).toEqual([{ kind: 'target', target: 2 }]);
    expect(acceptsInput(state)).toBe(true);
    // A tick with nothing running changes nothing.
    const idle = tick(state);
    expect(tick(idle)).toBe(idle);
  });

  it('AC-108: the bot corrects the power by one step per 15 m of error, else the angle by one step', () => {
    const start = { angle: 45, power: 5, estimate: START_ESTIMATE };
    // 62 m away with a setting that lands about 30 m: 32 m short → 2 power steps.
    expect(correctAim(start, 62)).toEqual({ angle: 45, power: 7, estimate: 60 });
    // 6 m long: 5° higher.
    expect(correctAim({ angle: 45, power: 7, estimate: 68 }, 62)).toEqual({ angle: 50, power: 7, estimate: 62 });
    // 6 m short above 45°: 5° lower; at 45° nothing smaller than a power step is left.
    expect(correctAim({ angle: 55, power: 7, estimate: 56 }, 62)).toEqual({ angle: 50, power: 7, estimate: 62 });
    expect(correctAim({ angle: 45, power: 7, estimate: 56 }, 62)).toEqual({ angle: 45, power: 7, estimate: 56 });
    // 2 m or less: it fires again as it is.
    expect(correctAim({ angle: 45, power: 7, estimate: 61 }, 62)).toEqual({ angle: 45, power: 7, estimate: 61 });
  });

  it('AC-108: the casual bot (one correction per shot from where the last one landed) has a median between 1 and 3 stars over 50 seeds', () => {
    const [one, , three] = gameById('shot').stars;
    const scores = Array.from({ length: 50 }, (_, i) => {
      const end = playShotBot(1 + i);
      expect(end.status).toBe('over');
      expect(end.target).toBe(SHOT_TARGETS);
      return end.score;
    }).sort((a, b) => a - b);
    const median = (scores[24] + scores[25]) / 2;
    // BOT_STATS=1 prints the measured distribution (for the PRD balance table).
    if (process.env.BOT_STATS) console.log(`shot bot: min ${scores[0]}, p25 ${scores[12]}, median ${median}, p90 ${scores[44]}, max ${scores[49]} (stars ${gameById('shot').stars.join(' / ')})`);
    expect(median).toBeGreaterThanOrEqual(one);
    expect(median).toBeLessThan(three);
  });
});
