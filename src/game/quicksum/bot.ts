// Casual bot of « Calcul Éclair » (docs/PRD.md, AC-86): a simple policy used by the balance test. It gives a right
// answer every 2.5 s of the round timer; 1 time in 5 (seeded) it first taps a wrong answer on that question (−5 s, the
// streak returns to 0), then the right one. Reading chosen: « right answer every 2.5 s, a wrong one 1 time in 5 »
// means one right answer per 2.5 s, with a wrong tap before it on one question in five.
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { createQuickSum, QuickSumState, reduceQuickSum, rightIndex } from './engine';

export const BOT_ANSWER_MS = 2500;
export const BOT_WRONG_RATE = 0.2;
const TICK_MS = 50;

/** Plays a whole round with the casual policy; returns the final state. */
export function playQuickSumBot(seed: number, upgrades: UpgradeLevels = {}): QuickSumState {
  const rng = createRng((seed ^ 0x85ebca6b) >>> 0);
  let state = createQuickSum(seed, upgrades);
  let untilAnswer = BOT_ANSWER_MS;
  while (state.status === 'playing') {
    state = reduceQuickSum(state, { type: 'tick', dt: TICK_MS });
    untilAnswer -= TICK_MS;
    if (state.status !== 'playing' || untilAnswer > 0) continue;
    untilAnswer += BOT_ANSWER_MS;
    const right = rightIndex(state);
    if (rng.next() < BOT_WRONG_RATE) {
      state = reduceQuickSum(state, { type: 'answer', index: (right + 1 + rng.int(3)) % 4 });
      if (state.status !== 'playing') break;
    }
    state = reduceQuickSum(state, { type: 'answer', index: right });
  }
  return state;
}
