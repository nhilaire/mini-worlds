// « Armée de Poche » (docs/PRD.md "Armée de Poche"): the army walks down a road of 10 pairs of gates and picks one
// gate of each pair; each gate adds, removes, doubles or halves the soldiers. After the 10th pair a fort with D
// defenders waits: more soldiers than D wins the run. Pure reducer; the 500 ms walk through a gate (input guard) is
// an engine counter advanced by `tick`; randomness (the gates) comes from the seeded generator kept in the state.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng, Rng } from '../rng';

export const BASE_SOLDIERS = 10;
export const RECRUITS_PER_LEVEL = 5;
export const PAIRS_PER_RUN = 10;
export const MAX_RUNS = 8;
export const RUN_POINTS = 100;
export const MARGIN_POINTS = 5; // per soldier above the defenders
export const MAX_MARGIN_POINTS = 200;
/** The army walks through the chosen gate this long; taps are ignored meanwhile (input guard). */
export const WALK_MS = 500;
/** Seeded attempts at drawing a run whose best count reaches the start count, before the fallback run. */
export const RUN_ATTEMPTS = 50;

export type GateOp = 'add' | 'sub' | 'mul' | 'div';
/** `n` is the operand: the soldiers added or removed, 2 for × 2 and ÷ 2. */
export type Gate = { op: GateOp; n: number };
export type GatePair = readonly [Gate, Gate];
export type Side = 'left' | 'right';

export type FortResult = { run: number; won: boolean; army: number; defenders: number; points: number };

export type ArmyEvent =
  | BaseEvent
  /** The army went through the gate of `side`: `from` → `to` soldiers. */
  | { kind: 'gate'; side: Side; from: number; to: number }
  /** The fight at the fort of the run. */
  | ({ kind: 'fort' } & FortResult)
  /** A new run starts. */
  | { kind: 'run'; run: number }
  /** A tap during the walk: ignored. */
  | { kind: 'ignored' };

export type ArmyState = RoundState<ArmyEvent> & {
  /** Soldiers at the start of every run (10 + 5 per « Recrues » level). */
  start: number;
  /** Current run, from 1 to 8. */
  run: number;
  /** Index of the next pair of gates, 0-9. */
  pair: number;
  army: number;
  pairs: readonly GatePair[];
  /** Count reached by always taking the better gate (greedy, optimal: every operation is monotone). */
  best: number;
  /** Defenders of the fort of this run: floor(f × best). */
  defenders: number;
  /** Time left of the walk through the last gate (ms); taps are ignored meanwhile. */
  walkMs: number;
  /** Outcome of the last fort, kept for the screen until the next gate. */
  lastFort: FortResult | null;
  rngState: number;
};

export type ArmyAction = { type: 'choose'; side: Side } | { type: 'tick'; dt: number };

export function applyGate(gate: Gate, soldiers: number): number {
  switch (gate.op) {
    case 'add':
      return soldiers + gate.n;
    case 'sub':
      return Math.max(0, soldiers - gate.n);
    case 'mul':
      return soldiers * 2;
    case 'div':
      return Math.floor(soldiers / 2);
  }
}

export function isMultiplicative(gate: Gate): boolean {
  return gate.op === 'mul' || gate.op === 'div';
}

/** f of the fort: 0.25 / 0.3 / 0.35 / 0.4 for runs 1-4, then 0.45 (PRD amended after the casual bot test). */
export function fortFactor(run: number): number {
  return [0.25, 0.3, 0.35, 0.4][run - 1] ?? 0.45;
}

/** Ranges of run r: +n with n in [2, 4 + 2r], −n with n in [1, 2 + r]. */
export function addRange(run: number): [number, number] {
  return [2, 4 + 2 * run];
}
export function subRange(run: number): [number, number] {
  return [1, 2 + run];
}

/**
 * One gate: +n 45 %, −n 25 %, × 2 15 %, ÷ 2 15 %. When the pair already holds a × 2 or ÷ 2 gate, the roll is drawn
 * again among +n / −n only (same 45 : 25 ratio) - the simplest reading of « a pair holds at most one × 2 or ÷ 2 ».
 */
function rollGate(rng: Rng, run: number, allowMultiplicative: boolean): Gate {
  const p = rng.next() * (allowMultiplicative ? 1 : 0.7);
  if (p < 0.45) {
    const [lo, hi] = addRange(run);
    return { op: 'add', n: lo + rng.int(hi - lo + 1) };
  }
  if (p < 0.7) {
    const [lo, hi] = subRange(run);
    return { op: 'sub', n: lo + rng.int(hi - lo + 1) };
  }
  return { op: p < 0.85 ? 'mul' : 'div', n: 2 };
}

function rollPair(rng: Rng, run: number): GatePair {
  const first = rollGate(rng, run, true);
  const second = rollGate(rng, run, !isMultiplicative(first));
  // Seeded side, so that the × 2 / ÷ 2 gate is not always on the left.
  return rng.int(2) === 0 ? [first, second] : [second, first];
}

/** The count reached by always taking the better gate of each pair. */
export function bestCount(pairs: readonly GatePair[], start: number): number {
  let soldiers = start;
  for (const [a, b] of pairs) soldiers = Math.max(applyGate(a, soldiers), applyGate(b, soldiers));
  return soldiers;
}

/** Fallback run (never needed in practice, see the tests): +2 or −1 ten times, best = start + 20. */
function fallbackPairs(): GatePair[] {
  return Array.from({ length: PAIRS_PER_RUN }, () => [{ op: 'add', n: 2 } as Gate, { op: 'sub', n: 1 } as Gate] as const);
}

/** Pairs of run `run`, drawn again (seeded, bounded) while the best count stays below the start count. */
export function generateRun(run: number, start: number, rngState: number): { pairs: GatePair[]; best: number; rngState: number; attempts: number } {
  const rng = createRng(rngState);
  for (let attempt = 1; attempt <= RUN_ATTEMPTS; attempt++) {
    const pairs = Array.from({ length: PAIRS_PER_RUN }, () => rollPair(rng, run));
    const best = bestCount(pairs, start);
    if (best >= start) return { pairs, best, rngState: rng.state(), attempts: attempt };
  }
  const pairs = fallbackPairs();
  return { pairs, best: bestCount(pairs, start), rngState: rng.state(), attempts: RUN_ATTEMPTS + 1 };
}

function startRun(run: number, start: number, rngState: number): Pick<ArmyState, 'run' | 'pair' | 'army' | 'pairs' | 'best' | 'defenders' | 'rngState'> {
  const drawn = generateRun(run, start, rngState);
  return { run, pair: 0, army: start, pairs: drawn.pairs, best: drawn.best, defenders: Math.floor(fortFactor(run) * drawn.best), rngState: drawn.rngState };
}

/** Points of a won fort: 100 + min(200, 5 × (army − D)). */
export function fortPoints(army: number, defenders: number): number {
  return RUN_POINTS + Math.min(MAX_MARGIN_POINTS, MARGIN_POINTS * (army - defenders));
}

export function createArmy(seed: number, upgrades: UpgradeLevels = {}): ArmyState {
  const start = BASE_SOLDIERS + RECRUITS_PER_LEVEL * (upgrades.recruits ?? 0);
  return { score: 0, combos: 0, status: 'playing', events: [], start, walkMs: 0, lastFort: null, ...startRun(1, start, seed >>> 0) };
}

function choose(state: ArmyState, side: Side): ArmyState {
  if (state.walkMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  const gate = state.pairs[state.pair][side === 'left' ? 0 : 1];
  const army = applyGate(gate, state.army);
  const pair = state.pair + 1;
  const gateEvent: ArmyEvent = { kind: 'gate', side, from: state.army, to: army };
  if (pair < PAIRS_PER_RUN) return { ...state, army, pair, walkMs: WALK_MS, lastFort: null, events: [gateEvent] };

  // The fort at the end of the road.
  const won = army > state.defenders;
  const points = won ? fortPoints(army, state.defenders) : 0;
  const fort: FortResult = { run: state.run, won, army, defenders: state.defenders, points };
  const fortEvent: ArmyEvent = { kind: 'fort', ...fort };
  if (!won) {
    return { ...state, army, pair, walkMs: WALK_MS, lastFort: fort, status: 'over', events: [gateEvent, fortEvent, { kind: 'over', score: state.score }] };
  }
  const score = state.score + points;
  const combos = state.combos + 1;
  const scored: ArmyEvent[] = [gateEvent, fortEvent, { kind: 'score', points }, { kind: 'combo' }];
  if (state.run >= MAX_RUNS) {
    return { ...state, army, pair, walkMs: WALK_MS, lastFort: fort, score, combos, status: 'over', events: [...scored, { kind: 'over', score }] };
  }
  const next = startRun(state.run + 1, state.start, state.rngState);
  return { ...state, ...next, walkMs: WALK_MS, lastFort: fort, score, combos, events: [...scored, { kind: 'run', run: next.run }] };
}

export function reduceArmy(state: ArmyState, action: ArmyAction): ArmyState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick':
      if (action.dt <= 0 || state.walkMs <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      return { ...state, walkMs: Math.max(0, state.walkMs - action.dt), events: [] };
    case 'choose':
      return choose(state, action.side);
  }
}

/** Label of a gate on its button: +7, −3, ×2, ÷2. */
export function gateLabel(gate: Gate): string {
  switch (gate.op) {
    case 'add':
      return `+${gate.n}`;
    case 'sub':
      return `−${gate.n}`;
    case 'mul':
      return '×2';
    case 'div':
      return '÷2';
  }
}
