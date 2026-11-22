// Casual bot of Mains de Cartes (docs/PRD.md, AC-108). Policy, no lookahead and no odds: a straight or better is
// kept whole; else the cards of a pair, two pairs or a brelan are kept; else four cards of one suit; else the highest
// card alone (the ace is the highest). With a seeded 25 % chance per hand it makes a poor choice instead: it keeps
// one card picked at random and exchanges the four others, whatever it held. It plays the real reducer (taps on the
// cards, « Échanger » or « Garder », then 50 ms ticks through the exchange guard and the result pause) and never
// uses « Seconde donne » (it plays without upgrades).
import { createRng } from '../rng';
import type { PlayingCard } from '../twentyone/engine';
import { acceptsInput, createHands, evaluateHand, HandsState, reduceHands, STRAIGHT_POINTS } from './engine';

export const BOT_POOR_CHANCE = 0.25;
const FRAME_MS = 50;

/** Ace high: the ace beats the king when the bot keeps its highest card. */
const height = (card: PlayingCard) => (card.rank === 1 ? 14 : card.rank);

/** The cards the policy keeps (true = kept), by place. */
export function botKeeps(cards: readonly PlayingCard[]): boolean[] {
  if (evaluateHand(cards).points >= STRAIGHT_POINTS) return cards.map(() => true);
  const sameRank = cards.map((card) => cards.filter((other) => other.rank === card.rank).length > 1);
  if (sameRank.some((k) => k)) return sameRank;
  const sameSuit = cards.map((card) => cards.filter((other) => other.suit === card.suit).length === 4);
  if (sameSuit.some((k) => k)) return sameSuit;
  const highest = cards.reduce((best, card, i) => (height(card) > height(cards[best]) ? i : best), 0);
  return cards.map((_, i) => i === highest);
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playHandsBot(seed: number, botSeed = seed ^ 0x5bd1e995): HandsState {
  const rng = createRng(botSeed);
  let state = createHands(seed);
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      state = reduceHands(state, { type: 'tick', dt: FRAME_MS });
      continue;
    }
    if (state.exchanges > 0) {
      state = reduceHands(state, { type: 'keep' });
      continue;
    }
    let keeps = botKeeps(state.cards);
    if (rng.next() < BOT_POOR_CHANCE) {
      const only = rng.int(state.cards.length);
      keeps = state.cards.map((_, i) => i === only);
    }
    for (let i = 0; i < keeps.length; i++) if (keeps[i] !== state.kept[i]) state = reduceHands(state, { type: 'toggle', index: i });
    state = reduceHands(state, { type: keeps.every((k) => k) ? 'keep' : 'swap' });
  }
  return state;
}
