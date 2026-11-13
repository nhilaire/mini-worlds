// Chaussettes Perdues: a memory game of sock pairs (docs/PRD.md "Chaussettes Perdues", AC-64). Pure reducer on an
// immutable state, see src/game/contract.ts. Cards are laid out in 4 columns, index = row * 4 + col. Time never
// enters the engine: the screen dispatches `hide` 700 ms after a miss and `endPeek` when the « Coup d'œil » duration
// is over, both measured with the injectable clock.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng, type Rng } from '../rng';

export const SOCKS_COLS = 4;
/** Distinct sock sprites (src/art/games/socks.ts); a board holds at most this many pairs. */
export const SOCK_KINDS = 12;
export const MAX_MISSES = 8;
export const PAIR_POINTS = 100;
export const STREAK_POINTS = 50;
export const BOARD_POINTS = 200;
/** A miss stays visible this long before the screen dispatches `hide`. */
export const MISS_HIDE_MS = 700;
/** « Coup d'œil »: every card is shown this long per level at the start of each board. */
export const PEEK_MS_PER_LEVEL = 1000;

export type CardState = 'down' | 'up' | 'found';
export type SockCard = { sock: number; state: CardState };

export type SocksEvent =
  | { kind: 'flip'; index: number }
  | { kind: 'pair'; a: number; b: number; points: number; streak: number }
  | { kind: 'miss'; a: number; b: number }
  | { kind: 'hide'; a: number; b: number }
  | { kind: 'board'; board: number; points: number }
  | { kind: 'peek_end' };

export type SocksState = RoundState<SocksEvent> & {
  /** Board number, from 1. */
  board: number;
  cards: readonly SockCard[];
  /** Indices of the face-up cards not found yet (0, 1 or 2). */
  up: readonly number[];
  /** Two different socks are up: the next tap (or `hide`) turns them back down. */
  missPending: boolean;
  /** Pairs found in a row (carries over between boards, reset by a miss). */
  streak: number;
  misses: number;
  /** « Coup d'œil » duration of each board (0 without the upgrade). */
  peekMs: number;
  /** Every card is shown face up; inputs are ignored until `endPeek`. */
  peeking: boolean;
  rngState: number;
};

export type SocksAction = { type: 'flip'; index: number } | { type: 'hide' } | { type: 'endPeek' };

export function pairsForBoard(board: number): number {
  return Math.min(SOCK_KINDS, 6 + 2 * (board - 1));
}

export function rowsForBoard(board: number): number {
  return Math.ceil((pairsForBoard(board) * 2) / SOCKS_COLS);
}

function dealCards(rng: Rng, board: number): SockCard[] {
  const kinds = rng.shuffle(Array.from({ length: SOCK_KINDS }, (_, i) => i)).slice(0, pairsForBoard(board));
  return rng.shuffle([...kinds, ...kinds]).map((sock) => ({ sock, state: 'down' as const }));
}

export function createSocks(seed: number, upgrades: UpgradeLevels = {}): SocksState {
  const rng = createRng(seed);
  const peekMs = PEEK_MS_PER_LEVEL * (upgrades.peek ?? 0);
  return {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    board: 1,
    cards: dealCards(rng, 1),
    up: [],
    missPending: false,
    streak: 0,
    misses: 0,
    peekMs,
    peeking: peekMs > 0,
    rngState: rng.state(),
  };
}

/** Replaces the cards (tests craft exact boards with it); events are cleared. */
export function withCards(state: SocksState, socks: readonly number[]): SocksState {
  return { ...state, cards: socks.map((sock) => ({ sock, state: 'down' })), up: [], missPending: false, events: [] };
}

function hideMiss(state: SocksState): SocksState {
  const [a, b] = state.up;
  const cards = state.cards.map((card, i) => (i === a || i === b ? { ...card, state: 'down' as const } : card));
  return { ...state, cards, up: [], missPending: false, events: [{ kind: 'hide', a, b }] };
}

export function reduceSocks(state: SocksState, action: SocksAction): SocksState {
  const quiet = state.events.length === 0 ? state : { ...state, events: [] };
  if (state.status !== 'playing') return quiet;

  switch (action.type) {
    case 'endPeek':
      return state.peeking ? { ...state, peeking: false, events: [{ kind: 'peek_end' }] } : quiet;
    case 'hide':
      return state.missPending ? hideMiss(state) : quiet;
    case 'flip':
      break;
  }

  if (state.peeking) return quiet;
  // With a miss on the table, the tap only hides the two cards (it turns no card).
  if (state.missPending) return hideMiss(state);
  const { index } = action;
  const target = state.cards[index];
  if (!Number.isInteger(index) || !target || target.state !== 'down') return quiet;

  const cards = state.cards.map((card, i) => (i === index ? { ...card, state: 'up' as const } : card));
  const events: SocksState['events'][number][] = [{ kind: 'flip', index }];
  if (state.up.length === 0) return { ...state, cards, up: [index], events };

  const a = state.up[0];
  const b = index;
  if (cards[a].sock !== cards[b].sock) {
    const misses = state.misses + 1;
    events.push({ kind: 'miss', a, b });
    if (misses >= MAX_MISSES) {
      events.push({ kind: 'over', score: state.score });
      return { ...state, cards, up: [a, b], missPending: true, streak: 0, misses, status: 'over', events };
    }
    return { ...state, cards, up: [a, b], missPending: true, streak: 0, misses, events };
  }

  // A pair: 100 + 50 × the pairs found in a row just before it; every 3rd pair in a row is a combo.
  const points = PAIR_POINTS + STREAK_POINTS * state.streak;
  const streak = state.streak + 1;
  let score = state.score + points;
  let combos = state.combos;
  const found = cards.map((card, i) => (i === a || i === b ? { ...card, state: 'found' as const } : card));
  events.push({ kind: 'pair', a, b, points, streak }, { kind: 'score', points });
  if (streak % 3 === 0) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  if (found.some((card) => card.state !== 'found')) return { ...state, cards: found, up: [], streak, score, combos, events };

  // Board fully found: 200 more and the next board is dealt (with its peek).
  score += BOARD_POINTS;
  const board = state.board + 1;
  const rng = createRng(state.rngState);
  events.push({ kind: 'board', board, points: BOARD_POINTS }, { kind: 'score', points: BOARD_POINTS });
  return {
    ...state,
    board,
    cards: dealCards(rng, board),
    up: [],
    streak,
    score,
    combos,
    peeking: state.peekMs > 0,
    rngState: rng.state(),
    events,
  };
}
