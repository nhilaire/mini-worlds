// « Lancer de Cible » (docs/PRD.md "Lancer de Cible"): a round target turns; a tap throws a dart that lands at the
// bottom point of the target 120 ms later. A dart landing too close to another one bounces off and costs a life.
// Pure reducer; time comes in through `tick` (elapsed ms), randomness (the darts already planted on each target)
// through the seeded generator kept in the state.
//
// Angles are in degrees. A dart's angle is in the target frame; its angle on screen is (dart + rotation) mod 360,
// measured from the bottom point, positive = clockwise on screen. The landing point is the bottom (screen angle 0), so
// a dart landing when the target is at `rotation` sticks at target angle (−rotation) mod 360. The rotation is not
// stored: it is a pure function of the time the level has been turning (`rotationAt`), reversals included.
import { angularDistance, normalize } from '../candles/engine';
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const MAX_LEVEL = 8;
export const LIVES = 3;
export const BASE_DARTS = 4; // level k needs 4 + k darts
export const MAX_PRESET = 4;
export const PRESET_GAP = 30; // ° between the darts already planted
export const BASE_SPIN = 90; // °/s on level 1
export const SPIN_STEP = 15; // °/s more per level
export const REVERSE_FROM_LEVEL = 5;
export const REVERSE_MS = 2000;
export const FLIGHT_MS = 120;
export const BOUNCE_ANGLE = 12; // ° in the target frame: closer than this, the dart bounces off
export const STEADY_PER_LEVEL = 1; // ° less per « Main sûre » level
export const DART_POINTS = 10;
export const LEVEL_POINTS = 50;
/** After a level is cleared, the next target appears after this long; taps are ignored meanwhile. */
export const LEVEL_PAUSE_MS = 600;
/** Every dart stuck and every level cleared: 680 + 400. */
export const MAX_SCORE = Array.from({ length: MAX_LEVEL }, (_, i) => dartsNeeded(i + 1) * DART_POINTS + LEVEL_POINTS).reduce((a, b) => a + b, 0);

export type Dart = { angle: number; preset: boolean };

export type DartsEvent =
  | BaseEvent
  /** A dart left the hand; it lands 120 ms later. */
  | { kind: 'throw' }
  /** The dart stuck at `angle` (target frame). */
  | { kind: 'stick'; angle: number }
  /** The dart landed at `angle`, too close to another one: it bounced off and a life is lost. */
  | { kind: 'bounce'; angle: number }
  /** The level was cleared; the next one is `level`. */
  | { kind: 'level'; level: number }
  /** A tap during a flight or before the next target appears: ignored. */
  | { kind: 'ignored' };

export type DartsState = RoundState<DartsEvent> & {
  /** Current level, from 1 to 8. */
  level: number;
  /** Time the target of this level has been turning (ms); the rotation follows from it (`rotationAt`). */
  levelMs: number;
  darts: readonly Dart[];
  /** Darts stuck into the current target (the ones already planted excluded). */
  stuck: number;
  lives: number;
  /** A life was lost in the current level (no combo when it is cleared). */
  lostInLevel: boolean;
  /** Time left before the dart in flight lands (ms); 0 when no dart is flying. */
  flightMs: number;
  /** Time left before the next target appears (ms); taps are ignored and the target stands still meanwhile. */
  pauseMs: number;
  steadyLevel: number;
  rngState: number;
};

export type DartsAction = { type: 'throw' } | { type: 'tick'; dt: number };

/** Darts to stick into the target of level k: 4 + k. */
export function dartsNeeded(level: number): number {
  return BASE_DARTS + level;
}

export function presetCount(level: number): number {
  return Math.min(level - 1, MAX_PRESET);
}

/** Rotation speed in °/s: 90 + 15 × (k − 1). */
export function spinSpeed(level: number): number {
  return BASE_SPIN + SPIN_STEP * (level - 1);
}

/** +1 clockwise (odd levels), −1 anticlockwise (even levels): the direction a level starts with. */
export function spinDirection(level: number): 1 | -1 {
  return level % 2 === 1 ? 1 : -1;
}

/** Direction at `levelMs`: from level 5 it reverses every 2 000 ms. */
export function directionAt(level: number, levelMs: number): 1 | -1 {
  const start = spinDirection(level);
  if (level < REVERSE_FROM_LEVEL) return start;
  return Math.floor(levelMs / REVERSE_MS) % 2 === 0 ? start : (-start as 1 | -1);
}

/**
 * Rotation of the target in degrees, in [0, 360), after `levelMs` of turning. Before level 5 it grows steadily; from
 * level 5 it swings: 2 000 ms one way, 2 000 ms back to where it started.
 */
export function rotationAt(level: number, levelMs: number): number {
  const perMs = (spinDirection(level) * spinSpeed(level)) / 1000;
  if (level < REVERSE_FROM_LEVEL) return normalize(perMs * levelMs);
  const leg = Math.floor(levelMs / REVERSE_MS);
  const into = levelMs - leg * REVERSE_MS;
  return normalize(perMs * (leg % 2 === 0 ? into : REVERSE_MS - into));
}

/** Bounce angle in degrees: 12 without « Main sûre », 11 / 10 / 9 with it. */
export function bounceAngle(steadyLevel: number): number {
  return BOUNCE_ANGLE - STEADY_PER_LEVEL * steadyLevel;
}

export function rotationOf(state: DartsState): number {
  return rotationAt(state.level, state.levelMs);
}

/** Darts left to stick into the current target. */
export function dartsLeft(state: DartsState): number {
  return dartsNeeded(state.level) - state.stuck;
}

/** Seeded darts already planted on the target of level k, whole degrees, pairwise at least 30° apart. */
function presetDarts(level: number, rngState: number): { darts: Dart[]; rngState: number } {
  const rng = createRng(rngState);
  const count = presetCount(level);
  const angles: number[] = [];
  let attempts = 0;
  while (angles.length < count && attempts < 1000) {
    attempts += 1;
    const a = rng.int(360);
    if (angles.every((b) => angularDistance(a, b) >= PRESET_GAP)) angles.push(a);
  }
  // Never reached in practice (4 darts need only 120° of 360°): evenly spaced fallback keeps the rule.
  while (angles.length < count) angles.push(normalize((angles.length * 360) / count + 45));
  return { darts: angles.map((angle) => ({ angle, preset: true })), rngState: rng.state() };
}

function startLevel(level: number, rngState: number): Pick<DartsState, 'level' | 'levelMs' | 'darts' | 'stuck' | 'lostInLevel' | 'rngState'> {
  const preset = presetDarts(level, rngState);
  // Every target starts at rotation 0 (the PRD does not carry the angle over between levels).
  return { level, levelMs: 0, darts: preset.darts, stuck: 0, lostInLevel: false, rngState: preset.rngState };
}

export function createDarts(seed: number, upgrades: UpgradeLevels = {}): DartsState {
  return { score: 0, combos: 0, status: 'playing', events: [], lives: LIVES, flightMs: 0, pauseMs: 0, steadyLevel: upgrades.steady ?? 0, ...startLevel(1, seed >>> 0) };
}

type Events = DartsState['events'];

/** The flight just ended: the dart sticks or bounces at the angle under the bottom point now. */
function land(state: DartsState, events: Events): DartsState {
  const angle = normalize(360 - rotationOf(state));
  if (state.darts.some((d) => angularDistance(d.angle, angle) < bounceAngle(state.steadyLevel))) {
    const lives = state.lives - 1;
    const bounced: DartsState = { ...state, lives, lostInLevel: true, events: [...events, { kind: 'bounce', angle }] };
    return lives > 0 ? bounced : { ...bounced, status: 'over', events: [...bounced.events, { kind: 'over', score: state.score }] };
  }
  const stuck = state.stuck + 1;
  const darts = [...state.darts, { angle, preset: false }];
  if (stuck < dartsNeeded(state.level)) {
    return { ...state, darts, stuck, score: state.score + DART_POINTS, events: [...events, { kind: 'stick', angle }, { kind: 'score', points: DART_POINTS }] };
  }
  const score = state.score + DART_POINTS + LEVEL_POINTS;
  const clean = !state.lostInLevel;
  const combos = state.combos + (clean ? 1 : 0);
  const cleared: Events = [...events, { kind: 'stick', angle }, { kind: 'score', points: DART_POINTS + LEVEL_POINTS }, ...(clean ? [{ kind: 'combo' } as const] : [])];
  if (state.level >= MAX_LEVEL) {
    return { ...state, darts, stuck, score, combos, status: 'over', events: [...cleared, { kind: 'over', score }] };
  }
  const next = state.level + 1;
  return { ...state, ...startLevel(next, state.rngState), score, combos, pauseMs: LEVEL_PAUSE_MS, events: [...cleared, { kind: 'level', level: next }] };
}

/** Advances the time: the pause first, then the flight up to its exact end (landing), then the plain turning. */
function tick(state: DartsState, dt: number): DartsState {
  let s: DartsState = { ...state, events: [] };
  let left = dt;
  while (left > 0 && s.status === 'playing') {
    if (s.pauseMs > 0) {
      const used = Math.min(left, s.pauseMs);
      s = { ...s, pauseMs: used === s.pauseMs ? 0 : s.pauseMs - used }; // the next target is not there yet
      left -= used;
    } else if (s.flightMs > 0) {
      const used = Math.min(left, s.flightMs);
      const landed = used === s.flightMs;
      s = { ...s, levelMs: s.levelMs + used, flightMs: landed ? 0 : s.flightMs - used };
      left -= used;
      if (landed) s = land(s, s.events);
    } else {
      s = { ...s, levelMs: s.levelMs + left };
      left = 0;
    }
  }
  return s;
}

export function reduceDarts(state: DartsState, action: DartsAction): DartsState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick':
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      return tick(state, action.dt);
    case 'throw':
      // Input guard: one dart in flight at a time, none before the next target appears.
      if (state.flightMs > 0 || state.pauseMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
      return { ...state, flightMs: FLIGHT_MS, events: [{ kind: 'throw' }] };
  }
}
