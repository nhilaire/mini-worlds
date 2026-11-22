// « Tir Parfait » (docs/PRD.md "Tir Parfait", AC-103): a catapult on the left throws at a target on the ground, at a
// seeded distance of 40 to 100 m. The player sets the angle (15° to 75° by 5°) and the power (1 to 10), then fires.
// Pure reducer on an immutable state, see src/game/contract.ts; time comes in through `tick`.
//
// Physics: speed = 3.4 × power m/s, gravity 9.8 m/s², flight time = 2 × speed × sin(angle) / 9.8, landing distance =
// speed² × sin(2 × angle) / 9.8 + wind × flight time² / 2 (the wind is a horizontal acceleration in m/s², 0 on the
// targets 1-2, seeded from the 3rd). From the 5th target a wall (6 to 14 m high) stands half-way: a shot lower than
// the wall when it gets there stops at the wall and scores 0.
// Score of a shot from the distance between the landing point and the centre: 2 m or less 100, 5 m or less 60, 10 m
// or less 30, else 0. Up to 3 shots per target; the target is over at the first shot that scores (+50 on the 1st
// shot, +20 on the 2nd) or after the 3rd. A 100-point shot is a combo. A round is 6 targets.
// Input guard: the flight lasts FLIGHT_MS; every input is ignored meanwhile (ms counter advanced by `tick`). The shot
// is settled (score, shots, next target) when the flight ends, so that the HUD changes when the ball lands.
//
// Readings chosen (not in the PRD):
// - distances and wall heights are whole metres; the wind is a whole number among −2, −1, +1, +2 (never 0 from the
//   3rd target, except on the fallback target, which has none; a positive wind pushes towards the target, to the
//   right);
// - the angle and the power are kept from one target to the next (they start at 45° and 5);
// - a finished target stays on screen for TARGET_SHOW_MS (inputs ignored) with its landing point, then the next comes;
// - a headwind can bring a high shot back: the wall is then tested at both passages (the first one that is lower
//   than the wall stops the shot); a shot that lands before the wall is an ordinary shot;
// - the wall stops a shot strictly lower than its height; the bands include their limit (exactly 2 m scores 100).
// Generator: a target is drawn (distance, wind, wall) and kept only when some allowed angle and power lands 2 m or
// less from its centre (angles go by 5° and powers by 1, so not every distance can be hit); after GENERATOR_ATTEMPTS
// seeded draws the fixed FALLBACK target is used, so that the generator always ends.
import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const GRAVITY = 9.8;
export const SPEED_PER_POWER = 3.4;
export const ANGLE_MIN = 15;
export const ANGLE_MAX = 75;
export const ANGLE_STEP = 5;
export const POWER_MIN = 1;
export const POWER_MAX = 10;
export const START_ANGLE = 45;
export const START_POWER = 5;
export const DISTANCE_MIN = 40;
export const DISTANCE_MAX = 100;
/** The wind is a whole number of m/s² in −WIND_MAX..+WIND_MAX (never 0), from this target on. */
export const WIND_MAX = 2;
export const WIND_FROM_TARGET = 3;
export const WALL_FROM_TARGET = 5;
export const WALL_MIN = 6;
export const WALL_MAX = 14;
export const SHOT_TARGETS = 6;
export const SHOTS_PER_TARGET = 3;
/** Bands of the distance to the centre (m, limit included) and their points, the best first. */
export const SHOT_BANDS: readonly { within: number; points: number }[] = [
  { within: 2, points: 100 },
  { within: 5, points: 60 },
  { within: 10, points: 30 },
];
/** Bonus of the scoring shot by its rank on the target (1st, 2nd, 3rd). */
export const SHOT_BONUS: readonly number[] = [50, 20, 0];
/** A shot at these points is a combo. */
export const COMBO_POINTS = 100;
/** The flight plays this long; inputs are ignored meanwhile. */
export const FLIGHT_MS = 700;
/** A finished target stays shown this long (inputs ignored) before the next one. */
export const TARGET_SHOW_MS = 900;
/** Share of the trajectory drawn before the shot, by « Viseur » level. */
export const SIGHT_SHARES: readonly number[] = [0, 0.25, 0.4, 0.55];
/** Seeded draws tried for a target before the fallback. */
export const GENERATOR_ATTEMPTS = 20;
/** Fixed target of the generator's last resort: 45° at power 9 lands at 95.55 m and flies 23.9 m high half-way. */
export const FALLBACK_DISTANCE = 95;
export const FALLBACK_WALL = WALL_MIN;
/** The best score of a round: 100 + 50 on the first shot of every target. */
export const MAX_SCORE = SHOT_TARGETS * (SHOT_BANDS[0].points + SHOT_BONUS[0]);

export type Target = {
  /** Distance of the centre from the catapult (m). */
  distance: number;
  /** Horizontal acceleration of the shot (m/s², positive towards the target). */
  wind: number;
  /** Height of the wall (m), null without wall. The wall stands at `distance / 2`. */
  wall: number | null;
};

export type Shot = {
  angle: number;
  power: number;
  /** Where the shot stopped (m from the catapult): its landing point, or the wall when it was blocked. */
  landing: number;
  /** The wall stopped it. */
  blocked: boolean;
  /** Time in the air (s) until the landing or the wall: the screen draws the trajectory up to it. */
  airTime: number;
  /** Points of its band (without the bonus). */
  points: number;
};

export type ShotEvent =
  /** The angle or the power changed. */
  | { kind: 'aim'; angle: number; power: number }
  | { kind: 'fire'; angle: number; power: number }
  /** The flight ended: where, the points of the band and the bonus. */
  | { kind: 'landed'; landing: number; blocked: boolean; points: number; bonus: number }
  /** The target is over: `points` is what it scored (band + bonus, 0 when missed three times). */
  | { kind: 'done'; target: number; points: number }
  /** The next target is on screen. */
  | { kind: 'target'; target: number }
  /** An input during the flight or on a finished target, or a setting already at its limit: nothing changes. */
  | { kind: 'ignored' };

export type ShotState = RoundState<ShotEvent> &
  Target & {
    /** Current target, 1..6. */
    target: number;
    angle: number;
    power: number;
    shotsLeft: number;
    /** The shot in the air, null otherwise. */
    flight: Shot | null;
    /** Time left of the flight (ms): inputs are ignored while > 0. */
    flightMs: number;
    /** The last shot landed on this target (its landing point stays marked), null before the first. */
    last: Shot | null;
    /** Time left of the finished target on screen (ms): inputs are ignored, then the next target comes. */
    doneMs: number;
    /** Share of the trajectory drawn before the shot (« Viseur »). */
    sight: number;
    rngState: number;
  };

export type ShotAction = { type: 'angle'; step: 1 | -1 } | { type: 'power'; step: 1 | -1 } | { type: 'fire' } | { type: 'tick'; dt: number };

const rad = (degrees: number) => (degrees * Math.PI) / 180;

export const speedOf = (power: number) => SPEED_PER_POWER * power;

/** Flight time (s) of a shot that nothing stops: 2 × speed × sin(angle) / 9.8. */
export function flightTime(angleDeg: number, power: number): number {
  return (2 * speedOf(power) * Math.sin(rad(angleDeg))) / GRAVITY;
}

/** Landing distance (m): speed² × sin(2 × angle) / 9.8 + wind × flight time² / 2. */
export function landing(angleDeg: number, power: number, wind: number): number {
  const speed = speedOf(power);
  const time = flightTime(angleDeg, power);
  return (speed * speed * Math.sin(rad(2 * angleDeg))) / GRAVITY + (wind * time * time) / 2;
}

/** Position (m) of the shot `t` seconds after the throw: the parabola pushed by the wind. */
export function positionAt(angleDeg: number, power: number, wind: number, t: number): { x: number; y: number } {
  const speed = speedOf(power);
  return { x: speed * Math.cos(rad(angleDeg)) * t + (wind * t * t) / 2, y: speed * Math.sin(rad(angleDeg)) * t - (GRAVITY * t * t) / 2 };
}

/** Times (s, ascending, within the flight) at which the shot is `x` metres from the catapult (x > 0). */
function timesAt(angleDeg: number, power: number, wind: number, x: number): number[] {
  const vx = speedOf(power) * Math.cos(rad(angleDeg));
  // vx × t + wind × t² / 2 = x: with a headwind the shot may never get there, or pass twice.
  const disc = vx * vx + 2 * wind * x;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  const times = [(2 * x) / (vx + root)];
  if (wind < 0 && root > 0) times.push((vx + root) / -wind);
  const end = flightTime(angleDeg, power);
  return times.filter((t) => t <= end);
}

/** Height (m) of the shot when it first gets `x` metres from the catapult; null when it lands before. */
export function heightAt(angleDeg: number, power: number, wind: number, x: number): number | null {
  const [first] = timesAt(angleDeg, power, wind, x);
  return first === undefined ? null : positionAt(angleDeg, power, wind, first).y;
}

/** Points of a landing point `distanceToCentre` metres from the centre: 100 / 60 / 30 / 0. */
export function shotPoints(distanceToCentre: number): number {
  const d = Math.abs(distanceToCentre);
  return SHOT_BANDS.find((band) => d <= band.within)?.points ?? 0;
}

export const wallDistance = (target: Pick<Target, 'distance'>) => target.distance / 2;

/** The whole shot on a target: where it stops (landing point or wall) and the points of its band. */
export function resolveShot(target: Target, angle: number, power: number): Shot {
  if (target.wall !== null) {
    const x = wallDistance(target);
    for (const t of timesAt(angle, power, target.wind, x)) {
      if (positionAt(angle, power, target.wind, t).y < target.wall) return { angle, power, landing: x, blocked: true, airTime: t, points: 0 };
    }
  }
  const at = landing(angle, power, target.wind);
  return { angle, power, landing: at, blocked: false, airTime: flightTime(angle, power), points: shotPoints(at - target.distance) };
}

export const ANGLES: readonly number[] = Array.from({ length: (ANGLE_MAX - ANGLE_MIN) / ANGLE_STEP + 1 }, (_, i) => ANGLE_MIN + i * ANGLE_STEP);
export const POWERS: readonly number[] = Array.from({ length: POWER_MAX - POWER_MIN + 1 }, (_, i) => POWER_MIN + i);

/** Every allowed setting that lands 2 m or less from the centre (over the wall). */
export function perfectSettings(target: Target): { angle: number; power: number }[] {
  const out: { angle: number; power: number }[] = [];
  for (const angle of ANGLES) for (const power of POWERS) if (resolveShot(target, angle, power).points === SHOT_BANDS[0].points) out.push({ angle, power });
  return out;
}

export const solvable = (target: Target) => perfectSettings(target).length > 0;

export function fallbackTarget(index: number): Target {
  return { distance: FALLBACK_DISTANCE, wind: 0, wall: index >= WALL_FROM_TARGET ? FALLBACK_WALL : null };
}

/**
 * The seeded target number `index` (1..6): bounded draws until one can be hit at 2 m or less, else the fallback.
 * `rejected` counts the draws thrown away (for the balance report).
 */
export function generateTarget(rngState: number, index: number): { target: Target; rngState: number; rejected: number; fallback: boolean } {
  const rng = createRng(rngState);
  for (let attempt = 0; attempt < GENERATOR_ATTEMPTS; attempt++) {
    const distance = DISTANCE_MIN + rng.int(DISTANCE_MAX - DISTANCE_MIN + 1);
    const strength = 1 + rng.int(WIND_MAX);
    const wind = index >= WIND_FROM_TARGET ? (rng.int(2) === 0 ? -strength : strength) : 0;
    const wall = index >= WALL_FROM_TARGET ? WALL_MIN + rng.int(WALL_MAX - WALL_MIN + 1) : null;
    const target: Target = { distance, wind, wall };
    if (solvable(target)) return { target, rngState: rng.state(), rejected: attempt, fallback: false };
  }
  return { target: fallbackTarget(index), rngState: rng.state(), rejected: GENERATOR_ATTEMPTS, fallback: true };
}

type Carried = Pick<ShotState, 'score' | 'combos' | 'angle' | 'power' | 'sight' | 'rngState'>;

function startTarget(state: Carried, index: number): ShotState {
  const { target, rngState } = generateTarget(state.rngState, index);
  return {
    score: state.score,
    combos: state.combos,
    status: 'playing',
    events: [],
    ...target,
    target: index,
    angle: state.angle,
    power: state.power,
    shotsLeft: SHOTS_PER_TARGET,
    flight: null,
    flightMs: 0,
    last: null,
    doneMs: 0,
    sight: state.sight,
    rngState,
  };
}

export function createShot(seed: number, upgrades: UpgradeLevels = {}): ShotState {
  const level = Math.max(0, Math.min(SIGHT_SHARES.length - 1, upgrades.sight ?? 0));
  return startTarget({ score: 0, combos: 0, angle: START_ANGLE, power: START_POWER, sight: SIGHT_SHARES[level], rngState: seed >>> 0 }, 1);
}

/** True when a setting or a shot is taken now (no flight, no finished target on show). */
export function acceptsInput(state: Pick<ShotState, 'status' | 'flightMs' | 'doneMs'>): boolean {
  return state.status === 'playing' && state.flightMs <= 0 && state.doneMs <= 0;
}

/** True once the target is over (a shot scored or no shot is left) and its last flight has ended. */
export function targetFinished(state: Pick<ShotState, 'last' | 'shotsLeft' | 'flight'>): boolean {
  return state.flight === null && state.last !== null && (state.last.points > 0 || state.shotsLeft <= 0);
}

function nextTarget(state: ShotState): ShotState {
  if (state.target >= SHOT_TARGETS) return { ...state, flightMs: 0, doneMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
  const next = startTarget(state, state.target + 1);
  return { ...next, events: [{ kind: 'target', target: next.target }] };
}

/** The flight ended: the shot scores, and the target is over when it scored or was the last one. */
function land(state: ShotState, shot: Shot): ShotState {
  const rank = SHOTS_PER_TARGET - state.shotsLeft;
  const bonus = shot.points > 0 ? SHOT_BONUS[rank - 1] : 0;
  const events: ShotState['events'][number][] = [{ kind: 'landed', landing: shot.landing, blocked: shot.blocked, points: shot.points, bonus }];
  const base: ShotState = { ...state, flight: null, flightMs: 0, last: shot };
  if (shot.points > 0) {
    const points = shot.points + bonus;
    events.push({ kind: 'score', points });
    let combos = state.combos;
    if (shot.points >= COMBO_POINTS) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
    events.push({ kind: 'done', target: state.target, points });
    return { ...base, score: state.score + points, combos, doneMs: TARGET_SHOW_MS, events };
  }
  if (state.shotsLeft <= 0) {
    events.push({ kind: 'done', target: state.target, points: 0 });
    return { ...base, doneMs: TARGET_SHOW_MS, events };
  }
  return { ...base, events };
}

export function reduceShot(state: ShotState, action: ShotAction): ShotState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    if (!(action.dt > 0) || (state.flightMs <= 0 && state.doneMs <= 0)) return state.events.length === 0 ? state : { ...state, events: [] };
    if (state.flight !== null) {
      const flightMs = Math.max(0, state.flightMs - action.dt);
      return flightMs > 0 ? { ...state, flightMs, events: [] } : land(state, state.flight);
    }
    const doneMs = Math.max(0, state.doneMs - action.dt);
    return doneMs > 0 ? { ...state, doneMs, events: [] } : nextTarget(state);
  }

  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'fire') {
    const flight = resolveShot(state, state.angle, state.power);
    return { ...state, flight, flightMs: FLIGHT_MS, shotsLeft: state.shotsLeft - 1, events: [{ kind: 'fire', angle: state.angle, power: state.power }] };
  }

  if (action.step !== 1 && action.step !== -1) return { ...state, events: [] };
  const angle = action.type === 'angle' ? Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, state.angle + action.step * ANGLE_STEP)) : state.angle;
  const power = action.type === 'power' ? Math.max(POWER_MIN, Math.min(POWER_MAX, state.power + action.step)) : state.power;
  if (angle === state.angle && power === state.power) return { ...state, events: [{ kind: 'ignored' }] };
  return { ...state, angle, power, events: [{ kind: 'aim', angle, power }] };
}
