// Casual bot of « Suite Logique » (docs/PRD.md, AC-108): a simple policy used by the balance test. It thinks about
// each question for a time that grows with the level (± 20 %, seeded), then answers: right with a probability that
// decreases with the level, else one of the three wrong answers (seeded; −3 s, the streak returns to 0). The thinking
// time starts when the question appears, so it covers the 250 ms during which the previous answer is shown.
import type { UpgradeLevels } from '../contract';
import { createRng, Rng } from '../rng';
import { ANSWERS, createPattern, levelNow, PatternState, reducePattern, rightIndex } from './engine';

/** Thinking time per question at levels 1 to 5 (ms). */
export const BOT_THINK_MS = [1500, 2200, 2800, 3500, 4200] as const;
/** The thinking time varies by ± this share. */
export const BOT_THINK_JITTER = 0.2;
/** Probability of a right answer at levels 1 to 5. */
export const BOT_RIGHT_RATE = [0.95, 0.9, 0.85, 0.75, 0.7] as const;
const TICK_MS = 50;

function thinkingTime(level: number, rng: Rng): number {
  return BOT_THINK_MS[level - 1] * (1 - BOT_THINK_JITTER + 2 * BOT_THINK_JITTER * rng.next());
}

/** Plays a whole round with the casual policy; returns the final state. */
export function playPatternBot(seed: number, upgrades: UpgradeLevels = {}): PatternState {
  const rng = createRng((seed ^ 0x85ebca6b) >>> 0);
  let state = createPattern(seed, upgrades);
  let untilAnswer = thinkingTime(levelNow(state), rng);
  while (state.status === 'playing') {
    state = reducePattern(state, { type: 'tick', dt: TICK_MS });
    untilAnswer -= TICK_MS;
    if (state.status !== 'playing' || untilAnswer > 0 || state.guardMs > 0) continue;
    const right = rightIndex(state);
    const index = rng.next() < BOT_RIGHT_RATE[levelNow(state) - 1] ? right : (right + 1 + rng.int(ANSWERS - 1)) % ANSWERS;
    state = reducePattern(state, { type: 'answer', index });
    if (state.status === 'playing') untilAnswer = thinkingTime(levelNow(state), rng);
  }
  return state;
}
