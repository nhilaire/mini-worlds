// « Glisse-Fusion » (docs/PRD.md "Glisse-Fusion", AC-97): slide every gem of a 4 × 4 board; two gems of the same
// level that meet merge into one gem of the next level (11 levels, caillou to diamant). Pure reducer on an immutable
// state, see src/game/contract.ts; time comes in through `tick`.
//
// A swipe slides every gem as far as it can. Merges are resolved from the side the gems slide to and a gem merges
// once per move. A move that changes nothing is ignored. After a move a new gem appears on a seeded empty cell
// (level 1 at 90 %, level 2 at 10 %); every 10th move it is a joker, which merges with any gem it meets (the result
// is the next level of that gem; two jokers make a level-3 gem). A merge into level L scores 2^L × 5. A round is
// 80 moves; it ends earlier when no move is possible. « Annuler » takes the last move back (one step only).
//
// Input guard: a move animates in MOVE_MS; swipes and undos are ignored meanwhile (ms counter advanced by `tick`).
// Readings chosen (the PRD is silent):
// - a level-11 gem (diamant) merges with nothing, not even another diamant or a joker: there is no level 12;
// - the round ends when the guard of the last move has run out (80th move, or no move left), so that the player sees
//   the last slide; a board without a move ends the round even when an undo is left;
// - an undo also restores the combo count of before the move, but not the generator: the move played again gets a
//   new seeded gem. It is refused before the first move and right after another undo; it has no animation (no guard).

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const TILES_SIZE = 4;
export const TILES_CELLS = TILES_SIZE * TILES_SIZE;
/** Highest gem level (diamant). */
export const TILES_MAX_LEVEL = 11;
/** Moves of a round. */
export const TILES_MOVES = 80;
/** Level-1 gems on the board at the start. */
export const START_GEMS = 2;
/** Chance that the new gem is of level 2 instead of level 1. */
export const LEVEL_TWO_CHANCE = 0.1;
/** Every move whose number is a multiple of this brings a joker instead of a gem. */
export const JOKER_EVERY = 10;
/** Two jokers that meet make a gem of this level. */
export const JOKER_PAIR_LEVEL = 3;
/** A move animates this long; swipes and undos are ignored meanwhile. */
export const MOVE_MS = 150;

/** Cell content: 0 empty, 1..11 a gem of that level, JOKER the joker. */
export const EMPTY = 0;
export const JOKER = -1;

/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];

export type TilesEvent =
  | { kind: 'move'; dir: Dir; merges: number }
  /** A merge made a gem of `level` on `cell`. */
  | { kind: 'merge'; cell: number; level: number; points: number }
  /** The new gem of the move (`gem` is 1, 2 or JOKER). */
  | { kind: 'spawn'; cell: number; gem: number }
  | { kind: 'undo' }
  /** A swipe that would change nothing. */
  | { kind: 'blocked'; dir: Dir }
  /** A swipe or an undo during the move animation: nothing changes. */
  | { kind: 'ignored' };

/** What « Annuler » restores. */
export type TilesSnapshot = { cells: readonly number[]; score: number; moves: number; combos: number };

export type TilesState = RoundState<TilesEvent> & {
  /** 16 cells, row by row from the top left. */
  cells: readonly number[];
  /** Moves made (ignored swipes do not count). */
  moves: number;
  undosLeft: number;
  /** The round before the last move, null when there is nothing to take back. */
  previous: TilesSnapshot | null;
  /** Time left of the move animation (ms): inputs are ignored while > 0. */
  busyMs: number;
  /** For the screen: the cell each gem of the last move came from (its own cell when it did not move). */
  origins: readonly number[];
  /** For the screen: the cell of the gem that appeared after the last move, null when none. */
  spawned: number | null;
  rngState: number;
};

export type TilesAction = { type: 'swipe'; dir: Dir } | { type: 'undo' } | { type: 'tick'; dt: number };

/** Points of a merge into a gem of `level`: 2^level × 5. */
export function mergeScore(level: number): number {
  return 2 ** level * 5;
}

/** Level of the gem two meeting gems make, 0 when they do not merge. */
export function mergedLevel(a: number, b: number): number {
  if (a === EMPTY || b === EMPTY) return 0;
  if (a === JOKER && b === JOKER) return JOKER_PAIR_LEVEL;
  const level = a === JOKER ? b : b === JOKER ? a : a === b ? a : 0;
  return level > 0 && level < TILES_MAX_LEVEL ? level + 1 : 0;
}

/** The 4 lines of a move, each as its cells listed from the side the gems slide to. */
export function linesOf(dir: Dir): number[][] {
  const lines: number[][] = [];
  for (let k = 0; k < TILES_SIZE; k++) {
    const line: number[] = [];
    for (let i = 0; i < TILES_SIZE; i++) {
      if (dir === 0) line.push(i * TILES_SIZE + k);
      else if (dir === 2) line.push((TILES_SIZE - 1 - i) * TILES_SIZE + k);
      else if (dir === 3) line.push(k * TILES_SIZE + i);
      else line.push(k * TILES_SIZE + (TILES_SIZE - 1 - i));
    }
    lines.push(line);
  }
  return lines;
}

export type Slide = {
  cells: number[];
  /** For every cell, the cell its gem came from (for a merged gem: the farther of the two). */
  origins: number[];
  /** Merges made, in the order they are resolved. */
  merges: { cell: number; level: number }[];
  points: number;
  changed: boolean;
};

/** The board after sliding every gem towards `dir` (no new gem). Used by the reducer and by the casual bot. */
export function slide(cells: readonly number[], dir: Dir): Slide {
  const out = new Array<number>(TILES_CELLS).fill(EMPTY);
  const origins = Array.from({ length: TILES_CELLS }, (_, i) => i);
  const merges: Slide['merges'] = [];
  let points = 0;
  for (const line of linesOf(dir)) {
    const gems = line.filter((cell) => cells[cell] !== EMPTY);
    let place = 0;
    for (let i = 0; i < gems.length; i++) {
      const target = line[place++];
      const level = i + 1 < gems.length ? mergedLevel(cells[gems[i]], cells[gems[i + 1]]) : 0;
      if (level > 0) {
        out[target] = level;
        origins[target] = gems[i + 1];
        merges.push({ cell: target, level });
        points += mergeScore(level);
        i += 1;
      } else {
        out[target] = cells[gems[i]];
        origins[target] = gems[i];
      }
    }
  }
  return { cells: out, origins, merges, points, changed: out.some((v, i) => v !== cells[i]) };
}

/** True when at least one of the four moves changes the board. */
export function canMove(cells: readonly number[]): boolean {
  return DIRS.some((dir) => slide(cells, dir).changed);
}

/** Highest gem level on the board (0 on a board of jokers only). */
export function bestGem(cells: readonly number[]): number {
  return Math.max(0, ...cells);
}

export function movesLeft(state: Pick<TilesState, 'moves'>): number {
  return Math.max(0, TILES_MOVES - state.moves);
}

/** True when a swipe or an undo is taken now (no move animation). */
export function acceptsInput(state: Pick<TilesState, 'status' | 'busyMs'>): boolean {
  return state.status === 'playing' && state.busyMs <= 0;
}

const OWN_CELLS: readonly number[] = Array.from({ length: TILES_CELLS }, (_, i) => i);

export function createTiles(seed: number, upgrades: UpgradeLevels = {}): TilesState {
  const rng = createRng(seed >>> 0);
  const cells = new Array<number>(TILES_CELLS).fill(EMPTY);
  for (const cell of rng.shuffle(OWN_CELLS).slice(0, START_GEMS)) cells[cell] = 1;
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    cells,
    moves: 0,
    undosLeft: upgrades.undo ?? 0,
    previous: null,
    busyMs: 0,
    origins: OWN_CELLS,
    spawned: null,
    rngState: rng.state(),
  };
}

function move(state: TilesState, dir: Dir): TilesState {
  const slid = slide(state.cells, dir);
  if (!slid.changed) return { ...state, events: [{ kind: 'blocked', dir }] };
  const moves = state.moves + 1;
  const events: TilesState['events'][number][] = [{ kind: 'move', dir, merges: slid.merges.length }];
  for (const m of slid.merges) events.push({ kind: 'merge', cell: m.cell, level: m.level, points: mergeScore(m.level) });
  if (slid.points > 0) events.push({ kind: 'score', points: slid.points });
  let combos = state.combos;
  if (slid.merges.length >= 2) {
    combos += 1;
    events.push({ kind: 'combo' });
  }

  // The new gem: a move that changed the board always leaves an empty cell (a full board only changes by a merge).
  const rng = createRng(state.rngState);
  const cells = slid.cells;
  const empty = OWN_CELLS.filter((cell) => cells[cell] === EMPTY);
  const spawned = empty[rng.int(empty.length)];
  const gem = moves % JOKER_EVERY === 0 ? JOKER : rng.next() < LEVEL_TWO_CHANCE ? 2 : 1;
  cells[spawned] = gem;
  events.push({ kind: 'spawn', cell: spawned, gem });

  return {
    ...state,
    score: state.score + slid.points,
    combos,
    cells,
    moves,
    previous: { cells: state.cells, score: state.score, moves: state.moves, combos: state.combos },
    busyMs: MOVE_MS,
    origins: slid.origins,
    spawned,
    rngState: rng.state(),
    events,
  };
}

export function reduceTiles(state: TilesState, action: TilesAction): TilesState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    if (!(action.dt > 0) || state.busyMs <= 0) return state.events.length === 0 ? state : { ...state, events: [] };
    const busyMs = Math.max(0, state.busyMs - action.dt);
    if (busyMs > 0) return { ...state, busyMs, events: [] };
    // The move has landed: the round ends after the 80th move or when nothing can move any more.
    if (state.moves >= TILES_MOVES || !canMove(state.cells)) return { ...state, busyMs, status: 'over', events: [{ kind: 'over', score: state.score }] };
    return { ...state, busyMs, events: [] };
  }

  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'undo') {
    // Refused when none is left or there is no move to take back.
    const back = state.previous;
    if (state.undosLeft <= 0 || back === null) return { ...state, events: [] };
    return {
      ...state,
      cells: back.cells,
      score: back.score,
      moves: back.moves,
      combos: back.combos,
      undosLeft: state.undosLeft - 1,
      previous: null,
      origins: OWN_CELLS,
      spawned: null,
      events: [{ kind: 'undo' }],
    };
  }

  if (!DIRS.includes(action.dir)) return { ...state, events: [] };
  return move(state, action.dir);
}
