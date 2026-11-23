// « Couleur Éclair » (docs/PRD.md "Couleur Éclair"): a runner of one of 3 colours on a road of 3 lanes; gates come
// one after another, each with 3 doors holding the 3 colours in a seeded order. When a gate reaches the runner
// (`approachMs`, advanced by `tick`), the door of its lane must have its colour: +10 and the streak grows, else a
// life (or a « Bouclier » shield) is lost and the streak is reset. A `steer` sets the lane, any number of times.
// After gates 4, 8, 12... the runner takes another colour. The round ends only at the 3rd life lost (v0.4.0 phone
// test: no gate limit). Pure reducer; randomness comes from the seeded generator.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const LIVES = 3;
export const DOOR_POINTS = 10;
/** A combo every 5th right door in a row. */
export const COMBO_EVERY = 5;
/** The runner takes a new colour after every 4th gate. */
export const COLOUR_EVERY = 4;
/** Approach time of gate n (1-based): 2 200 − 30 × (n − 1) ms up to gate 44, then max(600, 910 − 5 × (n − 44)) ms. */
export const APPROACH_FIRST_MS = 2200;
export const APPROACH_STEP_MS = 30;
export const APPROACH_SLOW_UNTIL = 44;
export const APPROACH_LATE_STEP_MS = 5;
export const APPROACH_MIN_MS = 600;

export const LANES = ['left', 'middle', 'right'] as const;
export type Lane = (typeof LANES)[number];
/** Each colour has its own shape on the screen: red round, blue square, yellow triangle. */
export const COLOURS = ['red', 'blue', 'yellow'] as const;
export type Colour = (typeof COLOURS)[number];
/** The doors of a gate, from the left lane to the right lane: the 3 colours once each. */
export type Doors = readonly [Colour, Colour, Colour];
export const START_LANE: Lane = 'middle';

/** What happened at a gate. `shielded`: a wrong door paid by a shield instead of a life. */
export type DoorResult = { gate: number; lane: Lane; door: Colour; colour: Colour; ok: boolean; shielded: boolean };

export type DashEvent =
  | BaseEvent
  /** Gate `gate` reached the runner, who went through the door of `lane`. */
  | ({ kind: 'door' } & DoorResult)
  /** The runner moved to `lane`. */
  | { kind: 'lane'; lane: Lane }
  /** The runner took a new colour (after every 4th gate). */
  | { kind: 'colour'; colour: Colour };

export type DashState = RoundState<DashEvent> & {
  lives: number;
  /** Wrong doors that still cost no life (« Bouclier »: 1 / 2 / 3 per round). */
  shields: number;
  /** Gates passed so far; the gate on its way is gate `passed + 1`. */
  passed: number;
  /** Lane of the runner, kept from gate to gate. */
  lane: Lane;
  colour: Colour;
  /** Doors of the gate on its way. */
  doors: Doors;
  /** Time left before the gate reaches the runner (ms). */
  approachMs: number;
  /** Right doors in a row. */
  streak: number;
  /** Outcome of the last gate, kept for the screen until the next one. */
  last: DoorResult | null;
  rngState: number;
};

export type DashAction = { type: 'steer'; lane: Lane } | { type: 'tick'; dt: number };

/** Approach time of gate n (1-based): 2 200 ms at gate 1, 30 ms less per gate up to gate 44 (910 ms), then 5 ms less
 * per gate, never below 600 ms (gate 106 on). */
export function approachTime(gate: number): number {
  const n = Math.max(1, gate);
  if (n <= APPROACH_SLOW_UNTIL) return APPROACH_FIRST_MS - APPROACH_STEP_MS * (n - 1);
  const atSlowEnd = APPROACH_FIRST_MS - APPROACH_STEP_MS * (APPROACH_SLOW_UNTIL - 1);
  return Math.max(APPROACH_MIN_MS, atSlowEnd - APPROACH_LATE_STEP_MS * (n - APPROACH_SLOW_UNTIL));
}

/** Doors of one gate: the 3 colours in a seeded order. */
export function drawDoors(rngState: number): { doors: Doors; rngState: number } {
  const rng = createRng(rngState);
  const [a, b, c] = rng.shuffle(COLOURS);
  return { doors: [a, b, c], rngState: rng.state() };
}

/** The new colour of the runner: seeded, one of the two other colours. */
export function drawColour(current: Colour, rngState: number): { colour: Colour; rngState: number } {
  const rng = createRng(rngState);
  const colour = rng.pick(COLOURS.filter((c) => c !== current));
  return { colour, rngState: rng.state() };
}

/** The lane whose door has the runner's colour. */
export function colourLane(state: Pick<DashState, 'doors' | 'colour'>): Lane {
  return LANES[state.doors.indexOf(state.colour)];
}

export function createDash(seed: number, upgrades: UpgradeLevels = {}): DashState {
  const rng = createRng(seed >>> 0);
  const colour = rng.pick(COLOURS);
  const first = drawDoors(rng.state());
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    lives: LIVES,
    shields: upgrades.guard ?? 0,
    passed: 0,
    lane: START_LANE,
    colour,
    doors: first.doors,
    approachMs: approachTime(1),
    streak: 0,
    last: null,
    rngState: first.rngState,
  };
}

/** The gate reaches the runner, who goes through the door of its lane; the next approach starts at once. */
function passDoor(state: DashState): DashState {
  const gate = state.passed + 1;
  const door = state.doors[LANES.indexOf(state.lane)];
  const ok = door === state.colour;
  const shielded = !ok && state.shields > 0;
  const result: DoorResult = { gate, lane: state.lane, door, colour: state.colour, ok, shielded };
  const events: DashEvent[] = [{ kind: 'door', ...result }];

  let { score, combos, lives, shields } = state;
  let streak = 0;
  if (ok) {
    score += DOOR_POINTS;
    streak = state.streak + 1;
    events.push({ kind: 'score', points: DOOR_POINTS });
    if (streak % COMBO_EVERY === 0) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
  } else if (shielded) shields -= 1;
  else lives -= 1;

  const after = { ...state, score, combos, lives, shields, streak, passed: gate, last: result };
  if (lives <= 0) {
    return { ...after, approachMs: 0, status: 'over', events: [...events, { kind: 'over', score }] };
  }

  // A new colour after gates 4, 8, 12..., shown from the start of the next approach.
  let { colour, rngState } = state;
  if (gate % COLOUR_EVERY === 0) {
    ({ colour, rngState } = drawColour(colour, rngState));
    events.push({ kind: 'colour', colour });
  }
  const next = drawDoors(rngState);
  return { ...after, colour, doors: next.doors, rngState: next.rngState, approachMs: approachTime(gate + 1), events };
}

export function reduceDash(state: DashState, action: DashAction): DashState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      const approachMs = state.approachMs - action.dt;
      return approachMs > 0 ? { ...state, approachMs, events: [] } : passDoor(state);
    }
    case 'steer':
      if (action.lane === state.lane) return state.events.length === 0 ? state : { ...state, events: [] };
      return { ...state, lane: action.lane, events: [{ kind: 'lane', lane: action.lane }] };
  }
}
