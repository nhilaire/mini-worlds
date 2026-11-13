// « Bougies Folles » (docs/PRD.md "Bougies Folles"): a cake turns at the centre; a tap plants a candle at the bottom
// point of its edge. Pure reducer; time comes in through `tick` (elapsed ms), randomness (the pre-placed candles of
// each cake) through the seeded generator kept in the state.
//
// Angles are in degrees. A candle's angle is in the cake frame; its angle on screen is (candle + rotation) mod 360,
// measured from the bottom point, positive = clockwise on screen. The throw point is the bottom (screen angle 0), so a
// candle thrown when the cake is at `rotation` lands at cake angle (−rotation) mod 360.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const BASE_SPIN = 90; // °/s
export const SPIN_GROWTH = 0.15; // per cake after the first
export const MAX_SPIN = 250; // °/s, before « Gâteau lent »
export const SLOW_PER_LEVEL = 0.08;
export const MIN_GAP = 14; // ° in the cake frame: closer than this ends the round
export const PRESET_GAP = 30; // ° between pre-placed candles
export const MAX_PRESET = 4;
export const BASE_CANDLES = 5;
export const MAX_CANDLES = 12;
export const CANDLE_POINTS = 10;
export const CAKE_POINTS = 100;
/** After a throw, taps are ignored this long (phone test: two quick taps lost the round on a double tap). */
export const THROW_COOLDOWN_MS = 250;
/** Between two cakes, the new cake waits this long, still, and taps are ignored (phone test). */
export const CAKE_PAUSE_MS = 1000;

export type Candle = { angle: number; preset: boolean };

export type CandlesEvent =
  | BaseEvent
  /** A candle was planted at `angle` (cake frame). */
  | { kind: 'plant'; angle: number }
  /** The thrown candle hit another one at `angle`: the round is over. */
  | { kind: 'hit'; angle: number }
  /** The cake was completed; the next one is `cake`. */
  | { kind: 'cake'; cake: number }
  /** A throw during the cooldown or the pause between cakes: ignored. */
  | { kind: 'ignored' };

export type CandlesState = RoundState<CandlesEvent> & {
  /** Current cake, from 1. */
  cake: number;
  /** Rotation of the cake in degrees, in [0, 360). */
  rotation: number;
  /** +1 clockwise (odd cakes), −1 counter-clockwise (even cakes). */
  dir: 1 | -1;
  candles: readonly Candle[];
  /** Candles thrown into the current cake (pre-placed ones excluded). */
  thrown: number;
  slowLevel: number;
  rngState: number;
  /** Time left before the next throw is accepted (ms). */
  cooldownMs: number;
  /** Time left of the pause before the new cake starts turning (ms); throws are ignored meanwhile. */
  pauseMs: number;
};

export type CandlesAction = { type: 'throw' } | { type: 'tick'; dt: number };

/** Candles to throw into cake n: 5 + n, at most 12. */
export function candlesNeeded(cake: number): number {
  return Math.min(MAX_CANDLES, BASE_CANDLES + cake);
}

export function presetCount(cake: number): number {
  return Math.min(cake - 1, MAX_PRESET);
}

/** Rotation speed in °/s: min(250, 90 × (1 + 0.15 × (n − 1))) × (1 − 0.08 × slow level). */
export function spinSpeed(cake: number, slowLevel: number): number {
  return Math.min(MAX_SPIN, BASE_SPIN * (1 + SPIN_GROWTH * (cake - 1))) * (1 - SLOW_PER_LEVEL * slowLevel);
}

export function spinDirection(cake: number): 1 | -1 {
  return cake % 2 === 1 ? 1 : -1;
}

export function normalize(angle: number): number {
  const a = angle % 360;
  return a < 0 ? a + 360 : a;
}

/** Shortest angular distance between two angles, in [0, 180]. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalize(a) - normalize(b));
  return Math.min(d, 360 - d);
}

/** Candles left to throw into the current cake. */
export function candlesLeft(state: CandlesState): number {
  return candlesNeeded(state.cake) - state.thrown;
}

/** Seeded pre-placed candles of cake n, whole degrees, pairwise at least 30° apart. */
function presetCandles(cake: number, rngState: number): { candles: Candle[]; rngState: number } {
  const rng = createRng(rngState);
  const count = presetCount(cake);
  const angles: number[] = [];
  let attempts = 0;
  while (angles.length < count && attempts < 1000) {
    attempts += 1;
    const a = rng.int(360);
    if (angles.every((b) => angularDistance(a, b) >= PRESET_GAP)) angles.push(a);
  }
  // Never reached in practice (4 candles need only 120° of 360°): evenly spaced fallback keeps the rule.
  while (angles.length < count) angles.push(normalize((angles.length * 360) / count + 45));
  return { candles: angles.map((angle) => ({ angle, preset: true })), rngState: rng.state() };
}

function startCake(cake: number, rngState: number): Pick<CandlesState, 'cake' | 'rotation' | 'dir' | 'candles' | 'thrown' | 'rngState'> {
  const preset = presetCandles(cake, rngState);
  // Every cake starts at rotation 0 (simplest reading: the PRD does not carry the angle over between cakes).
  return { cake, rotation: 0, dir: spinDirection(cake), candles: preset.candles, thrown: 0, rngState: preset.rngState };
}

export function createCandles(seed: number, upgrades: UpgradeLevels = {}): CandlesState {
  return { score: 0, combos: 0, status: 'playing', events: [], slowLevel: upgrades.slow_spin ?? 0, cooldownMs: 0, pauseMs: 0, ...startCake(1, seed >>> 0) };
}

function throwCandle(state: CandlesState): CandlesState {
  if (state.cooldownMs > 0 || state.pauseMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  const angle = normalize(-state.rotation);
  const hit = state.candles.find((c) => angularDistance(c.angle, angle) < MIN_GAP);
  if (hit) {
    return { ...state, status: 'over', events: [{ kind: 'hit', angle }, { kind: 'over', score: state.score }] };
  }
  const thrown = state.thrown + 1;
  const candles = [...state.candles, { angle, preset: false }];
  if (thrown < candlesNeeded(state.cake)) {
    return { ...state, candles, thrown, cooldownMs: THROW_COOLDOWN_MS, score: state.score + CANDLE_POINTS, events: [{ kind: 'plant', angle }, { kind: 'score', points: CANDLE_POINTS }] };
  }
  const points = CANDLE_POINTS + CAKE_POINTS;
  const next = state.cake + 1;
  return {
    ...state,
    ...startCake(next, state.rngState),
    cooldownMs: 0,
    pauseMs: CAKE_PAUSE_MS,
    score: state.score + points,
    combos: state.combos + 1,
    events: [{ kind: 'plant', angle }, { kind: 'cake', cake: next }, { kind: 'score', points }, { kind: 'combo' }],
  };
}

export function reduceCandles(state: CandlesState, action: CandlesAction): CandlesState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      const cooldownMs = Math.max(0, state.cooldownMs - action.dt);
      if (state.pauseMs > 0) return { ...state, cooldownMs, pauseMs: Math.max(0, state.pauseMs - action.dt), events: [] }; // the new cake waits, still
      const rotation = normalize(state.rotation + (state.dir * spinSpeed(state.cake, state.slowLevel) * action.dt) / 1000);
      return { ...state, rotation, cooldownMs, events: [] };
    }
    case 'throw':
      return throwCandle(state);
  }
}
