// Casual bot of Suite de Cartes (docs/PRD.md, AC-86): puts the smallest misplaced card at its place, with a seeded
// 25 % chance of a useless swap instead (two cards of which neither lands at its place). No lookahead. It plays the
// real reducer (taps, then 50 ms ticks through the swap guard and the finished-row pause).
import { createRng } from '../rng';
import { acceptsInput, CardlineState, createCardline, placingSwap, reduceCardline } from './engine';

export const BOT_USELESS_CHANCE = 0.25;
const FRAME_MS = 50;

/** A random pair of indexes of which neither card lands at its place once swapped (null if none exists). */
function uselessSwap(cards: readonly number[], pick: (n: number) => number): [number, number] | null {
  const pairs: [number, number][] = [];
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) if (cards[b] !== a + 1 && cards[a] !== b + 1) pairs.push([a, b]);
  }
  return pairs.length > 0 ? pairs[pick(pairs.length)] : null;
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playCardlineBot(seed: number, botSeed = seed ^ 0x5bd1e995): CardlineState {
  const rng = createRng(botSeed);
  let state = createCardline(seed);
  for (let step = 0; step < 10_000 && state.status === 'playing'; step++) {
    if (!acceptsInput(state)) {
      state = reduceCardline(state, { type: 'tick', dt: FRAME_MS });
      continue;
    }
    const placing = placingSwap(state.cards) as [number, number];
    const pair = rng.next() < BOT_USELESS_CHANCE ? (uselessSwap(state.cards, rng.int) ?? placing) : placing;
    state = reduceCardline(state, { type: 'tap', index: pair[0] });
    state = reduceCardline(state, { type: 'tap', index: pair[1] });
  }
  return state;
}
