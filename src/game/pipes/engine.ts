// Plombier Express: turn pipe pieces to bring the water from the left side to the right side of a 5 × 5 grid
// (docs/PRD.md "Plombier Express", AC-62). Pure reducer on an immutable state, see src/game/contract.ts. Cells are
// indexed `row * PIPES_SIZE + col`, row 0 at the top. A piece is a straight or an elbow with a rotation 0..3
// (quarter turns clockwise); its openings are a bit mask N / E / S / W.
//
// Each grid holds one seeded self-avoiding path from the entry (left side of a seeded row) to the exit (right side
// of a seeded row), the other cells get random pieces, then every cell is turned a random number of quarter turns.
// Par = the clockwise taps that bring each path cell back to a right orientation (a straight piece needs 0 or 1,
// an elbow 0..3). A grid that starts solved is turned again until it is not (so par >= 1).
//
// v0.3.0 (AC-88): a solved grid stays on the board for SOLVED_SHOW_MS while the water runs from the entry through
// the connected pieces (`waterOrder`, `waterFront`); taps and hints are ignored meanwhile. The pause is a ms counter
// advanced by `tick`, like the pause between two cakes of Bougies Folles; the next grid (or the end of the round)
// comes when it reaches 0. A failed grid has no water to show: the next grid still comes at once.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng, type Rng } from '../rng';

export const PIPES_SIZE = 5;
export const PIPES_CELLS = PIPES_SIZE * PIPES_SIZE;
export const PIPES_GRIDS = 5;
/** Taps beyond par after which an unsolved grid is failed. */
export const PIPES_FAIL_AFTER = 20;
/** A solved grid stays shown this long (water running, points popping) before the next grid. */
export const SOLVED_SHOW_MS = 1000;
/** Part of the pause during which the water runs from the entry to the exit; the full pipe is then held. */
export const WATER_RUN_MS = 700;

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
type Dir = typeof N | typeof E | typeof S | typeof W;
const DIRS: readonly Dir[] = [N, E, S, W];
const OPPOSITE: Record<Dir, Dir> = { [N]: S, [E]: W, [S]: N, [W]: E };
const STEP: Record<Dir, { dc: number; dr: number }> = { [N]: { dc: 0, dr: -1 }, [E]: { dc: 1, dr: 0 }, [S]: { dc: 0, dr: 1 }, [W]: { dc: -1, dr: 0 } };

export type PieceKind = 'straight' | 'elbow';
export type Piece = { kind: PieceKind; rot: number };

/** Openings at rotation 0: a straight runs W–E, an elbow joins N and E. */
const BASE: Record<PieceKind, number> = { straight: E | W, elbow: N | E };

/** Rotates a mask one quarter turn clockwise (N → E → S → W → N). */
function turnMask(mask: number): number {
  return ((mask << 1) | (mask >> 3)) & 0b1111;
}

export function openings(piece: Piece): number {
  let mask = BASE[piece.kind];
  for (let i = 0; i < ((piece.rot % 4) + 4) % 4; i++) mask = turnMask(mask);
  return mask;
}

/** A path cell and the openings it needs (towards the previous and the next cell). */
export type PathCell = { cell: number; need: number };

export type PipesEvent =
  /** A tap: the cell turned a quarter turn clockwise. */
  | { kind: 'turn'; cell: number }
  | { kind: 'solved'; grid: number; taps: number; par: number; points: number }
  | { kind: 'failed'; grid: number }
  /** The next grid is on the board. */
  | { kind: 'grid'; grid: number }
  | { kind: 'hint'; cell: number }
  /** A tap or a hint while the solved grid is shown: nothing changes. */
  | { kind: 'ignored' };

export type PipesState = RoundState<PipesEvent> & {
  pieces: readonly Piece[];
  entryRow: number;
  exitRow: number;
  /** The seeded path, from the entry to the exit. */
  path: readonly PathCell[];
  /** Current grid, 1..5. */
  grid: number;
  par: number;
  /** Taps on the current grid (hints are not taps). */
  taps: number;
  /** Taps on each cell of the current grid (the screen replays a rotation when it grows). */
  turns: readonly number[];
  hintsLeft: number;
  /** Cell highlighted by the last hint, null when none is shown. */
  hint: number | null;
  rngState: number;
  /** Time left of the solved grid on screen (ms); 0 while the grid is played. */
  solvedMs: number;
};

export type PipesAction = { type: 'tap'; cell: number } | { type: 'hint' } | { type: 'tick'; dt: number };

export function gridScore(taps: number, par: number): number {
  return Math.max(50, 300 - 15 * Math.max(0, taps - par));
}

const colOf = (cell: number) => cell % PIPES_SIZE;
const rowOf = (cell: number) => Math.floor(cell / PIPES_SIZE);

function neighbour(cell: number, dir: Dir): number | null {
  const col = colOf(cell) + STEP[dir].dc;
  const row = rowOf(cell) + STEP[dir].dr;
  return col >= 0 && col < PIPES_SIZE && row >= 0 && row < PIPES_SIZE ? row * PIPES_SIZE + col : null;
}

/** Cells filled with water: connected to the entry through matching openings. */
export function wateredCells(pieces: readonly Piece[], entryRow: number): boolean[] {
  const water = new Array<boolean>(PIPES_CELLS).fill(false);
  const start = entryRow * PIPES_SIZE;
  if (!(openings(pieces[start]) & W)) return water;
  const queue = [start];
  water[start] = true;
  while (queue.length > 0) {
    const cell = queue.shift() as number;
    const mask = openings(pieces[cell]);
    for (const dir of DIRS) {
      if (!(mask & dir)) continue;
      const next = neighbour(cell, dir);
      if (next === null || water[next] || !(openings(pieces[next]) & OPPOSITE[dir])) continue;
      water[next] = true;
      queue.push(next);
    }
  }
  return water;
}

/**
 * Order in which the water reaches each cell: breadth-first steps from the entry cell (0), -1 for a dry cell. On a
 * solved grid this is the path order of the connected pieces, from the entry to the exit.
 */
export function waterOrder(pieces: readonly Piece[], entryRow: number): number[] {
  const order = new Array<number>(PIPES_CELLS).fill(-1);
  const start = entryRow * PIPES_SIZE;
  if (!(openings(pieces[start]) & W)) return order;
  const queue = [start];
  order[start] = 0;
  while (queue.length > 0) {
    const cell = queue.shift() as number;
    const mask = openings(pieces[cell]);
    for (const dir of DIRS) {
      if (!(mask & dir)) continue;
      const next = neighbour(cell, dir);
      if (next === null || order[next] >= 0 || !(openings(pieces[next]) & OPPOSITE[dir])) continue;
      order[next] = order[cell] + 1;
      queue.push(next);
    }
  }
  return order;
}

/**
 * Number of water steps drawn: during the solved pause the water runs one step at a time (WATER_RUN_MS for the
 * whole pipe), else every connected cell is drawn (Infinity). A cell is filled when its `waterOrder` is below it.
 */
export function waterFront(state: Pick<PipesState, 'pieces' | 'entryRow' | 'solvedMs'>): number {
  if (state.solvedMs <= 0) return Infinity;
  const steps = Math.max(...waterOrder(state.pieces, state.entryRow)) + 1;
  const elapsed = SOLVED_SHOW_MS - state.solvedMs;
  return Math.min(steps, 1 + Math.floor((elapsed * steps) / WATER_RUN_MS));
}

/** Cells drawn filled with water now: connected to the entry, and reached by the running water during the pause. */
export function filledCells(state: Pick<PipesState, 'pieces' | 'entryRow' | 'solvedMs'>): boolean[] {
  const front = waterFront(state);
  return waterOrder(state.pieces, state.entryRow).map((o) => o >= 0 && o < front);
}

/** Solved when the water reaches the exit cell and that cell opens to the right side (any path counts). */
export function isSolved(pieces: readonly Piece[], entryRow: number, exitRow: number): boolean {
  const exit = exitRow * PIPES_SIZE + PIPES_SIZE - 1;
  return wateredCells(pieces, entryRow)[exit] && (openings(pieces[exit]) & E) !== 0;
}

/** Clockwise taps that give the piece the needed openings (null if no rotation does). */
export function turnsToFit(piece: Piece, need: number): number | null {
  for (let t = 0; t < 4; t++) if (openings({ kind: piece.kind, rot: piece.rot + t }) === need) return t;
  return null;
}

export function parOf(pieces: readonly Piece[], path: readonly PathCell[]): number {
  return path.reduce((sum, p) => sum + (turnsToFit(pieces[p.cell], p.need) ?? 0), 0);
}

/** Random self-avoiding path from (0, entryRow) to (4, exitRow): depth-first search with seeded neighbour order. */
function seededPath(rng: Rng, entryRow: number, exitRow: number): number[] {
  const start = entryRow * PIPES_SIZE;
  const goal = exitRow * PIPES_SIZE + PIPES_SIZE - 1;
  const seen = new Array<boolean>(PIPES_CELLS).fill(false);
  const path: number[] = [];
  const walk = (cell: number): boolean => {
    seen[cell] = true;
    path.push(cell);
    if (cell === goal) return true;
    for (const dir of rng.shuffle(DIRS)) {
      const next = neighbour(cell, dir);
      if (next !== null && !seen[next] && walk(next)) return true;
    }
    path.pop();
    return false; // `seen` stays set: a dead end cannot reach the goal from here
  };
  walk(start);
  return path;
}

function directionTo(from: number, to: number): Dir {
  return DIRS.find((d) => neighbour(from, d) === to) as Dir;
}

export function buildGrid(rngState: number): { pieces: Piece[]; path: PathCell[]; entryRow: number; exitRow: number; par: number; rngState: number } {
  const rng = createRng(rngState);
  const entryRow = rng.int(PIPES_SIZE);
  const exitRow = rng.int(PIPES_SIZE);
  const cells = seededPath(rng, entryRow, exitRow);
  const path: PathCell[] = cells.map((cell, i) => {
    const inDir = i === 0 ? W : directionTo(cell, cells[i - 1]);
    const outDir = i === cells.length - 1 ? E : directionTo(cell, cells[i + 1]);
    return { cell, need: inDir | outDir };
  });
  const solvedPieces: Piece[] = Array.from({ length: PIPES_CELLS }, () => ({ kind: rng.next() < 0.5 ? 'straight' : 'elbow', rot: rng.int(4) }));
  for (const p of path) {
    const kind: PieceKind = p.need === (E | W) || p.need === (N | S) ? 'straight' : 'elbow';
    solvedPieces[p.cell] = { kind, rot: turnsToFit({ kind, rot: 0 }, p.need) as number };
  }
  for (;;) {
    const pieces = solvedPieces.map((piece) => ({ kind: piece.kind, rot: (piece.rot + rng.int(4)) % 4 }));
    if (!isSolved(pieces, entryRow, exitRow)) return { pieces, path, entryRow, exitRow, par: parOf(pieces, path), rngState: rng.state() };
  }
}

type Carried = Pick<PipesState, 'score' | 'combos' | 'status' | 'hintsLeft' | 'rngState'>;

function startGrid(state: Carried, grid: number): PipesState {
  const built = buildGrid(state.rngState);
  return {
    score: state.score,
    combos: state.combos,
    status: state.status,
    hintsLeft: state.hintsLeft,
    events: [],
    pieces: built.pieces,
    entryRow: built.entryRow,
    exitRow: built.exitRow,
    path: built.path,
    grid,
    par: built.par,
    taps: 0,
    turns: new Array<number>(PIPES_CELLS).fill(0),
    hint: null,
    rngState: built.rngState,
    solvedMs: 0,
  };
}

export function createPipes(seed: number, upgrades: UpgradeLevels = {}): PipesState {
  return startGrid({ score: 0, combos: 0, status: 'playing', hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** First path cell (from the entry) that is not yet turned right, or null. */
export function hintCell(state: Pick<PipesState, 'pieces' | 'path'>): number | null {
  const wrong = state.path.find((p) => openings(state.pieces[p.cell]) !== p.need);
  return wrong ? wrong.cell : null;
}

/** After the solved pause (or a failed grid): the next grid, or the end of the round after grid 5. */
function nextGrid(state: PipesState, events: PipesState['events'][number][]): PipesState {
  if (state.grid >= PIPES_GRIDS) {
    events.push({ kind: 'over', score: state.score });
    return { ...state, hint: null, solvedMs: 0, status: 'over', events };
  }
  const next = startGrid({ score: state.score, combos: state.combos, status: 'playing', hintsLeft: state.hintsLeft, rngState: state.rngState }, state.grid + 1);
  events.push({ kind: 'grid', grid: next.grid });
  return { ...next, events };
}

export function reducePipes(state: PipesState, action: PipesAction): PipesState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    if (state.solvedMs <= 0 || !(action.dt > 0)) return state.events.length === 0 ? state : { ...state, events: [] };
    const solvedMs = Math.max(0, state.solvedMs - action.dt);
    if (solvedMs > 0) return { ...state, solvedMs, events: [] };
    return nextGrid({ ...state, solvedMs: 0 }, []);
  }

  // The solved grid is on show: taps and hints change nothing.
  if (state.solvedMs > 0) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'hint') {
    // Refused when none is left or one is already shown (a second hint would point at the same cell).
    const cell = hintCell(state);
    if (state.hintsLeft <= 0 || state.hint !== null || cell === null) return { ...state, events: [] };
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: cell, events: [{ kind: 'hint', cell }] };
  }

  const { cell } = action;
  if (!Number.isInteger(cell) || cell < 0 || cell >= PIPES_CELLS) return { ...state, events: [] };
  const pieces = state.pieces.slice();
  pieces[cell] = { kind: pieces[cell].kind, rot: (pieces[cell].rot + 1) % 4 };
  const turns = state.turns.slice();
  turns[cell] += 1;
  const taps = state.taps + 1;
  const events: PipesState['events'][number][] = [{ kind: 'turn', cell }];

  const solved = isSolved(pieces, state.entryRow, state.exitRow);
  if (!solved && taps < state.par + PIPES_FAIL_AFTER) {
    // The hint stays until its cell is turned right.
    const hinted = state.hint !== null ? state.path.find((p) => p.cell === state.hint) : undefined;
    const hint = hinted && openings(pieces[hinted.cell]) !== hinted.need ? hinted.cell : null;
    return { ...state, pieces, turns, taps, hint, events };
  }

  let score = state.score;
  let combos = state.combos;
  if (solved) {
    const points = gridScore(taps, state.par);
    score += points;
    events.push({ kind: 'solved', grid: state.grid, taps, par: state.par, points }, { kind: 'score', points });
    if (taps <= state.par) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
  } else {
    events.push({ kind: 'failed', grid: state.grid });
  }

  if (solved) return { ...state, pieces, turns, taps, hint: null, score, combos, solvedMs: SOLVED_SHOW_MS, events };
  return nextGrid({ ...state, pieces, turns, taps, score, combos }, events);
}
