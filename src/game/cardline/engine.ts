// « Suite de Cartes » (docs/PRD.md "Suite de Cartes", AC-78): sort a row of n cards (values 1..n) in ascending order
// by swapping two cards. Pure reducer on an immutable state, see src/game/contract.ts; time comes in through `tick`.
//
// A round is 5 rows of 5, 6, 7, 8, 9 cards. Tap a card to select it, tap another to swap them (tap the selected card
// again to unselect). Par = minimum number of swaps = n − number of cycles of the permutation. Row score:
// max(50, 200 − 20 × swaps beyond par); a row still unsorted after par + 10 swaps is failed (0 points).
//
// Input guard: a swap animates in SWAP_MS; taps and hints are ignored meanwhile (ms counter advanced by `tick`).
// Reading chosen (not in the PRD, which only states the 200 ms guard): a sorted or failed row stays on screen for
// ROW_SHOW_MS (taps ignored) so that the player sees the last swap land, then the next row comes, like the solved
// Plombier grid of v0.3.0.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const CARDLINE_ROWS = 5;
/** Cards of row k (1..5): 4 + k, i.e. 5 to 9. */
export const rowLength = (row: number) => 4 + row;
/** Swaps beyond par after which an unsorted row is failed. */
export const CARDLINE_FAIL_AFTER = 10;
/** A swap animates this long; taps are ignored meanwhile. */
export const SWAP_MS = 200;
/** A finished row stays shown this long (taps ignored) before the next one. */
export const ROW_SHOW_MS = 600;
/** Seeded shuffles tried before the fallback (a rotation by one, never sorted). */
export const SHUFFLE_ATTEMPTS = 20;

export type CardlineEvent =
  | { kind: 'select'; index: number }
  | { kind: 'unselect'; index: number }
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'sorted'; row: number; swaps: number; par: number; points: number }
  | { kind: 'failed'; row: number }
  /** The next row is on the table. */
  | { kind: 'row'; row: number }
  | { kind: 'hint'; a: number; b: number }
  /** A tap or a hint during the swap animation or the finished row: nothing changes. */
  | { kind: 'ignored' };

export type CardlineState = RoundState<CardlineEvent> & {
  /** Current row, 1..5. */
  row: number;
  /** Card values from left to right (a permutation of 1..n). */
  cards: readonly number[];
  par: number;
  /** Swaps made on the current row (hints are not swaps). */
  swaps: number;
  /** Index of the selected card, or null. */
  selected: number | null;
  hintsLeft: number;
  /** The swap highlighted by the last hint (two indexes), null when none is shown. */
  hint: readonly [number, number] | null;
  /** Time left of the swap animation (ms): taps are ignored while > 0. */
  busyMs: number;
  /** Time left of the finished row on screen (ms): taps are ignored, then the next row comes. */
  doneMs: number;
  /** The last swap of the current row (the screen animates it), null before the first one. */
  lastSwap: readonly [number, number] | null;
  rngState: number;
};

export type CardlineAction = { type: 'tap'; index: number } | { type: 'hint' } | { type: 'tick'; dt: number };

export function rowScore(swaps: number, par: number): number {
  return Math.max(50, 200 - 20 * Math.max(0, swaps - par));
}

export function isSorted(cards: readonly number[]): boolean {
  return cards.every((v, i) => v === i + 1);
}

/** Number of cycles of the permutation (a card at its place is a cycle of one). */
export function cycles(cards: readonly number[]): number {
  const seen = new Array<boolean>(cards.length).fill(false);
  let count = 0;
  for (let i = 0; i < cards.length; i++) {
    if (seen[i]) continue;
    count += 1;
    for (let j = i; !seen[j]; j = cards[j] - 1) seen[j] = true;
  }
  return count;
}

/** Minimum number of swaps that sort the row: n − cycles. */
export function minSwaps(cards: readonly number[]): number {
  return cards.length - cycles(cards);
}

/** Seeded shuffle of 1..n that is never sorted: up to SHUFFLE_ATTEMPTS shuffles, then a rotation by one. */
export function dealRow(n: number, rngState: number, attempts = SHUFFLE_ATTEMPTS): { cards: number[]; rngState: number } {
  const rng = createRng(rngState);
  const sorted = Array.from({ length: n }, (_, i) => i + 1);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const cards = rng.shuffle(sorted);
    if (!isSorted(cards)) return { cards, rngState: rng.state() };
  }
  return { cards: [...sorted.slice(1), sorted[0]], rngState: rng.state() };
}

/**
 * The swap that puts the smallest misplaced card at its place: [index where it lies, its place], null when sorted.
 * Used by the hint and by the casual bot.
 */
export function placingSwap(cards: readonly number[]): [number, number] | null {
  const place = cards.findIndex((v, i) => v !== i + 1);
  if (place < 0) return null;
  return [cards.indexOf(place + 1), place];
}

type Carried = Pick<CardlineState, 'score' | 'combos' | 'hintsLeft' | 'rngState'>;

function startRow(state: Carried, row: number): CardlineState {
  const dealt = dealRow(rowLength(row), state.rngState);
  return {
    score: state.score,
    combos: state.combos,
    status: 'playing',
    events: [],
    row,
    cards: dealt.cards,
    par: minSwaps(dealt.cards),
    swaps: 0,
    selected: null,
    hintsLeft: state.hintsLeft,
    hint: null,
    busyMs: 0,
    doneMs: 0,
    lastSwap: null,
    rngState: dealt.rngState,
  };
}

export function createCardline(seed: number, upgrades: UpgradeLevels = {}): CardlineState {
  return startRow({ score: 0, combos: 0, hintsLeft: upgrades.hint ?? 0, rngState: seed >>> 0 }, 1);
}

/** After the finished row's pause: the next row, or the end of the round after row 5. */
function nextRow(state: CardlineState): CardlineState {
  if (state.row >= CARDLINE_ROWS) return { ...state, doneMs: 0, busyMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
  const next = startRow(state, state.row + 1);
  return { ...next, events: [{ kind: 'row', row: next.row }] };
}

function swap(state: CardlineState, a: number, b: number): CardlineState {
  const cards = state.cards.slice();
  [cards[a], cards[b]] = [cards[b], cards[a]];
  const swaps = state.swaps + 1;
  const events: CardlineState['events'][number][] = [{ kind: 'swap', a, b }];
  const base: CardlineState = { ...state, cards, swaps, selected: null, hint: null, busyMs: SWAP_MS, lastSwap: [a, b] };
  if (isSorted(cards)) {
    const points = rowScore(swaps, state.par);
    events.push({ kind: 'sorted', row: state.row, swaps, par: state.par, points }, { kind: 'score', points });
    let combos = state.combos;
    if (swaps <= state.par) {
      combos += 1;
      events.push({ kind: 'combo' });
    }
    return { ...base, score: state.score + points, combos, doneMs: ROW_SHOW_MS, events };
  }
  if (swaps >= state.par + CARDLINE_FAIL_AFTER) {
    events.push({ kind: 'failed', row: state.row });
    return { ...base, doneMs: ROW_SHOW_MS, events };
  }
  return { ...base, events };
}

export function reduceCardline(state: CardlineState, action: CardlineAction): CardlineState {
  if (state.status !== 'playing') return state.events.length === 0 ? state : { ...state, events: [] };

  if (action.type === 'tick') {
    if (!(action.dt > 0) || (state.busyMs <= 0 && state.doneMs <= 0)) return state.events.length === 0 ? state : { ...state, events: [] };
    const busyMs = Math.max(0, state.busyMs - action.dt);
    if (state.doneMs <= 0) return { ...state, busyMs, events: [] };
    const doneMs = Math.max(0, state.doneMs - action.dt);
    if (doneMs > 0) return { ...state, busyMs, doneMs, events: [] };
    return nextRow(state);
  }

  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'hint') {
    // Refused when none is left or one is already shown.
    const pair = placingSwap(state.cards);
    if (state.hintsLeft <= 0 || state.hint !== null || pair === null) return { ...state, events: [] };
    return { ...state, hintsLeft: state.hintsLeft - 1, hint: pair, events: [{ kind: 'hint', a: pair[0], b: pair[1] }] };
  }

  const { index } = action;
  if (!Number.isInteger(index) || index < 0 || index >= state.cards.length) return { ...state, events: [] };
  if (state.selected === null) return { ...state, selected: index, events: [{ kind: 'select', index }] };
  if (state.selected === index) return { ...state, selected: null, events: [{ kind: 'unselect', index }] };
  return swap(state, state.selected, index);
}

/** True when a tap is taken now (no swap animation, no finished row on show). */
export function acceptsInput(state: Pick<CardlineState, 'status' | 'busyMs' | 'doneMs'>): boolean {
  return state.status === 'playing' && state.busyMs <= 0 && state.doneMs <= 0;
}
