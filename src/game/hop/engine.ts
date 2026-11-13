// « Saute-Lapin » (docs/PRD.md "Saute-Lapin"): side-view runner, pure reducer. The bunny stands at x = 2 on the
// ground (y = 0); obstacles (fence, tall fence, hedge, bird) spawn at x = 12 and run left. Time comes in through `tick` (elapsed ms); randomness through
// the seeded generator kept in the state. Units: field units, seconds for the physics.
import type { BaseEvent, RoundState } from '../contract';
import { createRng } from '../rng';

export const FIELD_WIDTH = 12;
export const BUNNY_X = 2;
export const BUNNY_SIZE = 0.8;
export const SPAWN_X = 12;
export const OBSTACLE_WIDTH = 1;
export const LOW_HEIGHT = 1;
export const HIGH_HEIGHT = 1.5;
export const BASE_SPEED = 6;
export const SPEED_PER_PASS = 0.35;
export const MAX_SPEED = 15;
/** Birds (and the second kind table) appear once this many obstacles were passed. */
export const BIRDS_FROM_PASSED = 10;
export const JUMP_SPEED = 13.5;
export const GRAVITY = 36;
export const POINTS_PER_PASS = 10;
export const COMBO_EVERY = 5;
/** Physics sub-step (ms): long ticks are split so that a fence cannot slip between two collision checks. */
export const STEP_MS = 10;

export type ObstacleKind = 'fence' | 'tall' | 'hedge' | 'bird';
export type ObstacleShape = { width: number; bottom: number; height: number };

/** Size of each kind (units): fence 1 × 1, tall fence 1 × 1.5, hedge 2 × 1, bird 1 wide flying from 1.3 to 1.9. */
export const OBSTACLE_SHAPES: Record<ObstacleKind, ObstacleShape> = {
  fence: { width: 1, bottom: 0, height: LOW_HEIGHT },
  tall: { width: 1, bottom: 0, height: HIGH_HEIGHT },
  hedge: { width: 2, bottom: 0, height: 1 },
  bird: { width: 1, bottom: 1.3, height: 0.6 },
};

/** Cumulative kind table: before 10 passed 60 / 25 / 15 %, from 10 passed 40 / 20 / 20 / 20 %. */
const KINDS_EARLY: readonly [ObstacleKind, number][] = [['fence', 0.6], ['tall', 0.85], ['hedge', 1]];
const KINDS_LATE: readonly [ObstacleKind, number][] = [['fence', 0.4], ['tall', 0.6], ['hedge', 0.8], ['bird', 1]];

export type Obstacle = { id: number; kind: ObstacleKind; x: number } & ObstacleShape;

/** An obstacle of a kind with its left edge at `x`. */
export function makeObstacle(id: number, kind: ObstacleKind, x: number): Obstacle {
  return { id, kind, x, ...OBSTACLE_SHAPES[kind] };
}

/** The kind for a uniform roll in [0, 1) with `passed` obstacles passed so far. */
export function kindFor(roll: number, passed: number): ObstacleKind {
  const table = passed < BIRDS_FROM_PASSED ? KINDS_EARLY : KINDS_LATE;
  return (table.find(([, upTo]) => roll < upTo) ?? table[table.length - 1])[0];
}

export type HopEvent =
  | BaseEvent
  | { kind: 'jump' }
  | { kind: 'pass'; id: number; streak: number }
  | { kind: 'hit'; id: number; shieldsLeft: number };

export type HopState = RoundState<HopEvent> & {
  /** Bottom of the bunny's box (0 on the ground) and its vertical speed (units/s, up is positive). */
  y: number;
  vy: number;
  obstacles: readonly Obstacle[];
  /** Obstacles passed since the start of the round (speed rule). */
  passed: number;
  /** Obstacles passed in a row without a hit (combo rule). */
  streak: number;
  shields: number;
  /** Right edge of the last spawned obstacle; it keeps running left even when that obstacle was removed by a hit. */
  trail: number;
  /** Seeded gap (units) between `trail` and the next spawn. */
  nextGap: number;
  nextId: number;
  rngState: number;
  /** Active play time (ms) and the moment of the last hit (for the blink of the bunny). */
  timeMs: number;
  lastHitMs: number | null;
};

export type HopAction = { type: 'jump' } | { type: 'tick'; dt: number };

/** Run speed (units/s) after `passed` obstacles: 6 + 0.35 per obstacle, capped at 15. */
export function runSpeed(passed: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_PASS * passed);
}

/**
 * Range of the seeded spawn gap at a speed: [max(5, 0.8 × speed), max(10, 1.8 × speed)] (at least 0.8 s between two
 * obstacles, longer than one jump of 0.75 s; up to 1.8 s so that distances vary).
 */
export function gapRange(speed: number): { min: number; max: number } {
  return { min: Math.max(5, 0.8 * speed), max: Math.max(10, 1.8 * speed) };
}

/** One draw per spawn: the obstacle kind (table of `passed`) and the gap after it (range of `speed`). */
function drawSpawn(rngState: number, speed: number, passed: number): { kind: ObstacleKind; gap: number; rngState: number } {
  const rng = createRng(rngState);
  const kind = kindFor(rng.next(), passed);
  const { min, max } = gapRange(speed);
  const gap = min + rng.next() * (max - min);
  return { kind, gap, rngState: rng.state() };
}

export function createHop(seed: number, upgrades: { shield?: number } = {}): HopState {
  const first = drawSpawn(seed >>> 0, runSpeed(0), 0);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    y: 0,
    vy: 0,
    obstacles: [makeObstacle(0, first.kind, SPAWN_X)],
    passed: 0,
    streak: 0,
    shields: upgrades.shield ?? 0,
    trail: SPAWN_X + OBSTACLE_SHAPES[first.kind].width,
    nextGap: first.gap,
    nextId: 1,
    rngState: first.rngState,
    timeMs: 0,
    lastHitMs: null,
  };
}

export function onGround(state: HopState): boolean {
  return state.y <= 0 && state.vy === 0;
}

/** The bunny box [2, 2.8] × [y, y + 0.8] overlaps the obstacle box (touching edges do not count). */
export function overlaps(y: number, o: Obstacle): boolean {
  return o.x < BUNNY_X + BUNNY_SIZE && o.x + o.width > BUNNY_X && y < o.bottom + o.height && y + BUNNY_SIZE > o.bottom;
}

/** One physics sub-step of `ms` (≤ STEP_MS). Mutates the working copy `s` and pushes events. */
function step(s: HopState, ms: number, events: HopEvent[]): HopState {
  const dt = ms / 1000;
  const speed = runSpeed(s.passed);
  // Bunny: exact integration under constant gravity (apex and air time do not depend on the tick length).
  let y = s.y;
  let vy = s.vy;
  if (y > 0 || vy !== 0) {
    y = y + vy * dt - 0.5 * GRAVITY * dt * dt;
    vy = vy - GRAVITY * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
    }
  }
  // Obstacles run left; the spawn trail runs with them.
  let obstacles = s.obstacles.map((o) => ({ ...o, x: o.x - speed * dt }));
  let trail = s.trail - speed * dt;
  let { nextGap, nextId, rngState } = s;
  while (SPAWN_X - trail >= nextGap) {
    const x = trail + nextGap;
    const spawn = drawSpawn(rngState, speed, s.passed);
    obstacles.push(makeObstacle(nextId, spawn.kind, x));
    nextId += 1;
    trail = x + OBSTACLE_SHAPES[spawn.kind].width;
    nextGap = spawn.gap;
    rngState = spawn.rngState;
  }

  let { score, combos, passed, streak, shields, lastHitMs } = s;
  const timeMs = s.timeMs + ms;
  const kept: Obstacle[] = [];
  let over = false;
  for (const o of obstacles) {
    if (overlaps(y, o)) {
      if (shields > 0) {
        shields -= 1;
        streak = 0;
        lastHitMs = timeMs;
        events.push({ kind: 'hit', id: o.id, shieldsLeft: shields });
        continue; // the obstacle is removed, no points
      }
      over = true;
      kept.push(o);
      continue;
    }
    // Passed once its right edge is behind the bunny's left edge (ids grow left to right: each passes once,
    // because a passed fence is dropped from the list).
    if (o.x + o.width <= BUNNY_X) {
      passed += 1;
      streak += 1;
      score += POINTS_PER_PASS;
      events.push({ kind: 'pass', id: o.id, streak });
      events.push({ kind: 'score', points: POINTS_PER_PASS });
      if (streak % COMBO_EVERY === 0) {
        combos += 1;
        events.push({ kind: 'combo' });
      }
      continue;
    }
    kept.push(o);
  }
  obstacles = kept;
  const next: HopState = { ...s, y, vy, obstacles, trail, nextGap, nextId, rngState, score, combos, passed, streak, shields, timeMs, lastHitMs, events };
  if (over) {
    events.push({ kind: 'over', score });
    return { ...next, status: 'over' };
  }
  return next;
}

export function reduceHop(state: HopState, action: HopAction): HopState {
  if (state.status !== 'playing') return { ...state, events: [] };
  switch (action.type) {
    case 'jump': {
      // A tap in the air is ignored.
      if (!onGround(state)) return { ...state, events: [] };
      return { ...state, vy: JUMP_SPEED, events: [{ kind: 'jump' }] };
    }
    case 'tick': {
      const events: HopEvent[] = [];
      let current: HopState = { ...state, events };
      let remaining = Math.max(0, action.dt);
      while (remaining > 0 && current.status === 'playing') {
        const ms = Math.min(STEP_MS, remaining);
        current = step(current, ms, events);
        remaining -= ms;
      }
      return current;
    }
  }
}

/** The bunny blinks for this long after a hit (screen animation). */
export const HIT_BLINK_MS = 250;
