// Vingt-et-Un: a points-only card game against the dealer (docs/PRD.md "Vingt-et-Un", AC-65). Pure reducer on an
// immutable state, see src/game/contract.ts. No bet and no money anywhere: a hand only scores points.
// Each hand uses a fresh 52-card deck shuffled with the seeded rng; cards are drawn from the front of the deck:
// player, dealer (up), player, dealer (hole), then every hit and every dealer draw.

import type { RoundState, UpgradeLevels } from '../contract';
import { createRng } from '../rng';

export const BASE_HANDS = 10;
export const DEALER_STANDS_ON = 17;
export const BLACKJACK_POINTS = 150;
export const BLACKJACK_PUSH_POINTS = 25;
export const WIN_POINTS = 100;
export const PUSH_POINTS = 25;

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
/** rank 1 = ace, 11-13 = figures (jack, queen, king). */
export type PlayingCard = { rank: number; suit: Suit };

/**
 * blackjack: 21 with the first two cards (150); blackjack_push: both have it (25); win: higher total or dealer
 * over 21 (100); push: equal totals (25); lose: lower total (0); bust: the player went over 21 (0).
 */
export type Outcome = 'blackjack' | 'blackjack_push' | 'win' | 'push' | 'lose' | 'bust';

export const OUTCOME_POINTS: Readonly<Record<Outcome, number>> = {
  blackjack: BLACKJACK_POINTS,
  blackjack_push: BLACKJACK_PUSH_POINTS,
  win: WIN_POINTS,
  push: PUSH_POINTS,
  lose: 0,
  bust: 0,
};

export type TwentyOneEvent =
  | { kind: 'deal'; hand: number }
  | { kind: 'hit'; card: PlayingCard }
  | { kind: 'reveal'; drawn: number }
  | { kind: 'settle'; outcome: Outcome; points: number };

export type TwentyOneState = RoundState<TwentyOneEvent> & {
  /** Current hand, from 1. */
  hand: number;
  hands: number;
  player: readonly PlayingCard[];
  dealer: readonly PlayingCard[];
  /** The dealer's second card is face down. */
  holeHidden: boolean;
  /** Cards left in this hand's deck. */
  deck: readonly PlayingCard[];
  /** null while the player decides; set once the hand is over. */
  outcome: Outcome | null;
  /** Hands won in a row (blackjack or win). */
  winStreak: number;
  rngState: number;
};

export type TwentyOneAction = { type: 'hit' } | { type: 'stand' } | { type: 'next' };

export function cardValue(card: PlayingCard): number {
  return card.rank >= 10 ? 10 : card.rank;
}

/** Best total: aces count 1, one of them counts 11 when that does not go over 21. */
export function handTotal(cards: readonly PlayingCard[]): number {
  const hard = cards.reduce((sum, card) => sum + cardValue(card), 0);
  return cards.some((card) => card.rank === 1) && hard + 10 <= 21 ? hard + 10 : hard;
}

export function isBlackjack(cards: readonly PlayingCard[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

export function freshDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  return deck;
}

/** The dealer draws until 17 or more (it stands on every 17, a soft one included). */
export function dealerPlay(dealer: readonly PlayingCard[], deck: readonly PlayingCard[]): { dealer: PlayingCard[]; deck: PlayingCard[] } {
  const hand = dealer.slice();
  const rest = deck.slice();
  while (handTotal(hand) < DEALER_STANDS_ON && rest.length > 0) hand.push(rest.shift() as PlayingCard);
  return { dealer: hand, deck: rest };
}

function settle(state: TwentyOneState, outcome: Outcome, extra: Partial<TwentyOneState>): TwentyOneState {
  const points = OUTCOME_POINTS[outcome];
  const won = outcome === 'blackjack' || outcome === 'win';
  // Every 3rd hand won in a row is a combo; a tie or a loss breaks the run.
  const winStreak = won ? state.winStreak + 1 : 0;
  const combo = won && winStreak % 3 === 0;
  const score = state.score + points;
  const events: TwentyOneState['events'][number][] = [{ kind: 'settle', outcome, points }];
  if (points > 0) events.push({ kind: 'score', points });
  if (combo) events.push({ kind: 'combo' });
  const last = state.hand >= state.hands;
  if (last) events.push({ kind: 'over', score });
  return {
    ...state,
    ...extra,
    outcome,
    holeHidden: false,
    winStreak,
    score,
    combos: state.combos + (combo ? 1 : 0),
    status: last ? 'over' : 'playing',
    events: [...(extra.events ?? []), ...events],
  };
}

/**
 * Deals hand `hand` from the given deck (tests pass a stacked deck). A player 21 with the first two cards settles
 * at once against the dealer's two cards; otherwise the player decides.
 */
export function dealHand(base: TwentyOneState, hand: number, deck: readonly PlayingCard[]): TwentyOneState {
  const [p1, d1, p2, d2, ...rest] = deck;
  const dealt: TwentyOneState = {
    ...base,
    hand,
    player: [p1, p2],
    dealer: [d1, d2],
    holeHidden: true,
    deck: rest,
    outcome: null,
    events: [{ kind: 'deal', hand }],
  };
  if (!isBlackjack(dealt.player)) return dealt;
  return settle(dealt, isBlackjack(dealt.dealer) ? 'blackjack_push' : 'blackjack', { events: dealt.events });
}

function shuffledDeck(rngState: number): { deck: PlayingCard[]; rngState: number } {
  const rng = createRng(rngState);
  const deck = rng.shuffle(freshDeck());
  return { deck, rngState: rng.state() };
}

export function createTwentyOne(seed: number, upgrades: UpgradeLevels = {}): TwentyOneState {
  const { deck, rngState } = shuffledDeck(seed);
  const base: TwentyOneState = {
    score: 0,
    combos: 0,
    status: 'playing',
    events: [],
    hand: 1,
    hands: BASE_HANDS + (upgrades.extra_hand ?? 0),
    player: [],
    dealer: [],
    holeHidden: true,
    deck: [],
    outcome: null,
    winStreak: 0,
    rngState,
  };
  return dealHand(base, 1, deck);
}

export function reduceTwentyOne(state: TwentyOneState, action: TwentyOneAction): TwentyOneState {
  const quiet = state.events.length === 0 ? state : { ...state, events: [] };
  if (state.status !== 'playing') return quiet;

  if (action.type === 'next') {
    if (state.outcome === null) return quiet;
    const { deck, rngState } = shuffledDeck(state.rngState);
    return dealHand({ ...state, rngState }, state.hand + 1, deck);
  }
  if (state.outcome !== null) return quiet;

  if (action.type === 'hit') {
    const [card, ...rest] = state.deck;
    const player = [...state.player, card];
    const hit: TwentyOneState['events'][number][] = [{ kind: 'hit', card }];
    // Over 21: the hand is lost at once (the dealer does not play).
    if (handTotal(player) > 21) return settle(state, 'bust', { player, deck: rest, events: hit });
    return { ...state, player, deck: rest, events: hit };
  }

  // Rester: the dealer shows its card and draws to 17; a dealer over 21 is a won hand, else the higher total wins.
  const { dealer, deck } = dealerPlay(state.dealer, state.deck);
  const reveal: TwentyOneState['events'][number][] = [{ kind: 'reveal', drawn: dealer.length - state.dealer.length }];
  const mine = handTotal(state.player);
  const theirs = handTotal(dealer);
  const outcome: Outcome = theirs > 21 || mine > theirs ? 'win' : mine === theirs ? 'push' : 'lose';
  return settle(state, outcome, { dealer, deck, events: reveal });
}
