// « Tri de Billes » (docs/PRD.md "Tri de Billes"): tubes of 4 marbles, sort them so that every tube is empty or holds
// 4 marbles of one colour before the round timer runs out. Pure reducer; time comes in through `tick` (elapsed ms),
// randomness (the layout of each puzzle) through the seeded generator kept in the state.
//
// Tubes are arrays of colour indices (0..5), bottom first: the last element is the top marble.
import type { BaseEvent, RoundState, UpgradeLevels } from '../contract';
import { createRng, Rng } from '../rng';

export const TUBE_SIZE = 4;
export const EMPTY_TUBES = 2;
export const MAX_COLOURS = 6;
export const ROUND_MS = 90_000;
export const EXTRA_TIME_MS = 10_000; // per « Sablier » level
export const PUZZLE_BASE_POINTS = 100;
export const POINTS_PER_COLOUR = 20;
/** A puzzle sorted in less than this is a combo. */
export const COMBO_MS = 20_000;
/** A move animates this long; taps are ignored meanwhile (input guard). */
export const MOVE_GUARD_MS = 200;
/** Generation: seeded shuffles checked by the bounded solver, then the fallback. */
export const SOLVER_MAX_STATES = 20_000;
export const MAX_ATTEMPTS = 50;
/** Backward steps of the fallback layout. */
export const FALLBACK_STEPS = 60;

export type Tube = readonly number[];
export type Tubes = readonly Tube[];
export type Move = { from: number; to: number };

export type MarblesEvent =
  | BaseEvent
  /** A tube was selected (or `null`: the selection was cleared). */
  | { kind: 'select'; tube: number | null }
  /** `count` marbles moved from `from` onto `to`. */
  | { kind: 'move'; from: number; to: number; count: number }
  /** The tapped tube cannot take the selected marbles. */
  | { kind: 'refused'; from: number; to: number }
  /** Puzzle `puzzle` was sorted; the next one starts. */
  | { kind: 'solved'; puzzle: number; points: number }
  /** « Recommencer »: the puzzle went back to its start. */
  | { kind: 'restart' }
  /** A tap during the move animation: ignored. */
  | { kind: 'ignored' };

export type MarblesState = RoundState<MarblesEvent> & {
  /** Current puzzle, from 1. */
  puzzle: number;
  colours: number;
  tubes: Tubes;
  /** Layout of the current puzzle at its start (« Recommencer »). */
  start: Tubes;
  selected: number | null;
  timeLeftMs: number;
  /** Time spent on the current puzzle (combo under 20 s). */
  puzzleMs: number;
  /** Input guard left (ms) after a move. */
  guardMs: number;
  /** Layout changes on the current puzzle (moves and restarts): redraw key of the animations. */
  moves: number;
  rngState: number;
};

export type MarblesAction = { type: 'tick'; dt: number } | { type: 'tap'; tube: number } | { type: 'restart' };

/** Colours of puzzle n: 2 + n, at most 6. */
export function coloursOf(puzzle: number): number {
  return Math.min(MAX_COLOURS, 2 + puzzle);
}

export function puzzlePoints(colours: number): number {
  return PUZZLE_BASE_POINTS + POINTS_PER_COLOUR * colours;
}

export function roundMs(upgrades: UpgradeLevels): number {
  return ROUND_MS + EXTRA_TIME_MS * (upgrades.extra_time ?? 0);
}

const top = (tube: Tube): number | undefined => tube[tube.length - 1];

/** Length of the run of the top colour of a tube. */
export function topRun(tube: Tube): number {
  const c = top(tube);
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}

/** Each tube is empty or holds 4 marbles of one colour. */
export function isSorted(tubes: Tubes): boolean {
  return tubes.every((t) => t.length === 0 || (t.length === TUBE_SIZE && topRun(t) === TUBE_SIZE));
}

/** Marbles a move from → to carries (0 = illegal): the top run, as many as fit, onto an empty tube or the same colour. */
export function moveCount(tubes: Tubes, from: number, to: number): number {
  if (from === to) return 0;
  const a = tubes[from];
  const b = tubes[to];
  if (!a || !b || a.length === 0 || b.length >= TUBE_SIZE) return 0;
  if (b.length > 0 && top(b) !== top(a)) return 0;
  return Math.min(topRun(a), TUBE_SIZE - b.length);
}

export function applyMove(tubes: Tubes, from: number, to: number): Tubes {
  const count = moveCount(tubes, from, to);
  if (count === 0) return tubes;
  const moved = tubes[from].slice(tubes[from].length - count);
  return tubes.map((t, i) => (i === from ? t.slice(0, t.length - count) : i === to ? [...t, ...moved] : t));
}

/** A move that changes nothing useful: a tube holding one colour only, poured into an empty tube. */
export function isPointless(tubes: Tubes, from: number, to: number): boolean {
  return tubes[to].length === 0 && topRun(tubes[from]) === tubes[from].length;
}

/** Every legal move (pointless ones included). */
export function legalMoves(tubes: Tubes): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < tubes.length; from++) for (let to = 0; to < tubes.length; to++) if (moveCount(tubes, from, to) > 0) out.push({ from, to });
  return out;
}

const keyOf = (tubes: Tubes): string =>
  tubes
    .map((t) => t.join(''))
    .sort()
    .join('|');

/**
 * Depth-first solver bounded to `maxStates` visited layouts (tube order ignored). Returns a list of moves that sorts
 * the tubes, or null when none was found within the bound.
 */
export function solve(start: Tubes, maxStates = SOLVER_MAX_STATES): Move[] | null {
  const seen = new Set<string>();
  const path: Move[] = [];
  const dfs = (tubes: Tubes): boolean => {
    if (isSorted(tubes)) return true;
    const key = keyOf(tubes);
    if (seen.has(key) || seen.size >= maxStates) return false;
    seen.add(key);
    for (const m of legalMoves(tubes)) {
      if (isPointless(tubes, m.from, m.to)) continue;
      path.push(m);
      if (dfs(applyMove(tubes, m.from, m.to))) return true;
      path.pop();
    }
    return false;
  };
  return dfs(start) ? path : null;
}

function sortedLayout(colours: number): number[][] {
  const tubes: number[][] = [];
  for (let c = 0; c < colours; c++) tubes.push(Array.from({ length: TUBE_SIZE }, () => c));
  for (let i = 0; i < EMPTY_TUBES; i++) tubes.push([]);
  return tubes;
}

/**
 * Fallback layout: seeded legal moves played backwards from the sorted state. A backward step takes the top marble of
 * tube X (colour c) onto tube Y only when the forward move Y → X is legal and carries exactly that one marble back
 * (X left empty or with c on top, Y empty or with another colour on top), so replaying the steps in reverse sorts it.
 */
export function fallbackLayout(colours: number, rng: Rng): Tubes {
  let tubes: number[][] = sortedLayout(colours);
  for (let step = 0; step < FALLBACK_STEPS; step++) {
    const options: Move[] = [];
    for (let x = 0; x < tubes.length; x++) {
      const tx = tubes[x];
      if (tx.length === 0) continue;
      const c = tx[tx.length - 1];
      const rest = tx.length - 1;
      if (rest > 0 && tx[rest - 1] !== c) continue;
      for (let y = 0; y < tubes.length; y++) {
        const ty = tubes[y];
        if (y === x || ty.length >= TUBE_SIZE || (ty.length > 0 && ty[ty.length - 1] === c)) continue;
        options.push({ from: x, to: y });
      }
    }
    if (options.length === 0) break;
    const m = rng.pick(options);
    const marble = tubes[m.from][tubes[m.from].length - 1];
    tubes = tubes.map((t, i) => (i === m.from ? t.slice(0, -1) : i === m.to ? [...t, marble] : t));
  }
  if (isSorted(tubes)) {
    // Never left sorted: one marble of the first colour onto an empty tube (undone by the forward move back).
    const empty = tubes.findIndex((t) => t.length === 0);
    tubes = tubes.map((t, i) => (i === 0 ? t.slice(0, -1) : i === empty ? [0] : t));
  }
  return tubes;
}

/** Seeded shuffles checked by the bounded solver (at most 50), else the fallback. */
export function generatePuzzle(colours: number, rngState: number): { tubes: Tubes; rngState: number; fallback: boolean } {
  const rng = createRng(rngState);
  const marbles: number[] = [];
  for (let c = 0; c < colours; c++) for (let i = 0; i < TUBE_SIZE; i++) marbles.push(c);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shuffled = rng.shuffle(marbles);
    const tubes: number[][] = [];
    for (let c = 0; c < colours; c++) tubes.push(shuffled.slice(c * TUBE_SIZE, (c + 1) * TUBE_SIZE));
    for (let i = 0; i < EMPTY_TUBES; i++) tubes.push([]);
    if (!isSorted(tubes) && solve(tubes) !== null) return { tubes, rngState: rng.state(), fallback: false };
  }
  return { tubes: fallbackLayout(colours, rng), rngState: rng.state(), fallback: true };
}

function startPuzzle(puzzle: number, rngState: number): Pick<MarblesState, 'puzzle' | 'colours' | 'tubes' | 'start' | 'selected' | 'puzzleMs' | 'moves' | 'rngState'> {
  const colours = coloursOf(puzzle);
  const generated = generatePuzzle(colours, rngState);
  return { puzzle, colours, tubes: generated.tubes, start: generated.tubes, selected: null, puzzleMs: 0, moves: 0, rngState: generated.rngState };
}

export function createMarbles(seed: number, upgrades: UpgradeLevels = {}): MarblesState {
  return { score: 0, combos: 0, status: 'playing', events: [], timeLeftMs: roundMs(upgrades), guardMs: 0, ...startPuzzle(1, seed >>> 0) };
}

/** Whole seconds left, as the HUD shows them (rounded up: 0 only when the round is over). */
export function secondsLeft(state: MarblesState): number {
  return Math.ceil(state.timeLeftMs / 1000);
}

function tap(state: MarblesState, tube: number): MarblesState {
  if (state.guardMs > 0) return { ...state, events: [{ kind: 'ignored' }] };
  if (tube < 0 || tube >= state.tubes.length) return state.events.length === 0 ? state : { ...state, events: [] };
  const { selected } = state;
  if (selected === null) {
    if (state.tubes[tube].length === 0) return state.events.length === 0 ? state : { ...state, events: [] };
    return { ...state, selected: tube, events: [{ kind: 'select', tube }] };
  }
  if (selected === tube) return { ...state, selected: null, events: [{ kind: 'select', tube: null }] };
  const count = moveCount(state.tubes, selected, tube);
  if (count === 0) {
    // Simplest reading: an illegal target is refused; a non-empty one becomes the new selection.
    const next = state.tubes[tube].length > 0 ? tube : null;
    return { ...state, selected: next, events: [{ kind: 'refused', from: selected, to: tube }, { kind: 'select', tube: next }] };
  }
  const tubes = applyMove(state.tubes, selected, tube);
  const moveEvent: MarblesEvent = { kind: 'move', from: selected, to: tube, count };
  if (!isSorted(tubes)) return { ...state, tubes, selected: null, guardMs: MOVE_GUARD_MS, moves: state.moves + 1, events: [moveEvent] };
  const points = puzzlePoints(state.colours);
  const combo = state.puzzleMs < COMBO_MS;
  const events: MarblesEvent[] = [moveEvent, { kind: 'solved', puzzle: state.puzzle, points }, { kind: 'score', points }];
  if (combo) events.push({ kind: 'combo' });
  return {
    ...state,
    ...startPuzzle(state.puzzle + 1, state.rngState),
    guardMs: MOVE_GUARD_MS,
    score: state.score + points,
    combos: state.combos + (combo ? 1 : 0),
    events,
  };
}

export function reduceMarbles(state: MarblesState, action: MarblesAction): MarblesState {
  if (state.status !== 'playing') return state;
  switch (action.type) {
    case 'tick': {
      if (action.dt <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
      const timeLeftMs = Math.max(0, state.timeLeftMs - action.dt);
      const base = { ...state, timeLeftMs, puzzleMs: state.puzzleMs + action.dt, guardMs: Math.max(0, state.guardMs - action.dt) };
      if (timeLeftMs <= 0) return { ...base, status: 'over', selected: null, events: [{ kind: 'over', score: state.score }] };
      return { ...base, events: [] };
    }
    case 'tap':
      return tap(state, action.tube);
    case 'restart':
      // The timer keeps running and the puzzle time too (the combo counts from the puzzle's first appearance).
      return { ...state, tubes: state.start, selected: null, guardMs: 0, moves: state.moves + 1, events: [{ kind: 'restart' }] };
  }
}
