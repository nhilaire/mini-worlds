// Champ de Taupes: a minesweeper on an 8 x 8 field (docs/PRD.md "Champ de Taupes", AC-68). Pure reducer on an
// immutable state, see src/game/contract.ts. Cells are indexed `row * MOLES_SIZE + col`, row 0 at the top. The moles
// of a board are placed at its first dig (never on that cell nor its 8 neighbours), in a seeded order that the radar
// follows. Flag mode is a screen toggle: the screen dispatches `dig` or `flag` for a tap. Every random draw goes
// through the seeded rng, whose state travels in the game state.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const MOLES_SIZE = 8;
export const MOLES_CELLS = MOLES_SIZE * MOLES_SIZE;
export const BASE_MOLES = 8;
export const MAX_MOLES = 16;
export const SAFE_CELL_POINTS = 5;
export const CLEAR_POINTS = 300;
/** Combo (challenges): one dig that reveals this many cells or more. */
export const COMBO_REVEAL = 10;

export type Cell = { col: number; row: number };

export type MolesEvent =
  /** A safe dig: the cells revealed (the dug cell first, then the flood of the zeros). */
  | { kind: 'dig'; cells: readonly Cell[]; points: number }
  /** A dig on a mole: the round is over; `moles` lists every mole of the board (revealed at the end). */
  | { kind: 'mole'; cell: Cell; moles: readonly Cell[] }
  | { kind: 'flag'; cell: Cell; flagged: boolean }
  | { kind: 'radar'; cell: Cell }
  /** Every safe cell revealed: its points; the next board is already in the state. */
  | { kind: 'cleared'; board: number; points: number }
  /** An input that changes nothing (dig on a flag or an open cell, radar with no use or no mole left...). */
  | { kind: 'refused' };

export type MolesState = RoundState<MolesEvent> & {
  /** Board number, from 1. */
  boardNumber: number;
  /** Moles of the board in seeded order (the radar's order); null until the first dig of the board. */
  moles: readonly number[] | null;
  revealed: readonly boolean[];
  flagged: readonly boolean[];
  /** Radar uses left this round (« Radar » level: 1 / 2 / 3, 0 without the upgrade). */
  radarLeft: number;
  rngState: number;
};

export type MolesAction = { type: 'dig'; cell: Cell } | { type: 'flag'; cell: Cell } | { type: 'radar' };

// --- Rules -------------------------------------------------------------------------------------------------------

/** Moles of board n (from 1): 8 + 2 × (n − 1), at most 16. */
export function molesForBoard(n: number): number {
  return Math.min(MAX_MOLES, BASE_MOLES + 2 * (n - 1));
}

export const indexOf = (cell: Cell): number => cell.row * MOLES_SIZE + cell.col;
export const cellOf = (index: number): Cell => ({ col: index % MOLES_SIZE, row: Math.floor(index / MOLES_SIZE) });

function inBounds(cell: Cell): boolean {
  return Number.isInteger(cell.col) && Number.isInteger(cell.row) && cell.col >= 0 && cell.row >= 0 && cell.col < MOLES_SIZE && cell.row < MOLES_SIZE;
}

/** The (up to) 8 neighbours of a cell, as indexes. */
export function neighbours(index: number): number[] {
  const { col, row } = cellOf(index);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = { col: col + dc, row: row + dr };
      if (inBounds(c)) out.push(indexOf(c));
    }
  }
  return out;
}

/** Neighbouring moles of a cell (0 before the moles are placed). */
export function count(state: Pick<MolesState, 'moles'>, index: number): number {
  if (!state.moles) return 0;
  const set = new Set(state.moles);
  return neighbours(index).filter((n) => set.has(n)).length;
}

/** Moles of the current board (known before the first dig). */
export function boardMoles(state: Pick<MolesState, 'boardNumber'>): number {
  return molesForBoard(state.boardNumber);
}

/** HUD « moles left to flag »: moles of the board minus flags placed, never below 0. */
export function molesLeftToFlag(state: MolesState): number {
  return Math.max(0, boardMoles(state) - state.flagged.filter(Boolean).length);
}

const fresh = (): boolean[] => new Array<boolean>(MOLES_CELLS).fill(false);

// --- Construction ------------------------------------------------------------------------------------------------

export function createMoles(seed: number, upgrades: UpgradeLevels = {}): MolesState {
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    boardNumber: 1,
    moles: null,
    revealed: fresh(),
    flagged: fresh(),
    radarLeft: upgrades.radar ?? 0,
    rngState: createRng(seed).state(),
  };
}

/** Places the board's moles away from the first dig and its neighbours, in seeded order. */
function placeMoles(state: MolesState, first: number): { moles: number[]; rngState: number } {
  const rng = createRng(state.rngState);
  const forbidden = new Set([first, ...neighbours(first)]);
  const candidates: number[] = [];
  for (let i = 0; i < MOLES_CELLS; i++) if (!forbidden.has(i)) candidates.push(i);
  const moles = rng.shuffle(candidates).slice(0, boardMoles(state));
  return { moles, rngState: rng.state() };
}

/** Test helper: the same state with hand-placed moles (in that radar order). */
export function withMoles(state: MolesState, moles: readonly Cell[]): MolesState {
  return { ...state, moles: moles.map(indexOf), events: [] };
}

// --- Reducer -----------------------------------------------------------------------------------------------------

const refused = (state: MolesState): MolesState => ({ ...state, events: [{ kind: 'refused' }] });

function dig(state: MolesState, cell: Cell): MolesState {
  const index = indexOf(cell);
  if (state.revealed[index] || state.flagged[index]) return refused(state);
  let s = state;
  if (!s.moles) s = { ...s, ...placeMoles(s, index) };
  const moles = new Set(s.moles);

  if (moles.has(index)) {
    const all = (s.moles ?? []).map(cellOf);
    return { ...s, status: 'over', events: [{ kind: 'mole', cell, moles: all }, { kind: 'over', score: s.score }] };
  }

  // Flood reveal: a 0 also digs its neighbours, repeatedly; flagged cells stay covered.
  const revealed = s.revealed.slice();
  const opened: number[] = [index];
  revealed[index] = true;
  for (let i = 0; i < opened.length; i++) {
    if (count(s, opened[i]) !== 0) continue;
    for (const n of neighbours(opened[i])) {
      if (revealed[n] || s.flagged[n] || moles.has(n)) continue;
      revealed[n] = true;
      opened.push(n);
    }
  }
  const points = SAFE_CELL_POINTS * opened.length;
  const combo = opened.length >= COMBO_REVEAL;
  const events: MolesState['events'][number][] = [{ kind: 'dig', cells: opened.map(cellOf), points }, { kind: 'score', points }];
  if (combo) events.push({ kind: 'combo' });
  let score = s.score + points;

  const safeCells = MOLES_CELLS - moles.size;
  if (revealed.filter(Boolean).length === safeCells) {
    score += CLEAR_POINTS;
    events.push({ kind: 'cleared', board: s.boardNumber, points: CLEAR_POINTS }, { kind: 'score', points: CLEAR_POINTS });
    return {
      ...s,
      score,
      combos: s.combos + (combo ? 1 : 0),
      events,
      boardNumber: s.boardNumber + 1,
      moles: null,
      revealed: fresh(),
      flagged: fresh(),
    };
  }
  return { ...s, score, combos: s.combos + (combo ? 1 : 0), events, revealed };
}

function flag(state: MolesState, cell: Cell): MolesState {
  const index = indexOf(cell);
  if (state.revealed[index]) return refused(state);
  const flagged = state.flagged.slice();
  flagged[index] = !flagged[index];
  return { ...state, flagged, events: [{ kind: 'flag', cell, flagged: flagged[index] }] };
}

function radar(state: MolesState): MolesState {
  // Refused (no use spent) before the first dig of the board, without uses, or when every mole is flagged.
  if (state.radarLeft <= 0 || !state.moles) return refused(state);
  const target = state.moles.find((m) => !state.flagged[m]);
  if (target === undefined) return refused(state);
  const flagged = state.flagged.slice();
  flagged[target] = true;
  return { ...state, flagged, radarLeft: state.radarLeft - 1, events: [{ kind: 'radar', cell: cellOf(target) }] };
}

export function reduceMoles(state: MolesState, action: MolesAction): MolesState {
  if (state.status !== 'playing') return refused(state);
  if (action.type === 'radar') return radar(state);
  if (!inBounds(action.cell)) return refused(state);
  return action.type === 'dig' ? dig(state, action.cell) : flag(state, action.cell);
}
