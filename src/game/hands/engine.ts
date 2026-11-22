// « Mains de Cartes » (docs/PRD.md "Mains de Cartes", AC-100): eight hands of five cards; keep the best cards,
// exchange the others once, and the hand scores its best combination. Pure reducer on an immutable state, see
// src/game/contract.ts; time comes in through `tick`. No bet and no money anywhere: a hand only scores points.
//
// Each hand uses a fresh 52-card deck shuffled with the seeded rng; the five cards come from the front of the deck
// and so does every replacement card, from the leftmost replaced place to the rightmost.
//
// Input guard: an exchange animates in EXCHANGE_MS, then the scored hand stays on screen for RESULT_MS; taps and
// buttons are ignored meanwhile (ms counter advanced by `tick`).
//
// Readings chosen (the PRD is silent):
// - The hand is scored when the exchange animation ends (after « Garder »: at once), then shown for RESULT_MS.
// - « Seconde donne »: while second exchanges are left in the round, the hand is not scored after its first
//   exchange; the player picks the cards to keep again, then « Seconde donne » (uses one) or « Garder ». The cards
//   kept before the first exchange stay kept until the player releases them.
// - « Échanger » with the five cards kept replaces nothing and is refused (« Garder » is the button for that).
// - A straight needs five ranks in a row; the ace ends it on either side (A-2-3-4-5, 10-J-Q-K-A), never in the
//   middle (Q-K-A-2-3 is nothing).

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { freshDeck, type PlayingCard } from '../twentyone/engine';

export const HANDS_PER_ROUND = 8;
export const HAND_SIZE = 5;
/** An exchange animates this long; taps are ignored meanwhile. */
export const EXCHANGE_MS = 300;
/** The scored hand stays shown this long (taps ignored) before the next one. */
export const RESULT_MS = 900;

export const PAIR_POINTS = 20;
export const TWO_PAIRS_POINTS = 40;
export const THREE_POINTS = 70;
export const STRAIGHT_POINTS = 110;
export const FLUSH_POINTS = 130;
export const FULL_HOUSE_POINTS = 170;
export const FOUR_POINTS = 260;
export const STRAIGHT_FLUSH_POINTS = 500;
/** A hand worth this much or more (a brelan or better) is a combo. */
export const COMBO_MIN_POINTS = THREE_POINTS;
/** Eight straight flushes. */
export const MAX_SCORE = HANDS_PER_ROUND * STRAIGHT_FLUSH_POINTS;

export type Combination = 'pair' | 'twoPairs' | 'three' | 'straight' | 'flush' | 'fullHouse' | 'four' | 'straightFlush' | 'nothing';

export const COMBINATION_POINTS: Readonly<Record<Combination, number>> = {
  nothing: 0,
  pair: PAIR_POINTS,
  twoPairs: TWO_PAIRS_POINTS,
  three: THREE_POINTS,
  straight: STRAIGHT_POINTS,
  flush: FLUSH_POINTS,
  fullHouse: FULL_HOUSE_POINTS,
  four: FOUR_POINTS,
  straightFlush: STRAIGHT_FLUSH_POINTS,
};

export type HandValue = { combination: Combination; points: number };

/**
 * choose: the player picks the cards to keep; exchange: the replaced cards are coming in (EXCHANGE_MS);
 * result: the scored hand is on show (RESULT_MS).
 */
export type HandsPhase = 'choose' | 'exchange' | 'result';

export type HandsEvent =
  | { kind: 'deal'; hand: number }
  | { kind: 'toggle'; index: number; kept: boolean }
  /** The cards at these places were replaced; `second` for a « Seconde donne ». */
  | { kind: 'exchange'; replaced: readonly number[]; second: boolean }
  | { kind: 'settle'; combination: Combination; points: number }
  /** A tap or a button during the exchange animation or the result: nothing changes. */
  | { kind: 'ignored' };

export type HandsState = RoundState<HandsEvent> & {
  /** Current hand, from 1. */
  hand: number;
  hands: number;
  /** The five cards held, from left to right. */
  cards: readonly PlayingCard[];
  /** kept[i]: the card at place i stays at the next exchange. */
  kept: readonly boolean[];
  /** Cards left in this hand's deck. */
  deck: readonly PlayingCard[];
  phase: HandsPhase;
  /** Exchanges made on this hand (0, 1, or 2 with « Seconde donne »). */
  exchanges: number;
  /** Second exchanges left in the round (« Seconde donne » level at the start). */
  redrawsLeft: number;
  /** Time left of the exchange animation or of the result on screen (ms): taps are ignored while > 0. */
  waitMs: number;
  /** Places replaced by the last exchange of this hand (the screen animates them). */
  replaced: readonly number[];
  /** The scored combination, null until the hand is settled. */
  result: HandValue | null;
  rngState: number;
};

export type HandsAction =
  | { type: 'toggle'; index: number }
  | { type: 'swap' }
  | { type: 'keep' }
  | { type: 'redraw' }
  | { type: 'tick'; dt: number };

const ACE_HIGH_STRAIGHT = [1, 10, 11, 12, 13];

/** Five different ranks in a row; the ace is low (A-2-3-4-5) or high (10-J-Q-K-A). */
export function isStraight(cards: readonly PlayingCard[]): boolean {
  if (cards.length !== HAND_SIZE) return false;
  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  if (new Set(ranks).size !== HAND_SIZE) return false;
  return ranks[HAND_SIZE - 1] - ranks[0] === HAND_SIZE - 1 || ranks.every((rank, i) => rank === ACE_HIGH_STRAIGHT[i]);
}

/** Five cards of one suit. */
export function isFlush(cards: readonly PlayingCard[]): boolean {
  return cards.length === HAND_SIZE && cards.every((card) => card.suit === cards[0].suit);
}

/** The best combination of the cards and its points (the order of the cards does not matter). */
export function evaluateHand(cards: readonly PlayingCard[]): HandValue {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  // Sizes of the groups of equal ranks, largest first: [4, 1], [3, 2], [2, 2, 1]...
  const groups = [...counts.values()].sort((a, b) => b - a);
  const straight = isStraight(cards);
  const flush = isFlush(cards);
  let combination: Combination = 'nothing';
  if (straight && flush) combination = 'straightFlush';
  else if (groups[0] === 4) combination = 'four';
  else if (groups[0] === 3 && groups[1] === 2) combination = 'fullHouse';
  else if (flush) combination = 'flush';
  else if (straight) combination = 'straight';
  else if (groups[0] === 3) combination = 'three';
  else if (groups[0] === 2 && groups[1] === 2) combination = 'twoPairs';
  else if (groups[0] === 2) combination = 'pair';
  return { combination, points: COMBINATION_POINTS[combination] };
}

/** True when a tap or a button is taken now (no exchange animation, no result on show). */
export function acceptsInput(state: Pick<HandsState, 'status' | 'phase'>): boolean {
  return state.status === 'playing' && state.phase === 'choose';
}

/** True when « Seconde donne » can be played now: one exchange made on this hand and a second exchange left. */
export function canRedraw(state: Pick<HandsState, 'status' | 'phase' | 'exchanges' | 'redrawsLeft'>): boolean {
  return acceptsInput(state) && state.exchanges === 1 && state.redrawsLeft > 0;
}

/** Deals hand `hand` from the given deck (tests pass a stacked deck): its first five cards, nothing kept. */
export function dealHand(base: HandsState, hand: number, deck: readonly PlayingCard[]): HandsState {
  return {
    ...base,
    hand,
    cards: deck.slice(0, HAND_SIZE),
    kept: new Array<boolean>(HAND_SIZE).fill(false),
    deck: deck.slice(HAND_SIZE),
    phase: 'choose',
    exchanges: 0,
    waitMs: 0,
    replaced: [],
    result: null,
    events: [{ kind: 'deal', hand }],
  };
}

function shuffledDeck(rngState: number): { deck: PlayingCard[]; rngState: number } {
  const rng = createRng(rngState);
  const deck = rng.shuffle(freshDeck());
  return { deck, rngState: rng.state() };
}

export function createHands(seed: number, upgrades: UpgradeLevels = {}): HandsState {
  const { deck, rngState } = shuffledDeck(seed);
  const base: HandsState = {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    hand: 1,
    hands: HANDS_PER_ROUND,
    cards: [],
    kept: [],
    deck: [],
    phase: 'choose',
    exchanges: 0,
    redrawsLeft: upgrades.redraw ?? 0,
    waitMs: 0,
    replaced: [],
    result: null,
    rngState,
  };
  return dealHand(base, 1, deck);
}

/** Scores the cards held and puts the hand on show for RESULT_MS. */
function settle(state: HandsState): HandsState {
  const result = evaluateHand(state.cards);
  const events: HandsState['events'][number][] = [{ kind: 'settle', combination: result.combination, points: result.points }];
  if (result.points > 0) events.push({ kind: 'score', points: result.points });
  const combo = result.points >= COMBO_MIN_POINTS;
  if (combo) events.push({ kind: 'combo' });
  return { ...state, phase: 'result', waitMs: RESULT_MS, result, score: state.score + result.points, combos: state.combos + (combo ? 1 : 0), events };
}

/** Replaces the cards not kept with the next cards of the deck, from left to right. */
function exchange(state: HandsState, second: boolean): HandsState {
  const deck = state.deck.slice();
  const replaced: number[] = [];
  const cards = state.cards.map((card, i) => {
    if (state.kept[i]) return card;
    replaced.push(i);
    return deck.shift() as PlayingCard;
  });
  return {
    ...state,
    cards,
    deck,
    replaced,
    phase: 'exchange',
    waitMs: EXCHANGE_MS,
    exchanges: state.exchanges + 1,
    redrawsLeft: state.redrawsLeft - (second ? 1 : 0),
    events: [{ kind: 'exchange', replaced, second }],
  };
}

/** After the result's pause: the next hand from a fresh shuffle, or the end of the round after the last one. */
function nextHand(state: HandsState): HandsState {
  if (state.hand >= state.hands) return { ...state, waitMs: 0, status: 'over', events: [{ kind: 'over', score: state.score }] };
  const { deck, rngState } = shuffledDeck(state.rngState);
  return dealHand({ ...state, rngState }, state.hand + 1, deck);
}

export function reduceHands(state: HandsState, action: HandsAction): HandsState {
  const quiet = state.events.length === 0 ? state : { ...state, events: [] };
  if (state.status !== 'playing') return quiet;

  if (action.type === 'tick') {
    if (!(action.dt > 0) || state.phase === 'choose') return quiet;
    const waitMs = Math.max(0, state.waitMs - action.dt);
    if (waitMs > 0) return { ...state, waitMs, events: [] };
    if (state.phase === 'result') return nextHand(state);
    // The exchanged cards have landed: with a second exchange left the player decides again, else the hand scores.
    if (state.exchanges === 1 && state.redrawsLeft > 0) return { ...state, phase: 'choose', waitMs: 0, events: [] };
    return settle({ ...state, waitMs: 0 });
  }

  if (!acceptsInput(state)) return { ...state, events: [{ kind: 'ignored' }] };

  if (action.type === 'toggle') {
    const { index } = action;
    if (!Number.isInteger(index) || index < 0 || index >= state.cards.length) return quiet;
    const kept = state.kept.map((k, i) => (i === index ? !k : k));
    return { ...state, kept, events: [{ kind: 'toggle', index, kept: kept[index] }] };
  }
  if (action.type === 'keep') return settle(state);

  // « Échanger » is the first exchange of the hand, « Seconde donne » the second one; nothing to replace: refused.
  const allowed = action.type === 'swap' ? state.exchanges === 0 : canRedraw(state);
  if (!allowed || state.kept.every((k) => k)) return quiet;
  return exchange(state, action.type === 'redraw');
}
