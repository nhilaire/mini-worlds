// « Réussite Express » (docs/PRD.md "Réussite Express", AC-101): a quick patience. Pure reducer on an immutable
// state, see src/game/contract.ts; time comes in through `tick`.
//
// Each deal is a fresh seeded shuffle of the 52 cards: 5 columns of 4 cards face up, 1 card on the pile, 15 cards in
// the stock (the 16 others are not used). Tap the bottom card of a column: it goes onto the pile when its rank is
// one above or one below the pile's card (ace and king are neighbours, suits do not matter). Tap the stock: its next
// card goes onto the pile and the streak is reset. A column card scores 10 + 5 × (streak − 1); a cleared board adds
// 200 and 10 per card left in the stock. A deal ends when the board is cleared, or when the stock is empty and no
// column card can be played. A round is 2 deals.
//
// « Joker » (upgrade `wild`, 1 / 2 / 3 per round): `wild` arms it (again: disarms it); the next column tap plays its
// bottom card whatever its rank.
//
// Input guard: a card moves in MOVE_MS; taps are ignored meanwhile (ms counter advanced by `tick`).
// Readings chosen (not in the PRD):
// - a finished deal stays on screen for DEAL_SHOW_MS (taps ignored), then the next deal comes or the round ends;
// - an armed joker is only spent when the tapped card is not a neighbour of the pile (a neighbour is played as
//   usual and the joker is disarmed, still owned); a joker card counts in the streak and scores like any other;
// - drawing keeps the joker armed;
// - a deal is not stuck while a joker is left: with an empty stock and no neighbour, the player must use it;
// - the streak starts again at 0 on every deal; a streak is a combo once, when it reaches 5.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { freshDeck, PlayingCard } from '../twentyone/engine';

export const PATIENCE_DEALS = 2;
export const PATIENCE_COLUMNS = 5;
export const COLUMN_CARDS = 4;
export const STOCK_CARDS = 15;
/** Points of a column card that starts a streak. */
export const CARD_POINTS = 10;
/** Added per card already in the streak. */
export const STREAK_STEP_POINTS = 5;
export const CLEAR_BONUS = 200;
/** Added per card left in the stock when the board is cleared. */
export const STOCK_CARD_BONUS = 10;
/** A streak reaching this length is a combo. */
export const COMBO_STREAK = 5;
/** A card moves this long; taps are ignored meanwhile. */
export const MOVE_MS = 150;
/** A finished deal stays shown this long (taps ignored) before the next one. */
export const DEAL_SHOW_MS = 900;

/** Points of the column card that makes the streak `streak` long (1 = first card after a draw). */
export function cardPoints(streak: number): number {
  return CARD_POINTS + STREAK_STEP_POINTS * (streak - 1);
}

/** Bonus of a cleared board with `stockLeft` cards still in the stock. */
export function clearBonus(stockLeft: number): number {
  return CLEAR_BONUS + STOCK_CARD_BONUS * stockLeft;
}

/** The best possible deal: the 20 column cards in one streak, no card drawn. */
export const PATIENCE_MAX_DEAL_SCORE =
  Array.from({ length: PATIENCE_COLUMNS * COLUMN_CARDS }, (_, i) => cardPoints(i + 1)).reduce((a, b) => a + b, 0) + clearBonus(STOCK_CARDS);
/** Maximum score of a round: 2 × 1 500 = 3 000. */
export const PATIENCE_MAX_SCORE = PATIENCE_DEALS * PATIENCE_MAX_DEAL_SCORE;

export type DealOutcome = 'cleared' | 'stuck';

export type PatienceEvent =
  /** A column card went onto the pile (`wild`: thanks to the joker). */
  | { kind: 'play'; column: number; card: PlayingCard; streak: number; points: number; wild: boolean }
  | { kind: 'draw'; card: PlayingCard }
  /** The tapped bottom card is not a neighbour of the pile: nothing moves. */
  | { kind: 'refused'; column: number }
  | { kind: 'wild'; armed: boolean }
  | { kind: 'cleared'; deal: number; bonus: number }
  | { kind: 'stuck'; deal: number }
  /** The next deal is on the table. */
  | { kind: 'deal'; deal: number }
  /** An input during the card move or the finished deal: nothing changes. */
  | { kind: 'ignored' };

/** Where the pile's card came from (the screen animates it). */
export type PatienceMove = { from: 'column'; column: number } | { from: 'stock' };

export type PatienceState = RoundState<PatienceEvent> & {
  /** Current deal, 1..2. */
  deal: number;
  /** The 5 columns, top card first: the last card of a column is its bottom card, the only one that can be played. */
  columns: readonly (readonly PlayingCard[])[];
  /** The card on top of the pile. */
  pile: PlayingCard;
  /** Cards left in the stock; the next one drawn is the first. */
  stock: readonly PlayingCard[];
  /** Column cards played in a row without drawing. */
  streak: number;
  wildsLeft: number;
  /** The next column tap plays its bottom card whatever its rank. */
  wildArmed: boolean;
  /** Time left of the card move (ms): inputs are ignored while > 0. */
  busyMs: number;
  /** Time left of the finished deal on screen (ms): inputs are ignored, then the next deal comes. */
  doneMs: number;
  /** How the current deal ended, null while it is played. */
  outcome: DealOutcome | null;
  /** The last move of the current deal, null before the first one. */
  lastMove: PatienceMove | null;
  rngState: number;
};

export type PatienceAction = { type: 'tapColumn'; column: number } | { type: 'draw' } | { type: 'wild' } | { type: 'tick'; dt: number };

/** One rank apart, the ace (1) and the king (13) being neighbours. */
export function isNeighbour(a: number, b: number): boolean {
  const gap = Math.abs(a - b);
  return gap === 1 || gap === 12;
}

/** The bottom card of a column, null when the column is empty. */
export function bottomCard(state: Pick<PatienceState, 'columns'>, column: number): PlayingCard | null {
  const cards = state.columns[column];
  return cards !== undefined && cards.length > 0 ? cards[cards.length - 1] : null;
}

/** Indexes of the columns whose bottom card is a neighbour of the pile (the joker apart), from left to right. */
export function playableColumns(state: Pick<PatienceState, 'columns' | 'pile'>): number[] {
  const out: number[] = [];
  for (let c = 0; c < state.columns.length; c++) {
    const card = bottomCard(state, c);
    if (card !== null && isNeighbour(card.rank, state.pile.rank)) out.push(c);
  }
  return out;
}

export function isCleared(state: Pick<PatienceState, 'columns'>): boolean {
  return state.columns.every((cards) => cards.length === 0);
}

/** Nothing left to do: empty stock, no neighbour at the bottom of a column, no joker left. */
export function isStuck(state: Pick<PatienceState, 'columns' | 'pile' | 'stock' | 'wildsLeft'>): boolean {
  return !isCleared(state) && state.stock.length === 0 && state.wildsLeft <= 0 && playableColumns(state).length === 0;
}

type Carried = Pick<PatienceState, 'score' | 'combos' | 'wildsLeft' | 'rngState'>;

/**
 * Lays deal `deal` from the given deck (tests pass a stacked deck): cards 0-19 fill the columns from left to right
 * (4 each, the 4th is the bottom card), card 20 is the pile, cards 21-35 the stock in drawing order.
 */
export function layDeal(base: Carried, deal: number, deck: readonly PlayingCard[]): PatienceState {
  const boardCards = PATIENCE_COLUMNS * COLUMN_CARDS;
  return {
    score: base.score,
    combos: base.combos,
    status: 'playing',
    events: [],
    deal,
    columns: Array.from({ length: PATIENCE_COLUMNS }, (_, c) => deck.slice(c * COLUMN_CARDS, (c + 1) * COLUMN_CARDS)),
    pile: deck[boardCards],
    stock: deck.slice(boardCards + 1, boardCards + 1 + STOCK_CARDS),
    streak: 0,
    wildsLeft: base.wildsLeft,
    wildArmed: false,
    busyMs: 0,
    doneMs: 0,
    outcome: null,
    lastMove: null,
    rngState: base.rngState,
  };
}

function startDeal(base: Carried, deal: number): PatienceState {
  const rng = createRng(base.rngState);
  const deck = rng.shuffle(freshDeck());
  return layDeal({ ...base, rngState: rng.state() }, deal, deck);
}

export function createPatience(seed: number, upgrades: UpgradeLevels = {}): PatienceState {
  return startDeal({ score: 0, combos: 0, wildsLeft: upgrades.wild ?? 0, rngState: seed >>> 0 }, 1);
}

/** After the finished deal's pause: the next deal, or the end of the round after deal 2. */
function nextDeal(state: PatienceState): PatienceState {
  if (state.deal >= PATIENCE_DEALS) return { ...state, doneMs: 0, busyMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
  const next = startDeal(state, state.deal + 1);
  return { ...next, events: [{ kind: 'deal', deal: next.deal }] };
}

type Events = PatienceState['events'][number][];

/** Ends the deal when the move just made cleared the board or left nothing to do. */
function afterMove(state: PatienceState, events: Events): PatienceState {
  if (isCleared(state)) {
    const bonus = clearBonus(state.stock.length);
    events.push({ kind: 'cleared', deal: state.deal, bonus }, { kind: 'score', points: bonus });
    return { ...state, score: state.score + bonus, outcome: 'cleared', wildArmed: false, doneMs: DEAL_SHOW_MS, events };
  }
  if (isStuck(state)) {
    events.push({ kind: 'stuck', deal: state.deal });
    return { ...state, outcome: 'stuck', wildArmed: false, doneMs: DEAL_SHOW_MS, events };
  }
  return { ...state, events };
}

function play(state: PatienceState, column: number, card: PlayingCard, wild: boolean): PatienceState {
  const streak = state.streak + 1;
  const points = cardPoints(streak);
  const events: Events = [{ kind: 'play', column, card, streak, points, wild }, { kind: 'score', points }];
  let combos = state.combos;
  if (streak === COMBO_STREAK) {
    combos += 1;
    events.push({ kind: 'combo' });
  }
  return afterMove(
    {
      ...state,
      columns: state.columns.map((cards, c) => (c === column ? cards.slice(0, -1) : cards)),
      pile: card,
      streak,
      score: state.score + points,
      combos,
      wildsLeft: state.wildsLeft - (wild ? 1 : 0),
      wildArmed: false,
      busyMs: MOVE_MS,
      lastMove: { from: 'column', column },
    },
    events,
  );
}

export function reducePatience(state: PatienceState, action: PatienceAction): PatienceState {
  const quiet = state.events.length === 0 ? state : { ...state, events: [] };
  if (state.status !== 'playing') return quiet;

  if (action.type === 'tick') {
    if (!(action.dt > 0) || (state.busyMs <= 0 && state.doneMs <= 0)) return quiet;
    const busyMs = Math.max(0, state.busyMs - action.dt);
    if (state.doneMs <= 0) return { ...state, busyMs, events: [] };
    const doneMs = Math.max(0, state.doneMs - action.dt);
    if (doneMs > 0) return { ...state, busyMs, doneMs, events: [] };
    return nextDeal(state);
  }

  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'wild') {
    // Refused when none is left.
    if (state.wildsLeft <= 0) return quiet;
    const wildArmed = !state.wildArmed;
    return { ...state, wildArmed, events: [{ kind: 'wild', armed: wildArmed }] };
  }

  if (action.type === 'draw') {
    if (state.stock.length === 0) return quiet;
    const [card, ...stock] = state.stock;
    return afterMove({ ...state, pile: card, stock, streak: 0, busyMs: MOVE_MS, lastMove: { from: 'stock' } }, [{ kind: 'draw', card }]);
  }

  const { column } = action;
  const card = Number.isInteger(column) ? bottomCard(state, column) : null;
  if (card === null) return quiet;
  const neighbour = isNeighbour(card.rank, state.pile.rank);
  if (!neighbour && !state.wildArmed) return { ...state, events: [{ kind: 'refused', column }] };
  return play(state, column, card, !neighbour);
}

/** True when an input is taken now (no card moving, no finished deal on show). */
export function acceptsInput(state: Pick<PatienceState, 'status' | 'busyMs' | 'doneMs'>): boolean {
  return state.status === 'playing' && state.busyMs <= 0 && state.doneMs <= 0;
}
