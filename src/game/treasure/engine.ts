// « Chasse au Trésor » (docs/PRD.md "Chasse au Trésor", AC-85): an 8 × 8 beach hides one chest (seeded). A tap digs a
// cell; the hole shows the band of its Manhattan distance to the chest: 0 trésor, 1-2 brûlant, 3-4 chaud, 5-7 tiède,
// 8+ froid. Pure reducer on an immutable state, see src/game/contract.ts; time comes in through `tick`.
//
// 8 digs per map (+1 per « Détecteur » level). Chest found: 100 + 20 × digs left after the finding dig, then the
// next map; out of digs the map scores 0. A round is 5 maps. A tap on a dug cell is ignored (no dig spent).
// Input guard: a dig animates in DIG_MS; taps are ignored meanwhile (ms counter advanced by `tick`).
// Reading chosen (not in the PRD): a finished map stays on screen for MAP_SHOW_MS (taps ignored) with the chest shown,
// so the player sees where it was, then the next map comes (same idea as the solved Plombier grid of v0.3.0).
import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const TREASURE_SIZE = 8;
export const TREASURE_CELLS = TREASURE_SIZE * TREASURE_SIZE;
export const TREASURE_MAPS = 5;
export const BASE_DIGS = 8;
export const FOUND_POINTS = 100;
export const POINTS_PER_DIG_LEFT = 20;
/** A chest found in at most this many digs is a combo. */
export const COMBO_DIGS = 3;
/** A dig animates this long; taps are ignored meanwhile. */
export const DIG_MS = 200;
/** A finished map stays shown this long (taps ignored) before the next one. */
export const MAP_SHOW_MS = 800;

export type Band = 'found' | 'burning' | 'hot' | 'warm' | 'cold';
export const BANDS: readonly Band[] = ['found', 'burning', 'hot', 'warm', 'cold'];

export type TreasureEvent =
  | { kind: 'dig'; cell: number; band: Band }
  | { kind: 'found'; map: number; digs: number; points: number }
  /** Out of digs: the map scores 0. */
  | { kind: 'lost'; map: number }
  /** The next map is on screen. */
  | { kind: 'map'; map: number }
  /** A tap on a dug cell, during the dig animation or on a finished map: nothing changes. */
  | { kind: 'ignored' };

export type TreasureState = RoundState<TreasureEvent> & {
  /** Current map, 1..5. */
  map: number;
  /** Cell of the chest (`row * 8 + col`). */
  chest: number;
  /** Band shown by each dug cell, null when not dug. */
  dug: readonly (Band | null)[];
  digsPerMap: number;
  digsLeft: number;
  /** Time left of the dig animation (ms): taps are ignored while > 0. */
  busyMs: number;
  /** Time left of the finished map on screen (ms): taps are ignored, then the next map comes. */
  doneMs: number;
  rngState: number;
};

export type TreasureAction = { type: 'dig'; cell: number } | { type: 'tick'; dt: number };

export const colOf = (cell: number) => cell % TREASURE_SIZE;
export const rowOf = (cell: number) => Math.floor(cell / TREASURE_SIZE);

export function distance(a: number, b: number): number {
  return Math.abs(colOf(a) - colOf(b)) + Math.abs(rowOf(a) - rowOf(b));
}

/** Band of a Manhattan distance: 0 trésor, 1-2 brûlant, 3-4 chaud, 5-7 tiède, 8+ froid. */
export function bandOf(d: number): Band {
  if (d === 0) return 'found';
  if (d <= 2) return 'burning';
  if (d <= 4) return 'hot';
  if (d <= 7) return 'warm';
  return 'cold';
}

export function mapScore(digsLeft: number): number {
  return FOUND_POINTS + POINTS_PER_DIG_LEFT * digsLeft;
}

type Carried = Pick<TreasureState, 'score' | 'combos' | 'digsPerMap' | 'rngState'>;

/** A seeded chest anywhere on the beach (one draw: the generator cannot fail). */
function startMap(state: Carried, map: number): TreasureState {
  const rng = createRng(state.rngState);
  const chest = rng.int(TREASURE_CELLS);
  return {
    score: state.score,
    combos: state.combos,
    status: 'playing',
    events: [],
    map,
    chest,
    dug: new Array<Band | null>(TREASURE_CELLS).fill(null),
    digsPerMap: state.digsPerMap,
    digsLeft: state.digsPerMap,
    busyMs: 0,
    doneMs: 0,
    rngState: rng.state(),
  };
}

export function createTreasure(seed: number, upgrades: UpgradeLevels = {}): TreasureState {
  return startMap({ score: 0, combos: 0, digsPerMap: BASE_DIGS + (upgrades.detector ?? 0), rngState: seed >>> 0 }, 1);
}

/** True when a dig is taken now (no dig animation, no finished map on show). */
export function acceptsInput(state: Pick<TreasureState, 'status' | 'busyMs' | 'doneMs'>): boolean {
  return state.status === 'playing' && state.busyMs <= 0 && state.doneMs <= 0;
}

/** True once the map is over (found or out of digs): the chest is shown. */
export function mapFinished(state: Pick<TreasureState, 'dug' | 'chest' | 'digsLeft'>): boolean {
  return state.dug[state.chest] === 'found' || state.digsLeft <= 0;
}

function nextMap(state: TreasureState): TreasureState {
  if (state.map >= TREASURE_MAPS) return { ...state, busyMs: 0, doneMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
  const next = startMap(state, state.map + 1);
  return { ...next, events: [{ kind: 'map', map: next.map }] };
}

export function reduceTreasure(state: TreasureState, action: TreasureAction): TreasureState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    if (!(action.dt > 0) || (state.busyMs <= 0 && state.doneMs <= 0)) return state.events.length === 0 ? state : { ...state, events: [] };
    const busyMs = Math.max(0, state.busyMs - action.dt);
    if (state.doneMs <= 0) return { ...state, busyMs, events: [] };
    const doneMs = Math.max(0, state.doneMs - action.dt);
    if (doneMs > 0) return { ...state, busyMs, doneMs, events: [] };
    return nextMap(state);
  }

  const { cell } = action;
  if (!Number.isInteger(cell) || cell < 0 || cell >= TREASURE_CELLS) return { ...state, events: [] };
  if (!acceptsInput(state) || state.dug[cell] !== null) return { ...state, events: [{ kind: 'ignored' }] };

  const band = bandOf(distance(cell, state.chest));
  const dug = state.dug.slice();
  dug[cell] = band;
  const digsLeft = state.digsLeft - 1;
  const events: TreasureState['events'][number][] = [{ kind: 'dig', cell, band }];
  const base: TreasureState = { ...state, dug, digsLeft, busyMs: DIG_MS };
  if (band === 'found') {
    const digs = state.digsPerMap - digsLeft;
    const points = mapScore(digsLeft);
    events.push({ kind: 'found', map: state.map, digs, points }, { kind: 'score', points });
    let combos = state.combos;
    if (digs <= COMBO_DIGS) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
    return { ...base, score: state.score + points, combos, doneMs: MAP_SHOW_MS, events };
  }
  if (digsLeft <= 0) {
    events.push({ kind: 'lost', map: state.map });
    return { ...base, doneMs: MAP_SHOW_MS, events };
  }
  return { ...base, events };
}
