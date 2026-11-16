// Casual bot of « Armée de Poche » (docs/PRD.md AC-86): takes the better gate of each pair 3 times in 4 (seeded,
// ties: left), the worse one otherwise; it steers to that lane at once, then walks to the pair (no lookahead).
import type { UpgradeLevels } from '../contract';
import { createRng } from '../rng';
import { applyGate, ArmyState, createArmy, reduceArmy, Side } from './engine';

export const BOT_BETTER_CHANCE = 0.75;

export function botSide(state: ArmyState, roll: number): Side {
  const [left, right] = state.pairs[state.pair];
  const betterLeft = applyGate(left, state.army) >= applyGate(right, state.army);
  const takeBetter = roll < BOT_BETTER_CHANCE;
  return betterLeft === takeBetter ? 'left' : 'right';
}

/** Plays a whole round; returns the final state. */
export function playArmyBot(seed: number, upgrades: UpgradeLevels = {}): ArmyState {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  let state = createArmy(seed, upgrades);
  for (let guard = 0; state.status === 'playing' && guard < 1000; guard++) {
    state = reduceArmy(state, { type: 'steer', side: botSide(state, rng.next()) });
    state = reduceArmy(state, { type: 'tick', dt: state.approachMs });
  }
  return state;
}
